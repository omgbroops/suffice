//! Shared types. Every module speaks these; change them only with every caller in view.
use std::collections::BTreeMap;
use std::path::PathBuf;

pub type TaskId = String;

/// Which agent CLI runs a task. `Generic` runs any command and treats stdout lines as text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentKind {
    Claude,
    Codex,
    OpenCode,
    Gemini,
    Generic { program: String, args: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskState {
    Pending,         // waiting on deps
    Ready,           // deps done, waiting for a pool slot / free session / gate
    Running { pid: u32 },
    NeedsApproval { reason: String }, // held by the gate until Abhay approves
    Done,
    Failed { error: String },
    Cancelled,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Task {
    pub id: TaskId,
    pub agent: AgentKind,
    pub prompt: String,
    pub cwd: PathBuf,
    /// Tasks with the same session_key continue one agent conversation, one run at a time.
    pub session_key: Option<String>,
    pub deps: Vec<TaskId>,
    pub max_retries: u32,
    pub attempts: u32,
    pub timeout_secs: u64,
    pub model: Option<String>,
    pub env: BTreeMap<String, String>,
    pub state: TaskState,
    pub created_ms: u64,
}

/// A process to spawn, built by an adapter. Never goes through a shell.
#[derive(Debug, Clone, PartialEq)]
pub struct Cmd {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub env: BTreeMap<String, String>,
    /// Written to stdin then stdin is closed (None = stdin closed at once).
    pub stdin: Option<String>,
}

/// Normalized agent output, the same for every CLI.
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// The CLI's own session/thread id, stored so the next task on this session_key resumes it.
    Session { native_id: String },
    Text { text: String },
    ToolCall { name: String, input: String },
    ToolResult { name: String, output: String, is_error: bool },
    Usage { input_tokens: u64, output_tokens: u64, cost_usd: Option<f64> },
    /// The CLI's final message for the run.
    Result { text: String, is_error: bool },
    /// A line the adapter could not parse (kept, never dropped).
    Raw { line: String },
    Stderr { line: String },
    Exit { code: Option<i32> },
}

/// One event in the log, tagged with its task and a monotonic sequence number.
#[derive(Debug, Clone, PartialEq)]
pub struct Logged {
    pub seq: u64,
    pub task: TaskId,
    pub ms: u64,
    pub event: Event,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
