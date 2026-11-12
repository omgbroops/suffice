//! Per-agent sessions: session_key -> the CLI's native session id (for resume) plus a busy flag so
//! one session never has two runs at once. Persisted to `<dir>/sessions.json`.
use crate::types::AgentKind;
use std::path::Path;

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
    _private: (),
}

impl Sessions {
    pub fn open(dir: &Path) -> std::io::Result<Sessions> {
        let _ = dir;
        unimplemented!("builder: session")
    }
    pub fn get(&self, key: &str) -> Option<&Session> {
        let _ = key;
        unimplemented!("builder: session")
    }
    /// Mark the session busy for `task`. False when another task holds it, or when the key is
    /// already bound to a different agent kind.
    pub fn claim(&mut self, key: &str, agent: &AgentKind, task: &str) -> bool {
        let _ = (key, agent, task);
        unimplemented!("builder: session")
    }
    pub fn set_native(&mut self, key: &str, native_id: &str) {
        let _ = (key, native_id);
        unimplemented!("builder: session")
    }
    /// Free the session if `task` holds it. Busy flags never persist across restarts.
    pub fn release(&mut self, key: &str, task: &str) {
        let _ = (key, task);
        unimplemented!("builder: session")
    }
}
