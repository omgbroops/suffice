//! Durable task queue: an append-only JSONL journal in the data dir, replayed on start, so a crash
//! or reboot loses nothing. Owns task state transitions and dependency order.
use crate::json::{self, Value};
use crate::types::{Access, AgentKind, Task, TaskId, TaskState};
use std::collections::{BTreeMap, HashMap};
use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::os::unix::io::AsRawFd;
use std::path::{Path, PathBuf};

pub struct Queue {
    file: File,
    tasks: Vec<Task>,
    index: HashMap<String, usize>,
}

impl Queue {
    /// Open (or create) `<dir>/tasks.jsonl` and replay it. A torn last line is ignored.
    pub fn open(dir: &Path) -> io::Result<Queue> {
        let path = dir.join("tasks.jsonl");
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let bytes = std::fs::read(&path)?;
        let mut q = Queue { file, tasks: vec![], index: HashMap::new() };
        let mut valid = 0;
        for (n, raw) in bytes.split_inclusive(|&b| b == b'\n').enumerate() {
            let Some(line) = raw.strip_suffix(b"\n") else { break }; // unterminated tail: torn write
            q.replay(line).map_err(|e| invalid(format!("tasks.jsonl line {}: {e}", n + 1)))?;
            valid += raw.len();
        }
        if valid < bytes.len() {
            // drop the torn tail so the next append starts on a fresh line
            q.file.set_len(valid as u64)?;
            q.file.sync_all()?;
        }
        for i in 0..q.tasks.len() {
            if matches!(q.tasks[i].state, TaskState::Running { .. }) {
                let attempts = q.tasks[i].attempts;
                q.record(i, TaskState::Ready, attempts)?; // its process died with the last run
            }
        }
        Ok(q)
    }
    /// Add a task (state Pending). Rejects duplicate ids, unknown deps and dependency cycles.
    pub fn submit(&mut self, mut task: Task) -> Result<(), String> {
        if self.index.contains_key(&task.id) {
            return Err(format!("duplicate task '{}'", task.id));
        }
        // cycles are impossible without self-deps: deps must already exist
        if let Some(d) = task.deps.iter().find(|d| **d == task.id) {
            return Err(format!("self dependency '{d}'"));
        }
        if let Some(d) = task.deps.iter().find(|d| !self.index.contains_key(*d)) {
            return Err(format!("unknown dep '{d}'"));
        }
        task.state = TaskState::Pending;
        let line = Value::Obj(vec![("op".into(), Value::str("submit")), ("task".into(), task_to_json(&task))]);
        self.append(&line).map_err(|e| e.to_string())?;
        self.index.insert(task.id.clone(), self.tasks.len());
        self.tasks.push(task);
        Ok(())
    }
    pub fn get(&self, id: &str) -> Option<&Task> {
        self.index.get(id).map(|&i| &self.tasks[i])
    }
    pub fn all(&self) -> Vec<&Task> {
        self.tasks.iter().collect()
    }
    /// Pending tasks whose deps are all Done become Ready; a task whose dep Failed/Cancelled
    /// becomes Failed("dep <id> failed"). Returns ids of tasks that are Ready, oldest first.
    pub fn ready(&mut self) -> Vec<TaskId> {
        // deps always precede their dependents in `tasks`, so one forward pass settles chains
        for i in 0..self.tasks.len() {
            if self.tasks[i].state != TaskState::Pending {
                continue;
            }
            let mut target = None;
            let mut all_done = true;
            for dep in &self.tasks[i].deps {
                match self.index.get(dep).map(|&j| &self.tasks[j].state) {
                    Some(TaskState::Done) => {}
                    Some(TaskState::Failed { .. } | TaskState::Cancelled) => {
                        target = Some(TaskState::Failed { error: format!("dep {dep} failed") });
                        break;
                    }
                    _ => all_done = false,
                }
            }
            if target.is_none() && all_done {
                target = Some(TaskState::Ready);
            }
            if let Some(state) = target {
                let attempts = self.tasks[i].attempts;
                if self.record(i, state, attempts).is_err() {
                    break; // not journaled, so not applied; the next call retries
                }
            }
        }
        self.tasks.iter().filter(|t| t.state == TaskState::Ready).map(|t| t.id.clone()).collect()
    }
    /// Journal a state change. Failed with attempts < max_retries goes back to Ready with
    /// attempts + 1 instead. Invalid transitions (e.g. Done -> Running) are errors.
    pub fn set_state(&mut self, id: &str, state: TaskState) -> Result<(), String> {
        let i = *self.index.get(id).ok_or_else(|| format!("unknown task '{id}'"))?;
        let t = &self.tasks[i];
        if !allowed(&t.state, &state) {
            return Err(format!("invalid transition for '{id}': {:?} -> {:?}", t.state, state));
        }
        let (state, attempts) = match state {
            TaskState::Failed { .. } if t.attempts < t.max_retries => (TaskState::Ready, t.attempts + 1),
            s => (s, t.attempts),
        };
        self.record(i, state, attempts).map_err(|e| e.to_string())
    }

