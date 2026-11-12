//! Process pool: spawns Cmds, streams their stdout/stderr lines, enforces a concurrency cap and
//! per-run timeouts, kills by pid (whole process group). Knows nothing about agents or tasks
//! beyond an opaque run id.
use crate::types::Cmd;
use std::sync::mpsc::Sender;

#[derive(Debug, Clone, PartialEq)]
pub enum PoolMsg {
    Started { run: String, pid: u32 },
    Stdout { run: String, line: String },
    Stderr { run: String, line: String },
    /// Always the last message for a run. `timed_out`/`killed` say why it ended early.
    Exited { run: String, code: Option<i32>, timed_out: bool, killed: bool },
    SpawnFailed { run: String, error: String },
}

pub struct Pool {
    _private: (),
}

impl Pool {
    /// `max` concurrent runs; every message for every run goes to `out`.
    pub fn new(max: usize, out: Sender<PoolMsg>) -> Pool {
        let _ = (max, out);
        unimplemented!("builder: pool")
    }
    /// Start `cmd` now if a slot is free; returns false (and does nothing) when full.
    pub fn try_start(&self, run: &str, cmd: Cmd, timeout_secs: u64) -> bool {
        let _ = (run, cmd, timeout_secs);
        unimplemented!("builder: pool")
    }
    pub fn running(&self) -> usize {
        unimplemented!("builder: pool")
    }
    /// SIGTERM the run's process group, SIGKILL after 3 s. No-op for unknown runs.
    pub fn kill(&self, run: &str) {
        let _ = run;
        unimplemented!("builder: pool")
    }
}
