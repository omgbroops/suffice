//! Per-agent sessions: session_key -> the CLI's native session id (for resume) plus a busy flag so
//! one session never has two runs at once. Persisted to `<dir>/sessions.json`.
use crate::json::{self, Value};
use crate::queue::{agent_from_json, agent_to_json, field_num, field_opt, field_str};
use crate::types::{now_ms, AgentKind};
use std::collections::BTreeMap;
use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    pub key: String,
    pub agent: AgentKind,
    pub native_id: Option<String>,
    pub busy_task: Option<String>,
    pub runs: u32,
    pub last_ms: u64,
}

pub struct Sessions {
    path: PathBuf,
    map: BTreeMap<String, Session>,
}

impl Sessions {
    pub fn open(dir: &Path) -> io::Result<Sessions> {
        let path = dir.join("sessions.json");
        let mut map = BTreeMap::new();
        match std::fs::read_to_string(&path) {
            Ok(text) => {
                let bad = |e: String| io::Error::new(io::ErrorKind::InvalidData, format!("sessions.json: {e}"));
                let v = json::parse(&text).map_err(bad)?;
                for item in v.as_arr().ok_or_else(|| bad("not an array".into()))? {
                    let s = session_from_json(item).map_err(bad)?;
                    map.insert(s.key.clone(), s);
                }
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
        Ok(Sessions { path, map })
    }
    pub fn get(&self, key: &str) -> Option<&Session> {
        self.map.get(key)
    }

    pub fn all(&self) -> Vec<&Session> {
        self.map.values().collect()
    }
    /// Mark the session busy for `task`. False when another task holds it, or when the key is
    /// already bound to a different agent kind.
    pub fn claim(&mut self, key: &str, agent: &AgentKind, task: &str) -> bool {
        let s = self.map.entry(key.to_string()).or_insert_with(|| Session {
            key: key.to_string(),
            agent: agent.clone(),
            native_id: None,
            busy_task: None,
            runs: 0,
            last_ms: 0,
        });
        if s.busy_task.is_some() || s.agent != *agent {
            return false;
        }
        s.busy_task = Some(task.to_string());
        s.runs += 1;
        s.last_ms = now_ms();
        self.save_quiet();
        true
    }
    pub fn set_native(&mut self, key: &str, native_id: &str) {
        if let Some(s) = self.map.get_mut(key) {
            s.native_id = Some(native_id.to_string());
            self.save_quiet();
        }
    }
    /// Free the session if `task` holds it. Busy flags never persist across restarts.
    pub fn release(&mut self, key: &str, task: &str) {
        if let Some(s) = self.map.get_mut(key) {
            if s.busy_task.as_deref() == Some(task) {
                s.busy_task = None;
            }
        }
    }

    /// shortcut: save errors are only logged because claim/set_native return no Result;
    /// upgrade the signatures once callers can act on a failed save.
    fn save_quiet(&self) {
        if let Err(e) = self.save() {
            eprintln!("suffice-backend: sessions.json not saved: {e}");
        }
    }
    /// Write a temp file, fsync it, then rename over `sessions.json` (atomic replace).
    fn save(&self) -> io::Result<()> {
        let tmp = self.path.with_extension("json.tmp");
        let v = Value::Arr(self.map.values().map(to_json).collect());
        let mut f = File::create(&tmp)?;
        f.write_all(v.to_string().as_bytes())?;
        f.sync_all()?;
        std::fs::rename(&tmp, &self.path)
    }
}

fn to_json(s: &Session) -> Value {
    Value::Obj(vec![
        ("key".into(), Value::str(&s.key)),
        ("agent".into(), agent_to_json(&s.agent)),
        ("native_id".into(), s.native_id.as_deref().map_or(Value::Null, Value::str)),
        ("runs".into(), Value::Num(s.runs as f64)),
        ("last_ms".into(), Value::Num(s.last_ms as f64)),
    ])
}

fn session_from_json(v: &Value) -> Result<Session, String> {
    Ok(Session {
        key: field_str(v, "key")?.into(),
        agent: agent_from_json(v.get("agent").ok_or("missing 'agent'")?)?,
        native_id: field_opt(v, "native_id"),
        busy_task: None,
        runs: field_num(v, "runs")?,
        last_ms: field_num(v, "last_ms")?,
    })
}