    fn replay(&mut self, line: &[u8]) -> Result<(), String> {
        let text = std::str::from_utf8(line).map_err(|e| e.to_string())?;
        let v = json::parse(text)?;
        match field_str(&v, "op")? {
            "submit" => {
                let t = task_from_json(v.get("task").ok_or("missing 'task'")?)?;
                if self.index.contains_key(&t.id) {
                    return Err(format!("duplicate task '{}'", t.id));
                }
                self.index.insert(t.id.clone(), self.tasks.len());
                self.tasks.push(t);
            }
            "state" => {
                let i = *self.index.get(field_str(&v, "id")?).ok_or("state for unknown task")?;
                self.tasks[i].state = state_from_json(v.get("state").ok_or("missing 'state'")?)?;
                self.tasks[i].attempts = field_num(&v, "attempts")?;
            }
            other => return Err(format!("unknown op '{other}'")),
        }
        Ok(())
    }
    /// Journal first, then apply in memory, so memory never gets ahead of the disk.
    fn record(&mut self, i: usize, state: TaskState, attempts: u32) -> io::Result<()> {
        let line = Value::Obj(vec![
            ("op".into(), Value::str("state")),
            ("id".into(), Value::str(&self.tasks[i].id)),
            ("state".into(), state_to_json(&state)),
            ("attempts".into(), Value::Num(attempts as f64)),
        ]);
        self.append(&line)?;
        self.tasks[i].state = state;
        self.tasks[i].attempts = attempts;
        Ok(())
    }
    fn append(&mut self, v: &Value) -> io::Result<()> {
        let mut line = v.to_string();
        line.push('\n');
        self.file.write_all(line.as_bytes())?;
        self.file.flush()?;
        // plain fsync(2), not std's sync_data: macOS std issues F_FULLFSYNC (~4 ms per line), as SQLite avoids
        extern "C" {
            fn fsync(fd: i32) -> i32;
        }
        if unsafe { fsync(self.file.as_raw_fd()) } != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

fn allowed(from: &TaskState, to: &TaskState) -> bool {
    use TaskState::*;
    matches!(
        (from, to),
        (Pending, Ready | Cancelled)
            | (Ready, Running { .. } | NeedsApproval { .. } | Cancelled | Failed { .. })
            | (Running { .. }, Done | Failed { .. } | NeedsApproval { .. } | Cancelled)
            | (NeedsApproval { .. }, Ready | Cancelled)
            | (Failed { .. } | Cancelled, Ready)
    )
}

fn invalid(msg: String) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, msg)
}

// ---- JSON encoding shared with session.rs ----

pub(crate) fn field_str<'a>(v: &'a Value, k: &str) -> Result<&'a str, String> {
    v.get(k).and_then(Value::as_str).ok_or_else(|| format!("bad or missing '{k}'"))
}

pub(crate) fn field_num<T: TryFrom<i64>>(v: &Value, k: &str) -> Result<T, String> {
    v.get(k).and_then(Value::as_i64).and_then(|n| T::try_from(n).ok()).ok_or_else(|| format!("bad or missing '{k}'"))
}

pub(crate) fn field_opt(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(String::from)
}

fn field_strs(v: &Value, k: &str) -> Result<Vec<String>, String> {
    v.get(k)
        .and_then(Value::as_arr)
        .ok_or_else(|| format!("bad or missing '{k}'"))?
        .iter()
        .map(|x| x.as_str().map(String::from).ok_or_else(|| format!("bad item in '{k}'")))
        .collect()
}

pub(crate) fn agent_to_json(a: &AgentKind) -> Value {
    let (kind, extra): (&str, Vec<(String, Value)>) = match a {
        AgentKind::Claude => ("claude", vec![]),
        AgentKind::Codex => ("codex", vec![]),
        AgentKind::OpenCode => ("opencode", vec![]),
        AgentKind::Gemini => ("gemini", vec![]),
        AgentKind::Suffice => ("suffice", vec![]),
        AgentKind::Generic { program, args } => (
            "generic",
            vec![
                ("program".into(), Value::str(program)),
                ("args".into(), Value::Arr(args.iter().map(|x| Value::str(x)).collect())),
            ],
        ),
    };
    let mut o = vec![("kind".into(), Value::str(kind))];
    o.extend(extra);
    Value::Obj(o)
}

