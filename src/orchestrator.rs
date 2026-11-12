//! Ties queue, sessions, gate, adapters and pool together. Second wave: built after the others.

use crate::adapter;
use crate::gate::{self, Verdict};
use crate::json::{self, Value};
use crate::pool::{Pool, PoolMsg};
use crate::queue::Queue;
use crate::session::{Session, Sessions};
use crate::types::{now_ms, AgentKind, Event, Logged, Task, TaskId, TaskState};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant};

/// An approved tool call: (task, tool name, input). Allowed once on rerun.
type Call = (TaskId, String, String);

struct Run {
    task: TaskId,
    agent: AgentKind,
    session: Option<String>,
    error: bool,
}

pub struct Engine {
    dir: PathBuf,
    queue: Queue,
    sessions: Sessions,
    pool: Pool,
    rx: Receiver<PoolMsg>,
    max_parallel: usize,
    file: File,
    seq: u64,
    events: Vec<Logged>,
    subs: Vec<Sender<Logged>>,
    runs: HashMap<String, Run>,
    /// Killed runs (held or cancelled) still alive until their Exited arrives; their session stays claimed.
    zombies: HashMap<String, Run>,
    approved: BTreeSet<TaskId>,
    calls: BTreeSet<Call>,
    /// Last tool call that held each task, moved into `calls` by approve().
    held: HashMap<TaskId, (String, String)>,
    /// Program name -> path override, e.g. "claude" -> a custom install path.
    pub programs: BTreeMap<String, PathBuf>,
}

impl Engine {
    pub fn open(dir: &Path, max_parallel: usize) -> io::Result<Engine> {
        fs::create_dir_all(dir)?;
        let queue = Queue::open(dir)?;
        let sessions = Sessions::open(dir)?;
        let path = dir.join("events.jsonl");
        let (events, good) = read_log(&path)?;
        let size = fs::metadata(&path).map(|m| m.len() as usize).unwrap_or(0);
        if good < size {
            // torn tail from a crash mid-write: drop it so the next append starts a clean line
            OpenOptions::new().write(true).open(&path)?.set_len(good as u64)?;
        }
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let (approved, calls, held) = load_approvals(dir)?;
        let (tx, rx) = channel();
        Ok(Engine {
            dir: dir.to_path_buf(),
            queue,
            sessions,
            pool: Pool::new(max_parallel, tx),
            rx,
            max_parallel,
            file,
            seq: events.last().map_or(0, |l| l.seq),
            events,
            subs: vec![],
            runs: HashMap::new(),
            zombies: HashMap::new(),
            approved,
            calls,
            held,
            programs: BTreeMap::new(),
        })
    }

    pub fn set_program(&mut self, name: &str, path: impl Into<PathBuf>) {
        self.programs.insert(name.to_string(), path.into());
    }

    pub fn submit(&mut self, task: Task) -> Result<(), String> {
        self.queue.submit(task)
    }

    pub fn approve(&mut self, id: &str) -> Result<(), String> {
        match self.queue.get(id).map(|t| &t.state) {
            Some(TaskState::NeedsApproval { .. }) => {}
            Some(_) => return Err(format!("task '{id}' is not waiting for approval")),
            None => return Err(format!("no task '{id}'")),
        }
        self.approved.insert(id.to_string());
        if let Some((name, input)) = self.held.remove(id) {
            self.calls.insert((id.to_string(), name, input));
        }
        self.save_approvals().map_err(|e| e.to_string())?;
        self.set_state(id, TaskState::Ready)
    }

    /// Move a task to `state` and log the change.
    fn set_state(&mut self, id: &str, state: TaskState) -> Result<(), String> {
        let reason = match &state {
            TaskState::NeedsApproval { reason } => Some(reason.clone()),
            TaskState::Failed { error } => Some(error.clone()),
            _ => None,
        };
        let name = state.name().to_string();
        self.queue.set_state(id, state)?;
        self.log(id, Event::State { state: name, reason });
        Ok(())
    }

    /// Re-queue a failed or cancelled task.
    pub fn retry(&mut self, id: &str) -> Result<(), String> {
        match self.queue.get(id).map(|t| &t.state) {
            Some(TaskState::Failed { .. } | TaskState::Cancelled) => self.set_state(id, TaskState::Ready),
            Some(_) => Err(format!("task '{id}' is not failed or cancelled")),
            None => Err(format!("no task '{id}'")),
        }
    }

    pub fn cancel(&mut self, id: &str) -> Result<(), String> {
        let attempts = self.queue.get(id).ok_or(format!("no task '{id}'"))?.attempts;
        let run = run_id(id, attempts);
        if let Some(r) = self.runs.remove(&run) {
            self.pool.kill(&run);
            self.zombies.insert(run, r);
        }
        self.set_state(id, TaskState::Cancelled)
    }

