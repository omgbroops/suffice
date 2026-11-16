mod live_runs;
mod receipt_writer;

use napi::bindgen_prelude::{Buffer, Either};
use napi::{Env, Error, JsObject, Result};
use napi_derive::napi;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use suffice_session::persistent::PersistentReader;

static READERS: AtomicUsize = AtomicUsize::new(0);
const MAX_READERS: usize = 32;
const MAX_REQUEST: usize = 64 * 1024;
type Resolve = Box<dyn FnOnce(Env) -> Result<()> + Send>;
type CloseDeferred = napi::JsDeferred<(), Resolve>;
struct Shared {
    reader: Mutex<PersistentReader>,
    busy: AtomicBool,
    revoked: AtomicBool,
    closing: Mutex<Option<Vec<CloseDeferred>>>,
    epoch: AtomicU64,
}
impl Drop for Shared {
    fn drop(&mut self) {
        READERS.fetch_sub(1, Ordering::SeqCst);
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Operation {
    List,
    ReadView,
    SourceInfo,
    SourceChunk,
    AcceptView,
    PrepareResume,
    Location,
    ReopenValidated,
}
#[napi]
pub struct PersistentSessionReader {
    shared: Arc<Shared>,
}
fn finish_close(
    shared: Arc<Shared>,
    deferred: CloseDeferred,
    result: std::result::Result<(), String>,
) {
    deferred.resolve(Box::new(move |_| {
        let waiters = shared
            .closing
            .try_lock()
            .map_err(|_| Error::from_reason("close state unavailable"))?
            .take()
            .unwrap_or_default();
        for waiter in waiters {
            match &result {
                Ok(()) => waiter.resolve(Box::new(|_| Ok(()))),
                Err(e) => waiter.reject(Error::from_reason(e.clone())),
            }
        }
        result.map_err(Error::from_reason)
    }));
}
#[napi]
impl PersistentSessionReader {
    #[napi(constructor)]
    pub fn new(root: String, catalog_limit: Option<u32>) -> Result<Self> {
        let root = PathBuf::from(root);
        let reader = match catalog_limit {
            Some(limit) => PersistentReader::with_catalog_limit(root, u64::from(limit)),
            None => PersistentReader::new(root),
        }
        .map_err(Error::from_reason)?;
        READERS
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| {
                (n < MAX_READERS).then_some(n + 1)
            })
            .map_err(|_| Error::from_reason("reader limit reached"))?;
        Ok(Self {
            shared: Arc::new(Shared {
                reader: Mutex::new(reader),
                busy: AtomicBool::new(false),
                revoked: AtomicBool::new(false),
                closing: Mutex::new(None),
                epoch: AtomicU64::new(0),
            }),
        })
    }
    #[napi]
    pub fn list(&self, env: Env) -> Result<JsObject> {
        self.run(env, None, Operation::List)
    }
    #[napi]
    pub fn read_view(&self, env: Env, request: String) -> Result<JsObject> {
        self.run(env, Some(request), Operation::ReadView)
    }
    #[napi]
    pub fn source_info(&self, env: Env, request: String) -> Result<JsObject> {
        self.run(env, Some(request), Operation::SourceInfo)
    }
    #[napi]
    pub fn source_chunk(&self, env: Env, request: String) -> Result<JsObject> {
        self.run(env, Some(request), Operation::SourceChunk)
    }
    #[napi]
    pub fn accept_view(&self, env: Env, request: String) -> Result<JsObject> {
        self.run(env, Some(request), Operation::AcceptView)
    }
    #[napi]
    pub fn prepare_resume(&self, env: Env, request: String) -> Result<JsObject> {
        self.run(env, Some(request), Operation::PrepareResume)
    }
    #[napi]
    pub fn location(&self, env: Env, request: String) -> Result<JsObject> {
        self.run(env, Some(request), Operation::Location)
    }
    #[napi]
    pub fn reopen_validated(&self, env: Env) -> Result<JsObject> {
        self.run(env, None, Operation::ReopenValidated)
    }
    #[napi]
    pub fn reopen(&self, env: Env) -> Result<JsObject> {
        let (deferred, promise) =
            env.create_deferred::<String, Box<dyn FnOnce(Env) -> Result<String> + Send>>()?;
        let closing = self
            .shared
            .closing
            .try_lock()
            .map_err(|_| Error::from_reason("close lock poisoned"))?;
        if closing.is_some() {
            deferred.reject(Error::from_reason("reader closing"));
            return Ok(promise);
        }
        if self.shared.busy.load(Ordering::SeqCst) {
            deferred.reject(Error::from_reason("reader busy"));
            return Ok(promise);
        }
        let mut reader = self
            .shared
            .reader
            .try_lock()
            .map_err(|_| Error::from_reason("reader lock poisoned"))?;
        reader.reopen();
        self.shared.epoch.fetch_add(1, Ordering::SeqCst);
        self.shared.revoked.store(false, Ordering::SeqCst);
        deferred.resolve(Box::new(|_| Ok("{}".to_string())));
        Ok(promise)
    }
    #[napi]
    pub fn close(&self, env: Env) -> Result<JsObject> {
        let (deferred, promise) = env.create_deferred::<(), Resolve>()?;
        self.shared.revoked.store(true, Ordering::SeqCst);
        self.shared.epoch.fetch_add(1, Ordering::SeqCst);
        let mut closing = self
            .shared
            .closing
            .try_lock()
            .map_err(|_| Error::from_reason("close state unavailable"))?;
        if let Some(waiters) = closing.as_mut() {
            waiters.push(deferred);
            return Ok(promise);
        }
        *closing = Some(Vec::new());
        drop(closing);
        let shared = self.shared.clone();
        let holder = Arc::new(Mutex::new(Some(deferred)));
        let worker_holder = holder.clone();
        let spawn = std::thread::Builder::new()
            .name("suffice-close".into())
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    suffice_session::persistent::close_recovering(&shared.reader);
                    Ok::<(), String>(())
                }))
                .unwrap_or_else(|_| Err("close panicked".into()));
                if let Some(deferred) = worker_holder.lock().ok().and_then(|mut d| d.take()) {
                    finish_close(shared, deferred, result);
                }
            });
        if let Err(e) = spawn {
            if let Some(deferred) = holder.try_lock().ok().and_then(|mut d| d.take()) {
                finish_close(
                    self.shared.clone(),
                    deferred,
                    Err(format!("close thread failed: {e}")),
                );
            }
        }
        Ok(promise)
    }
}
impl PersistentSessionReader {
    fn run(&self, env: Env, request: Option<String>, kind: Operation) -> Result<JsObject> {
        let (deferred, promise) =
            env.create_deferred::<Either<String, Buffer>, Box<dyn FnOnce(Env) -> Result<Either<String, Buffer>> + Send>>()?;
        if kind == Operation::ReopenValidated {
            if self
                .shared
                .closing
                .try_lock()
                .map_err(|_| Error::from_reason("close state unavailable"))?
                .is_some()
            {
                deferred.reject(Error::from_reason("reader closing"));
                return Ok(promise);
            }
        } else if self.shared.revoked.load(Ordering::SeqCst) {
            deferred.reject(Error::from_reason("reader closed"));
            return Ok(promise);
        }
        if self
            .shared
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            deferred.reject(Error::from_reason("reader busy"));
            return Ok(promise);
        }
        if request.as_ref().is_some_and(|r| r.len() > MAX_REQUEST) {
            self.shared.busy.store(false, Ordering::SeqCst);
            deferred.reject(Error::from_reason("request byte limit exceeded"));
            return Ok(promise);
        }
        let epoch = if matches!(kind, Operation::PrepareResume | Operation::ReopenValidated) {
            // Resume consumes this reader at admission, not when its worker
            // eventually runs. Earlier queued JS completions must be canceled.
            self.shared.revoked.store(true, Ordering::SeqCst);
            self.shared.epoch.fetch_add(1, Ordering::SeqCst) + 1
        } else {
            self.shared.epoch.load(Ordering::SeqCst)
        };
        let shared = self.shared.clone();
        let deferred_holder = Arc::new(Mutex::new(Some(deferred)));
        let thread_deferred = deferred_holder.clone();
        let spawn = std::thread::Builder::new()
            .name("suffice-read".into())
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(
                    || -> std::result::Result<Either<String, Vec<u8>>, String> {
                        let mut reader = shared
                            .reader
                            .lock()
                            .map_err(|_| "reader lock poisoned".to_string())?;
                        if shared.epoch.load(Ordering::SeqCst) != epoch
                            || (!matches!(
                                kind,
                                Operation::PrepareResume | Operation::ReopenValidated
                            ) && shared.revoked.load(Ordering::SeqCst))
                        {
                            if kind == Operation::PrepareResume {
                                reader.close();
                            }
                            return Err("reader closed".into());
                        }
                        let operation = match kind {
                            Operation::List => reader.list().map(Either::A),
                            Operation::ReadView
                            | Operation::SourceInfo
                            | Operation::SourceChunk
                            | Operation::AcceptView
                            | Operation::Location
                            | Operation::PrepareResume => {
                                let req: serde_json::Value =
                                    match serde_json::from_str(request.as_deref().unwrap_or("")) {
                                        Ok(value) => value,
                                        Err(error) => {
                                            if kind == Operation::PrepareResume {
                                                reader.close();
                                            }
                                            return Err(error.to_string());
                                        }
                                    };
                                if kind == Operation::ReadView {
                                    reader.read_view(&req).map(Either::A)
                                } else if kind == Operation::SourceInfo {
                                    reader.source_info(&req).map(Either::A)
                                } else if kind == Operation::SourceChunk {
                                    reader.source_chunk(&req).map(Either::B)
                                } else if kind == Operation::AcceptView {
                                    reader.accept_view(&req).map(Either::A)
                                } else if kind == Operation::Location {
                                    reader.location(&req).map(Either::A)
                                } else {
                                    let result = reader.prepare_resume(&req);
                                    reader.close();
                                    result.map(Either::A)
                                }
                            }
                            Operation::ReopenValidated => {
                                reader.reopen_validated()?;
                                Ok(Either::A(serde_json::json!({})))
                            }
                        };
                        if kind != Operation::PrepareResume && reader.is_closed() {
                            shared.revoked.store(true, Ordering::SeqCst);
                            shared.epoch.fetch_add(1, Ordering::SeqCst);
                        }
                        let value = operation?;
                        if kind == Operation::PrepareResume {
                            shared.revoked.store(true, Ordering::SeqCst);
                        }
                        if !matches!(kind, Operation::PrepareResume | Operation::ReopenValidated)
                            && shared.revoked.load(Ordering::SeqCst)
                        {
                            return Err("reader closed".into());
                        }
                        let mut value = match value {
                            Either::A(json) => json,
                            Either::B(bytes) => return Ok(Either::B(bytes)),
                        };
                        suffice_session::javascript_json_order(&mut value);
                        let mut writer = BoundedWriter(Vec::new());
                        suffice_session::write_js_json(&mut writer, &value, false)
                            .map_err(|e| e.to_string())?;
                        String::from_utf8(writer.0)
                            .map(Either::A)
                            .map_err(|e| e.to_string())
                    },
                ))
                .unwrap_or_else(|_| {
                    shared.revoked.store(true, Ordering::SeqCst);
                    shared.epoch.fetch_add(1, Ordering::SeqCst);
                    suffice_session::persistent::close_recovering(&shared.reader);
                    Err("reader operation panicked".into())
                });
                shared.busy.store(false, Ordering::SeqCst);
                if let Some(deferred) = thread_deferred.lock().ok().and_then(|mut d| d.take()) {
                    match result {
                        Ok(s) => {
                            let on_js = shared.clone();
                            deferred.resolve(Box::new(move |_| {
                                if on_js.epoch.load(Ordering::SeqCst) != epoch {
                                    Err(Error::from_reason("reader closed"))
                                } else {
                                    if kind == Operation::ReopenValidated {
                                        on_js.revoked.store(false, Ordering::SeqCst);
                                    }
                                    Ok(match s {
                                        Either::A(json) => Either::A(json),
                                        Either::B(bytes) => Either::B(bytes.into()),
                                    })
                                }
                            }));
                        }
                        Err(e) => deferred.reject(Error::from_reason(e)),
                    }
                }
            });
        if let Err(e) = spawn {
            self.shared.busy.store(false, Ordering::SeqCst);
            if kind == Operation::PrepareResume {
                match self.shared.reader.try_lock() {
                    Ok(mut reader) => reader.close(),
                    Err(std::sync::TryLockError::Poisoned(error)) => {
                        error.into_inner().close();
                        self.shared.reader.clear_poison();
                    }
                    Err(std::sync::TryLockError::WouldBlock) => {}
                }
            }
            if let Some(deferred) = deferred_holder.lock().ok().and_then(|mut d| d.take()) {
                deferred.reject(Error::from_reason(format!("read thread failed: {e}")));
            }
        }
        Ok(promise)
    }
}

struct BoundedWriter(Vec<u8>);
impl std::io::Write for BoundedWriter {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        if self.0.len().saturating_add(data.len()) > 128 * 1024 * 1024 {
            return Err(std::io::Error::other("output byte limit exceeded"));
        }
        self.0.extend_from_slice(data);
        Ok(data.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
