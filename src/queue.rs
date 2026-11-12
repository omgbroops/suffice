//! Durable task queue: an append-only JSONL journal in the data dir, replayed on start, so a crash
//! or reboot loses nothing. Owns task state transitions and dependency order.
use crate::types::{Task, TaskId, TaskState};
use std::path::Path;

pub struct Queue {
    _private: (),
}

impl Queue {
    /// Open (or create) `<dir>/tasks.jsonl` and replay it. A torn last line is ignored.
    pub fn open(dir: &Path) -> std::io::Result<Queue> {
        let _ = dir;
        unimplemented!("builder: queue")
    }
    /// Add a task (state Pending). Rejects duplicate ids, unknown deps and dependency cycles.
    pub fn submit(&mut self, task: Task) -> Result<(), String> {
        let _ = task;
        unimplemented!("builder: queue")
    }
    pub fn get(&self, id: &str) -> Option<&Task> {
        let _ = id;
        unimplemented!("builder: queue")
    }
    pub fn all(&self) -> Vec<&Task> {
        unimplemented!("builder: queue")
    }
    /// Pending tasks whose deps are all Done become Ready; a task whose dep Failed/Cancelled
    /// becomes Failed("dep <id> failed"). Returns ids of tasks that are Ready, oldest first.
    pub fn ready(&mut self) -> Vec<TaskId> {
        unimplemented!("builder: queue")
    }
    /// Journal a state change. Failed with attempts < max_retries goes back to Ready with
    /// attempts + 1 instead. Invalid transitions (e.g. Done -> Running) are errors.
    pub fn set_state(&mut self, id: &str, state: TaskState) -> Result<(), String> {
        let _ = (id, state);
        unimplemented!("builder: queue")
    }
}