    pub fn sessions(&self) -> Vec<Session> {
        self.sessions.all().into_iter().cloned().collect()
    }

    pub fn running(&self) -> usize {
        self.pool.running()
    }

    pub fn max_parallel(&self) -> usize {
        self.max_parallel
    }

    /// The last tool call that held `task` for approval: (name, input).
    pub fn held_call(&self, task: &str) -> Option<(String, String)> {
        self.held.get(task).cloned()
    }

    pub fn tasks(&self) -> Vec<Task> {
        self.queue.all().into_iter().cloned().collect()
    }

    pub fn events_since(&self, seq: u64) -> Vec<Logged> {
        self.events.iter().filter(|l| l.seq > seq).cloned().collect()
    }

    pub fn subscribe(&mut self) -> Receiver<Logged> {
        let (tx, rx) = channel();
        self.subs.push(tx);
        rx
    }

    /// Start every Ready task that fits the pool. Non-blocking.
    pub fn tick(&mut self) {
        for id in self.queue.ready() {
            if self.pool.running() >= self.max_parallel {
                break;
            }
            let Some(task) = self.queue.get(&id).cloned() else { continue };
            let run = run_id(&id, task.attempts);
            if self.runs.contains_key(&run) || self.zombies.contains_key(&run) {
                continue; // started, or killed but not yet exited (still holds the session)
            }
            if !self.approved.contains(&id) {
                if let Verdict::Hold { reason } = gate::check_task(&task) {
                    let _ = self.set_state(&id, TaskState::NeedsApproval { reason });
                    continue;
                }
            }
            let resume = match &task.session_key {
                Some(k) => {
                    if !self.sessions.claim(k, &task.agent, &id) {
                        continue;
                    }
                    self.sessions.get(k).and_then(|s| s.native_id.clone())
                }
                None => None,
            };
            let mut cmd = adapter::command(&task, resume.as_deref());
            if let Some(p) = self.programs.get(&cmd.program) {
                cmd.program = p.to_string_lossy().into_owned();
            }
            if !self.pool.try_start(&run, cmd, task.timeout_secs) {
                if let Some(k) = &task.session_key {
                    self.sessions.release(k, &id);
                }
                break;
            }
            let session = task.session_key.clone();
            self.runs.insert(run, Run { task: id.clone(), agent: task.agent.clone(), session, error: false });
        }
    }

    /// Handle pool messages for up to `timeout`. Blocks on the channel; does not spin.
    pub fn pump(&mut self, timeout: Duration) {
        if let Ok(m) = self.rx.recv_timeout(timeout) {
            self.handle(m);
            while let Ok(m) = self.rx.try_recv() {
                self.handle(m);
            }
        }
    }

    /// Tick and pump until no task is Pending, Ready or Running, or `max` elapses.
    pub fn run_until_idle(&mut self, max: Duration) {
        let end = Instant::now() + max;
        loop {
            self.tick();
            let busy = self.queue.all().iter().any(|t| {
                matches!(t.state, TaskState::Pending | TaskState::Ready | TaskState::Running { .. })
            });
            if !busy || Instant::now() >= end {
                break;
            }
            self.pump(Duration::from_millis(200));
        }
    }

    fn handle(&mut self, msg: PoolMsg) {
        match msg {
            PoolMsg::Started { run, pid } => {
                if let Some(task) = self.runs.get(&run).map(|r| r.task.clone()) {
                    let _ = self.set_state(&task, TaskState::Running { pid });
                }
            }
            PoolMsg::Stdout { run, line } => {
                if let Some(r) = self.runs.get(&run) {
                    let agent = r.agent.clone();
                    for ev in adapter::parse_line(&agent, &line) {
                        self.on_event(&run, ev);
                    }
                }
            }
            PoolMsg::Stderr { run, line } => self.on_event(&run, Event::Stderr { line }),
            PoolMsg::Exited { run, code, timed_out, killed } => {
                if let Some(r) = self.zombies.remove(&run) {
                    if let Some(k) = &r.session {
                        self.sessions.release(k, &r.task);
                    }
                    self.log(&r.task, Event::Exit { code });
                    return;
                }
                let Some(r) = self.runs.remove(&run) else { return };
                if let Some(k) = &r.session {
                    self.sessions.release(k, &r.task);
                }
                self.log(&r.task, Event::Exit { code });
                let state = if code == Some(0) && !r.error && !killed && !timed_out {
                    TaskState::Done
                } else {
                    let error = if timed_out {
                        "timed out".to_string()
                    } else if killed {
                        "killed".to_string()
                    } else if r.error {
                        "agent reported an error".to_string()
                    } else {
                        format!("exit {}", code.map_or("by signal".to_string(), |c| c.to_string()))
                    };
                    TaskState::Failed { error }
                };
                // Invalid transitions (cancelled or held runs) are expected here and ignored.
                let _ = self.set_state(&r.task, state);
            }
            PoolMsg::SpawnFailed { run, error } => {
                if let Some(r) = self.runs.remove(&run) {
                    if let Some(k) = &r.session {
                        self.sessions.release(k, &r.task);
                    }
                    let _ = self.set_state(&r.task, TaskState::Failed { error });
                }
            }
        }
    }

