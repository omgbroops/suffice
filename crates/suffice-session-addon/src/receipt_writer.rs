use napi::{
    bindgen_prelude::ObjectFinalize, Env, Error, JsDeferred, JsObject, JsString, Ref, Result, Task,
};
use napi_derive::napi;
use std::{
    collections::VecDeque,
    panic::{catch_unwind, AssertUnwindSafe},
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use suffice_receipt::{Receipt, MAX_PAGE_BYTES};

type Outcome = std::result::Result<(), String>;
type Deferred = JsDeferred<(), Box<dyn FnOnce(Env) -> Result<()> + Send>>;
const MAX_WRITERS: usize = 32;
static ACTIVE_WRITERS: AtomicUsize = AtomicUsize::new(0);

struct Permit;
impl Permit {
    fn acquire() -> Result<Self> {
        ACTIVE_WRITERS
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                (n < MAX_WRITERS).then_some(n + 1)
            })
            .map_err(|_| Error::from_reason("Active receipt writer limit reached"))?;
        Ok(Self)
    }
}
impl Drop for Permit {
    fn drop(&mut self) {
        ACTIVE_WRITERS.fetch_sub(1, Ordering::AcqRel);
    }
}

const MAX_PENDING: usize = 32;
// These are queued UTF-8 payload bytes. The caller's JS string, temporary
// UTF-16 copy (up to about 2 MiB per conversion), promise/queue bookkeeping
// and allocator overhead are additional. They are not an RSS limit.
const MAX_PENDING_BYTES: usize = 4 * MAX_PAGE_BYTES;

#[napi]
pub fn receipt_writer_protocol_version() -> u32 {
    1
}

enum Operation {
    Append(String, bool),
    Flush,
    Close,
    Abandoned(String),
}
struct Job {
    op: Operation,
    size: usize,
    done: Deferred,
}

#[derive(Default)]
struct Queue {
    jobs: VecDeque<Job>,
    scheduled: bool,
    closing: bool,
    pending: usize,
    pending_bytes: usize,
    open_prefix: bool,
    abandoned: Option<String>,
    finished: Option<Outcome>,
    permit: Option<Permit>,
}

impl Queue {
    fn reject_page(&mut self, done: Deferred, error: Error) {
        // A previously admitted prefix may still be in flight. Drain it;
        // do not allow the next independent event to complete its torn record.
        if self.open_prefix && self.abandoned.is_none() {
            self.abandoned = Some(error.reason.clone());
        }
        done.reject(error);
    }
}

struct Disk {
    location: Option<(PathBuf, String)>,
    writer: Option<Receipt>,
    finished: Option<Outcome>,
}
impl Disk {
    fn issue(&mut self, op: Operation) -> Outcome {
        if let Some(result) = &self.finished {
            return result.clone();
        }
        if let Some((home, name)) = self.location.take() {
            match Receipt::open(&home, &name) {
                Ok(writer) => self.writer = Some(writer),
                Err(error) => {
                    let result = Err(error.to_string());
                    self.finished = Some(result.clone());
                    return result;
                }
            }
        }
        let writer = self.writer.as_mut().ok_or("Receipt writer closed")?;
        let abandoned = matches!(op, Operation::Abandoned(_));
        let result = match op {
            Operation::Append(page, final_page) => writer
                .append(page.as_bytes(), final_page)
                .map_err(|e| e.to_string()),
            Operation::Flush => writer.flush().map_err(|e| e.to_string()),
            Operation::Abandoned(reason) => Err(reason),
            Operation::Close => {
                let result = self
                    .writer
                    .take()
                    .unwrap()
                    .close()
                    .map_err(|e| e.to_string());
                self.finished = Some(result.clone());
                return result;
            }
        };
        if writer.has_terminal_fault() || abandoned {
            self.writer = None;
            self.finished = Some(result.clone());
        }
        result
    }
}

struct Shared {
    queue: Mutex<Queue>,
    disk: Mutex<Disk>,
}
struct Drain(Arc<Shared>);