pub(crate) fn agent_from_json(v: &Value) -> Result<AgentKind, String> {
    Ok(match field_str(v, "kind")? {
        "claude" => AgentKind::Claude,
        "codex" => AgentKind::Codex,
        "opencode" => AgentKind::OpenCode,
        "gemini" => AgentKind::Gemini,
        "suffice" => AgentKind::Suffice,
        "generic" => AgentKind::Generic {
            program: field_str(v, "program")?.into(),
            args: field_strs(v, "args")?,
        },
        other => return Err(format!("unknown agent '{other}'")),
    })
}

fn state_to_json(s: &TaskState) -> Value {
    let (tag, extra): (&str, Vec<(String, Value)>) = match s {
        TaskState::Pending => ("pending", vec![]),
        TaskState::Ready => ("ready", vec![]),
        TaskState::Running { pid } => ("running", vec![("pid".into(), Value::Num(*pid as f64))]),
        TaskState::NeedsApproval { reason } => ("needs_approval", vec![("reason".into(), Value::str(reason))]),
        TaskState::Done => ("done", vec![]),
        TaskState::Failed { error } => ("failed", vec![("error".into(), Value::str(error))]),
        TaskState::Cancelled => ("cancelled", vec![]),
    };
    let mut o = vec![("s".into(), Value::str(tag))];
    o.extend(extra);
    Value::Obj(o)
}

fn state_from_json(v: &Value) -> Result<TaskState, String> {
    Ok(match field_str(v, "s")? {
        "pending" => TaskState::Pending,
        "ready" => TaskState::Ready,
        "running" => TaskState::Running { pid: field_num(v, "pid")? },
        "needs_approval" => TaskState::NeedsApproval { reason: field_str(v, "reason")?.into() },
        "done" => TaskState::Done,
        "failed" => TaskState::Failed { error: field_str(v, "error")?.into() },
        "cancelled" => TaskState::Cancelled,
        other => return Err(format!("unknown state '{other}'")),
    })
}

fn env_to_json(e: &BTreeMap<String, String>) -> Value {
    Value::Obj(e.iter().map(|(k, v)| (k.clone(), Value::str(v))).collect())
}

fn env_from_json(v: &Value) -> Result<BTreeMap<String, String>, String> {
    match v {
        Value::Obj(kv) => kv
            .iter()
            .map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())).ok_or_else(|| "bad env value".to_string()))
            .collect(),
        _ => Err("bad or missing 'env'".into()),
    }
}

fn opt_json(o: &Option<String>) -> Value {
    o.as_deref().map_or(Value::Null, Value::str)
}

fn task_to_json(t: &Task) -> Value {
    Value::Obj(vec![
        ("id".into(), Value::str(&t.id)),
        ("agent".into(), agent_to_json(&t.agent)),
        ("prompt".into(), Value::str(&t.prompt)),
        ("cwd".into(), Value::str(&t.cwd.to_string_lossy())),
        ("session_key".into(), opt_json(&t.session_key)),
        ("deps".into(), Value::Arr(t.deps.iter().map(|d| Value::str(d)).collect())),
        ("max_retries".into(), Value::Num(t.max_retries as f64)),
        ("attempts".into(), Value::Num(t.attempts as f64)),
        ("timeout_secs".into(), Value::Num(t.timeout_secs as f64)),
        ("model".into(), opt_json(&t.model)),
        ("access".into(), Value::str(t.access.name())),
        ("env".into(), env_to_json(&t.env)),
        ("state".into(), state_to_json(&t.state)),
        ("created_ms".into(), Value::Num(t.created_ms as f64)),
    ])
}

fn task_from_json(v: &Value) -> Result<Task, String> {
    Ok(Task {
        id: field_str(v, "id")?.into(),
        agent: agent_from_json(v.get("agent").ok_or("missing 'agent'")?)?,
        prompt: field_str(v, "prompt")?.into(),
        cwd: PathBuf::from(field_str(v, "cwd")?),
        session_key: field_opt(v, "session_key"),
        deps: field_strs(v, "deps")?,
        max_retries: field_num(v, "max_retries")?,
        attempts: field_num(v, "attempts")?,
        timeout_secs: field_num(v, "timeout_secs")?,
        model: field_opt(v, "model"),
        // A missing field is an old journal line: Edit, the default.
        access: match field_opt(v, "access") {
            None => Access::Edit,
            Some(a) => Access::from_name(&a).ok_or_else(|| format!("unknown access '{a}'"))?,
        },
        env: env_from_json(v.get("env").ok_or("missing 'env'")?)?,
        state: state_from_json(v.get("state").ok_or("missing 'state'")?)?,
        created_ms: field_num(v, "created_ms")?,
    })
}