    fn on_event(&mut self, run: &str, ev: Event) {
        let Some(r) = self.runs.get_mut(run) else { return };
        if matches!(ev, Event::Result { is_error: true, .. }) {
            r.error = true;
        }
        let (task, session) = (r.task.clone(), r.session.clone());
        if let (Event::Session { native_id }, Some(k)) = (&ev, &session) {
            self.sessions.set_native(k, native_id);
        }
        let mut hold = None;
        if let Event::ToolCall { name, input } = &ev {
            if self.is_running(&task) {
                if let Verdict::Hold { reason } = gate::check_event(&ev) {
                    let call = (task.clone(), name.clone(), input.clone());
                    if self.calls.remove(&call) {
                        let _ = self.save_approvals();
                    } else {
                        hold = Some((reason, call));
                    }
                }
            }
        }
        self.log(&task, ev);
        if let Some((reason, (_, name, input))) = hold {
            if let Some(r) = self.runs.remove(run) {
                self.pool.kill(run);
                self.zombies.insert(run.to_string(), r);
            }
            self.held.insert(task.clone(), (name, input));
            let _ = self.save_approvals();
            let _ = self.set_state(&task, TaskState::NeedsApproval { reason });
        }
    }

    fn is_running(&self, task: &str) -> bool {
        matches!(self.queue.get(task).map(|t| &t.state), Some(TaskState::Running { .. }))
    }

    fn log(&mut self, task: &str, event: Event) {
        self.seq += 1;
        let l = Logged { seq: self.seq, task: task.to_string(), ms: now_ms(), event };
        // shortcut: log write errors are dropped like session save errors; one write call per line
        let _ = self.file.write_all(format!("{}\n", logged_json(&l)).as_bytes());
        self.subs.retain(|s| s.send(l.clone()).is_ok());
        self.events.push(l);
    }

    fn save_approvals(&self) -> io::Result<()> {
        let tasks = Value::Arr(self.approved.iter().map(|t| Value::str(t)).collect());
        let calls = Value::Arr(
            self.calls
                .iter()
                .map(|(t, n, i)| Value::Arr(vec![Value::str(t), Value::str(n), Value::str(i)]))
                .collect(),
        );
        let held = Value::Arr(
            self.held
                .iter()
                .map(|(t, (n, i))| Value::Arr(vec![Value::str(t), Value::str(n), Value::str(i)]))
                .collect(),
        );
        let v = Value::Obj(vec![("tasks".into(), tasks), ("calls".into(), calls), ("held".into(), held)]);
        let tmp = self.dir.join("approvals.json.tmp");
        fs::write(&tmp, format!("{v}\n"))?;
        fs::rename(tmp, self.dir.join("approvals.json"))
    }
}

fn run_id(task: &str, attempts: u32) -> String {
    format!("{task}#{attempts}")
}

fn bad(e: impl std::fmt::Display) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, e.to_string())
}

fn load_approvals(dir: &Path) -> io::Result<(BTreeSet<TaskId>, BTreeSet<Call>, HashMap<TaskId, (String, String)>)> {
    let text = match fs::read_to_string(dir.join("approvals.json")) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Default::default()),
        Err(e) => return Err(e),
    };
    let v = json::parse(&text).map_err(|e| bad(format!("approvals.json: {e}")))?;
    let mut approved = BTreeSet::new();
    let mut calls = BTreeSet::new();
    let mut held = HashMap::new();
    for t in v.get("tasks").and_then(Value::as_arr).unwrap_or(&[]) {
        approved.insert(t.as_str().ok_or_else(|| bad("approvals.json: task id"))?.to_string());
    }
    for c in v.get("calls").and_then(Value::as_arr).unwrap_or(&[]) {
        let (t, n, i) = call_triple(c)?;
        calls.insert((t, n, i));
    }
    for c in v.get("held").and_then(Value::as_arr).unwrap_or(&[]) {
        let (t, n, i) = call_triple(c)?;
        held.insert(t, (n, i));
    }
    Ok((approved, calls, held))
}

fn call_triple(c: &Value) -> io::Result<(String, String, String)> {
    let s = |x: &Value| x.as_str().map(str::to_string).ok_or_else(|| bad("approvals.json: call"));
    match c.as_arr() {
        Some([t, n, i]) => Ok((s(t)?, s(n)?, s(i)?)),
        _ => Err(bad("approvals.json: call")),
    }
}

