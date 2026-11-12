//! Approval gate: nothing gets published, sent, bought or deleted without Abhay's OK.
//! Two checks: before a task starts (its prompt asks for an outward action) and on each ToolCall
//! event while it runs (the agent tries one). A hit holds the task as NeedsApproval.
use crate::types::{Event, Task};

#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    Allow,
    Hold { reason: String },
}

/// Pre-start check on the task itself.
pub fn check_task(task: &Task) -> Verdict {
    let _ = task;
    unimplemented!("builder: gate")
}

/// Live check on one event. Only ToolCall events can hold.
pub fn check_event(event: &Event) -> Verdict {
    let _ = event;
    unimplemented!("builder: gate")
}
