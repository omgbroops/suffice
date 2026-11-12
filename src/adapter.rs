//! Per-CLI command building and output parsing. Pure: no process spawning here.
use crate::types::{AgentKind, Cmd, Event, Task};

/// Build the headless command for a task. `resume` is the CLI's native session id from a
/// previous run on the same session_key.
pub fn command(task: &Task, resume: Option<&str>) -> Cmd {
    let _ = (task, resume);
    unimplemented!("builder: adapter")
}

/// Parse one stdout line from this agent kind into zero or more normalized events.
/// Unparseable lines become Event::Raw, never dropped.
pub fn parse_line(kind: &AgentKind, line: &str) -> Vec<Event> {
    let _ = (kind, line);
    unimplemented!("builder: adapter")
}