/// Replays events.jsonl. Returns the events and the byte length of the valid prefix.
fn read_log(path: &Path) -> io::Result<(Vec<Logged>, usize)> {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok((vec![], 0)),
        Err(e) => return Err(e),
    };
    let mut out = vec![];
    let mut good = 0;
    for line in text.split_inclusive('\n') {
        if !line.ends_with('\n') {
            break; // torn tail
        }
        let l = json::parse(line.trim_end())
            .and_then(|v| logged_from(&v))
            .map_err(|e| bad(format!("events.jsonl: {e}")))?;
        out.push(l);
        good += line.len();
    }
    Ok((out, good))
}

fn sval(v: &Value, k: &str) -> Result<String, String> {
    v.get(k).and_then(Value::as_str).map(str::to_string).ok_or_else(|| format!("missing {k}"))
}

fn num(v: &Value, k: &str) -> Option<f64> {
    match v.get(k) {
        Some(Value::Num(n)) => Some(*n),
        _ => None,
    }
}

fn flag(v: &Value, k: &str) -> bool {
    v.get(k) == Some(&Value::Bool(true))
}

pub fn logged_json(l: &Logged) -> Value {
    let (ty, fields) = match &l.event {
        Event::Session { native_id } => ("session", vec![("native_id", Value::str(native_id))]),
        Event::Text { text } => ("text", vec![("text", Value::str(text))]),
        Event::ToolCall { name, input } => ("tool_call", vec![("name", Value::str(name)), ("input", Value::str(input))]),
        Event::ToolResult { name, output, is_error } => (
            "tool_result",
            vec![("name", Value::str(name)), ("output", Value::str(output)), ("is_error", Value::Bool(*is_error))],
        ),
        Event::Usage { input_tokens, output_tokens, cost_usd } => (
            "usage",
            vec![
                ("input_tokens", Value::Num(*input_tokens as f64)),
                ("output_tokens", Value::Num(*output_tokens as f64)),
                ("cost_usd", cost_usd.map_or(Value::Null, Value::Num)),
            ],
        ),
        Event::Result { text, is_error } => ("result", vec![("text", Value::str(text)), ("is_error", Value::Bool(*is_error))]),
        Event::Raw { line } => ("raw", vec![("line", Value::str(line))]),
        Event::Stderr { line } => ("stderr", vec![("line", Value::str(line))]),
        Event::Exit { code } => ("exit", vec![("code", code.map_or(Value::Null, |c| Value::Num(c as f64)))]),
        Event::State { state, reason } => {
            ("state", vec![("state", Value::str(state)), ("reason", reason.as_deref().map_or(Value::Null, Value::str))])
        }
    };
    let mut o = vec![
        ("seq".to_string(), Value::Num(l.seq as f64)),
        ("task".to_string(), Value::str(&l.task)),
        ("ms".to_string(), Value::Num(l.ms as f64)),
        ("type".to_string(), Value::str(ty)),
    ];
    o.extend(fields.into_iter().map(|(k, v)| (k.to_string(), v)));
    Value::Obj(o)
}

fn logged_from(v: &Value) -> Result<Logged, String> {
    let event = match sval(v, "type")?.as_str() {
        "session" => Event::Session { native_id: sval(v, "native_id")? },
        "text" => Event::Text { text: sval(v, "text")? },
        "tool_call" => Event::ToolCall { name: sval(v, "name")?, input: sval(v, "input")? },
        "tool_result" => Event::ToolResult {
            name: sval(v, "name")?,
            output: sval(v, "output")?,
            is_error: flag(v, "is_error"),
        },
        "usage" => Event::Usage {
            input_tokens: num(v, "input_tokens").unwrap_or(0.0) as u64,
            output_tokens: num(v, "output_tokens").unwrap_or(0.0) as u64,
            cost_usd: num(v, "cost_usd"),
        },
        "result" => Event::Result { text: sval(v, "text")?, is_error: flag(v, "is_error") },
        "raw" => Event::Raw { line: sval(v, "line")? },
        "stderr" => Event::Stderr { line: sval(v, "line")? },
        "exit" => Event::Exit { code: num(v, "code").map(|c| c as i32) },
        "state" => Event::State {
            state: sval(v, "state")?,
            reason: v.get("reason").and_then(Value::as_str).map(str::to_string),
        },
        other => return Err(format!("unknown event '{other}'")),
    };
    Ok(Logged {
        seq: num(v, "seq").ok_or("missing seq")? as u64,
        task: sval(v, "task")?,
        ms: num(v, "ms").unwrap_or(0.0) as u64,
        event,
    })
}