fn complete(shared: &Arc<Shared>, done: Deferred, size: usize, result: Outcome) {
    let shared = shared.clone();
    done.resolve(Box::new(move |_| {
        // Count operations through delivery on the JS thread, even when its
        // event loop is busy and the filesystem is faster than its consumer.
        let mut q = shared.queue.lock().unwrap_or_else(|p| p.into_inner());
        q.pending -= 1;
        q.pending_bytes -= size;
        if q.pending == 0 && q.finished.is_some() {
            q.permit.take();
        }
        result.map_err(Error::from_reason)
    }));
}
impl Task for Drain {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> Result<()> {
        loop {
            let job = {
                let mut q = self.0.queue.lock().unwrap_or_else(|p| p.into_inner());
                match q.jobs.pop_front() {
                    Some(job) => job,
                    None => {
                        q.scheduled = false;
                        return Ok(());
                    }
                }
            };
            let (result, finished) = catch_unwind(AssertUnwindSafe(|| {
                let mut disk = self.0.disk.lock().unwrap_or_else(|p| p.into_inner());
                let result = disk.issue(job.op);
                (result, disk.finished.clone())
            }))
            .unwrap_or_else(|_| {
                let mut disk = self.0.disk.lock().unwrap_or_else(|p| p.into_inner());
                disk.writer = None;
                disk.location = None;
                let error = Err("Receipt writer failed and was closed".to_owned());
                disk.finished = Some(error.clone());
                (error, disk.finished.clone())
            });
            if finished.is_some() {
                self.0
                    .queue
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .finished = finished;
            }
            complete(&self.0, job.done, job.size, result);
        }
    }
    fn resolve(&mut self, _env: Env, _value: ()) -> Result<()> {
        Ok(())
    }
}

#[napi(custom_finalize)]
pub struct ReceiptWriter {
    shared: Arc<Shared>,
    close_promise: Option<Ref<()>>,
}
impl ObjectFinalize for ReceiptWriter {
    fn finalize(mut self, env: Env) -> Result<()> {
        if let Some(mut promise) = self.close_promise.take() {
            promise.unref(env)?;
        }
        Ok(())
    }
}

enum Input {
    Append(JsString, bool),
    Flush,
    Close,
}

impl ReceiptWriter {
    fn enqueue(&self, env: Env, input: Input) -> Result<JsObject> {
        let (done, promise) =
            env.create_deferred::<(), Box<dyn FnOnce(Env) -> Result<()> + Send>>()?;
        let mut q = self.shared.queue.lock().unwrap_or_else(|p| p.into_inner());
        if matches!(input, Input::Append(..)) && q.closing {
            done.reject(Error::from_reason("Receipt writer closed"));
            return Ok(promise);
        }
        if let Some(result) = &q.finished {
            // A terminal writer cannot admit more data. Finalized controls
            // can complete without a new libuv worker once deliveries drain.
            if matches!(input, Input::Append(..)) || q.pending == 0 {
                let result = result.clone();
                done.resolve(Box::new(move |_| result.map_err(Error::from_reason)));
                return Ok(promise);
            }
        }
        let first_close = matches!(input, Input::Close) && !q.closing;
        if q.pending >= MAX_PENDING && !first_close {
            let error = Error::from_reason("Receipt queue limit reached");
            if matches!(input, Input::Append(..)) {
                q.reject_page(done, error);
            } else {
                done.reject(error);
            }
            return Ok(promise);
        }
        let (op, size) = match input {
            Input::Append(value, final_page) => {
                if let Some(reason) = &q.abandoned {
                    done.reject(Error::from_reason(reason.clone()));
                    return Ok(promise);
                }
                let prepare = || -> Result<(String, usize)> {
                    let size = value.utf8_len()?;
                    if size == 0 || size > MAX_PAGE_BYTES {
                        return Err(Error::from_reason("Invalid receipt page size"));
                    }
                    if size > MAX_PENDING_BYTES - q.pending_bytes {
                        return Err(Error::from_reason("Receipt queue byte limit reached"));
                    }
                    Ok((value.into_utf16()?.as_str()?, size))
                };
                let (text, size) = match prepare() {
                    Ok(data) => data,
                    Err(error) => {
                        q.reject_page(done, error);
                        return Ok(promise);
                    }
                };
                q.open_prefix = !final_page;
                (Operation::Append(text, final_page), size)
            }
            Input::Flush => (
                q.abandoned
                    .clone()
                    .map_or(Operation::Flush, Operation::Abandoned),
                0,
            ),
            Input::Close => {
                q.closing = true;
                (
                    q.abandoned
                        .clone()
                        .map_or(Operation::Close, Operation::Abandoned),
                    0,
                )
            }
        };
        q.pending += 1;
        q.pending_bytes += size;
        q.jobs.push_back(Job { op, size, done });
        if !q.scheduled {
            q.scheduled = true;
            if let Err(error) = env.spawn(Drain(self.shared.clone())) {
                // No worker was launched; reject every accepted operation and
                // release the directory/file capabilities without replaying.
                q.scheduled = false;
                q.closing = true;
                let job_error = Err(format!("Could not schedule receipt I/O: {error}"));
                let mut disk = self.shared.disk.lock().unwrap_or_else(|p| p.into_inner());
                disk.writer = None;
                disk.location = None;
                disk.finished = Some(job_error.clone());
                q.finished = Some(job_error.clone());
                drop(disk);
                let pending = std::mem::take(&mut q.jobs);
                drop(q);
                for job in pending {
                    complete(&self.shared, job.done, job.size, job_error.clone());
                }
            }
        }
        Ok(promise)
    }
}

#[napi]
impl ReceiptWriter {
    #[napi(constructor)]
    pub fn new(home: JsString, filename: JsString) -> Result<Self> {
        if home.utf16_len()? > 32_768 || filename.utf16_len()? > 64 {
            return Err(Error::from_reason("Invalid receipt home or filename"));
        }
        let home = home.into_utf16()?.as_str()?;
        let filename = filename.into_utf16()?.as_str()?;
        let path = PathBuf::from(home);
        Receipt::validate_location(&path, &filename)
            .map_err(|e| Error::from_reason(e.to_string()))?;
        let permit = Permit::acquire()?;
        // Acquire all filesystem capabilities on the libuv drain worker.
        Ok(Self {
            close_promise: None,
            shared: Arc::new(Shared {
                queue: Mutex::new(Queue {
                    permit: Some(permit),
                    ..Queue::default()
                }),
                disk: Mutex::new(Disk {
                    location: Some((path, filename)),
                    writer: None,
                    finished: None,
                }),
            }),
        })
    }
    #[napi(getter)]
    pub fn version(&self) -> u32 {
        receipt_writer_protocol_version()
    }
    #[napi]
    pub fn append_page(
        &self,
        env: Env,
        page: JsString,
        final_page: Option<bool>,
    ) -> Result<JsObject> {
        self.enqueue(env, Input::Append(page, final_page.unwrap_or(true)))
    }
    #[napi]
    pub fn flush(&self, env: Env) -> Result<JsObject> {
        if let Some(promise) = &self.close_promise {
            return env.get_reference_value(promise);
        }
        self.enqueue(env, Input::Flush)
    }
    #[napi]
    pub fn close(&mut self, env: Env) -> Result<JsObject> {
        // All callers receive one JS Promise. Repeated closes consume neither
        // queue capacity nor additional native waiters, including after failure.
        if let Some(promise) = &self.close_promise {
            return env.get_reference_value(promise);
        }
        let promise = self.enqueue(env, Input::Close)?;
        let reference = env.create_reference(promise)?;
        self.close_promise = Some(reference);
        env.get_reference_value(self.close_promise.as_ref().unwrap())
    }
}
