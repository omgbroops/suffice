//! Approval gate: nothing gets published, sent, bought or deleted without Abhay's OK.
//! Two checks: before a task starts (its prompt asks for an outward action) and on each ToolCall
//! event while it runs (the agent tries one). A hit holds the task as NeedsApproval.
//! Fail closed: shell commands must be on an allowlist; anything unclear holds.
use crate::types::{Event, Task};

#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    Allow,
    Hold { reason: String },
}

fn hold(reason: &str) -> Verdict {
    Verdict::Hold { reason: reason.to_string() }
}

const TASK_WORDS: &[&str] = &[
    "publish", "send", "resend", "email", "post", "tweet", "buy", "purchase", "pay", "order", "deploy", "delete",
    "upload", "submit", "push", "message", "text", "reply", "forward", "announce", "release", "ship", "merge", "wipe",
    "drop",
];
const TASK_PHRASES: &[&[&str]] = &[
    &["open", "a", "pr"],
    &["open", "a", "pull"],
    &["open", "pr"],
    &["open", "pull"],
    &["pull", "request"],
    &["e", "mail"],
];

fn tokens(s: &str) -> Vec<String> {
    s.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(String::from).collect()
}

/// Whole word `t` is `k` or one of its plain inflections (sends, posted, shipping, dropped).
/// Irregular forms (sent, paid, bought) are not covered.
fn word_hit(t: &str, k: &str) -> bool {
    let last = k.chars().last().unwrap_or('_');
    t == k || [format!("{k}s"), format!("{k}es"), format!("{k}ed"), format!("{k}d"), format!("{k}ing"), format!("{k}{last}ing"), format!("{k}{last}ed")].contains(&t.to_string())
}

/// Pre-start check on the task itself.
pub fn check_task(task: &Task) -> Verdict {
    let w = tokens(&task.prompt);
    if let Some(k) = TASK_WORDS.iter().find(|k| w.iter().any(|t| word_hit(t, k))) {
        return hold(&format!("prompt asks for outward action: {k}"));
    }
    let phrase_hit = |p: &&[&str]| w.windows(p.len()).any(|win| win.iter().zip(p.iter()).all(|(t, k)| word_hit(t, k)));
    if let Some(p) = TASK_PHRASES.iter().find(|p| phrase_hit(p)) {
        return hold(&format!("prompt asks for outward action: {}", p.join(" ")));
    }
    Verdict::Allow
}

const SHELL_TOOLS: &[&str] = &["bash", "shell", "exec", "command_execution", "run_terminal_cmd"];
const LOCAL_TOOLS: &[&str] = &["edit", "write", "multiedit", "notebookedit", "todowrite", "task"];
const NON_SHELL_OUTWARD: &[&str] = &[
    "send", "email", "message", "post", "publish", "tweet", "purchase", "buy", "checkout", "pay", "transfer",
    "deploy", "upload", "delete", "remove",
];
const READ_WORDS: &[&str] = &["read", "list", "get", "search"];
const READ_ONLY_TOOLS: &[&str] = &["read", "grep", "glob", "ls", "cat", "websearch", "webfetch"];

// Shell: a command is allowed only if every part (split on ; & | newline) starts with a word on these lists.
const SHELL_READ_ONLY: &[&str] = &[
    "ls", "cat", "head", "tail", "wc", "grep", "rg", "sort", "uniq", "cut", "tr", "diff", "echo", "printf", "pwd",
    "which", "file", "stat", "du", "df", "date", "true", "false", "test", "mkdir", "touch", "cd", "awk",
];
const GIT_SUBCMDS: &[&str] = &[
    "status", "log", "diff", "show", "branch", "rev-parse", "ls-files", "blame", "grep", "add", "commit", "checkout",
    "switch", "stash", "fetch", "worktree",
];
const CARGO_SUBCMDS: &[&str] = &["build", "test", "check", "fmt", "clippy", "run", "doc", "tree", "metadata"];
const JS_SUBCMDS: &[&str] = &["test", "run", "ci", "install"];
const FIND_HOLD: &[&str] = &["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf"];

/// Live check on one event. Only ToolCall events can hold.
pub fn check_event(event: &Event) -> Verdict {
    let Event::ToolCall { name, input } = event else { return Verdict::Allow };
    let n = name.to_lowercase();
    if SHELL_TOOLS.contains(&n.as_str()) {
        return shell_verdict(&shell_command(input));
    }
    non_shell(&n, input)
}

/// The command text: the "command" or "cmd" field when the input is JSON, else the raw input.
fn shell_command(input: &str) -> String {
    match crate::json::parse(input) {
        Ok(v) => v.get("command").or_else(|| v.get("cmd")).and_then(|c| c.as_str()).unwrap_or(input).to_string(),
        Err(_) => input.to_string(),
    }
}

/// `VAR=value` prefix word.
fn is_assign(w: &str) -> bool {
    w.split_once('=').is_some_and(|(k, _)| !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
}

/// A path argument that could reach outside the working tree or match many files.
fn unsafe_path(p: &str) -> bool {
    let t = p.trim_end_matches('/');
    p.starts_with('/') || p.starts_with('~') || p.contains("..") || p.contains('*') || t.is_empty() || t == "."
}

fn shell_verdict(cmd: &str) -> Verdict {
    // We do not interpret shell tricks: any quoting, expansion, redirect, eval or base64 holds.
    let lower = cmd.to_lowercase();
    if cmd.contains(['"', '\'', '\\', '$', '`', '>']) || lower.contains("eval") || lower.contains("base64") {
        return hold("shell quoting, expansion, redirect or eval: not plainly readable");
    }
    for part in cmd.split([';', '&', '|', '\n', '\r']) {
        let w: Vec<&str> = part.split_whitespace().skip_while(|x| is_assign(x)).collect();
        let Some((&prog, args)) = w.split_first() else { continue };
        if let Some(r) = part_rule(prog, args) {
            return hold(r);
        }
    }
    Verdict::Allow
}

/// Why one command part holds, or None when it is on the allowlist.
fn part_rule(prog: &str, a: &[&str]) -> Option<&'static str> {
    let has = |xs: &[&str]| a.iter().any(|x| xs.contains(x));
    let sub = a.iter().copied().find(|x| !x.starts_with('-'));
    let paths: Vec<&str> = a.iter().copied().filter(|x| !x.starts_with('-')).collect();
    match prog {
        p if p.contains('/') => Some("path-qualified command"),
        "sed" => a
            .iter()
            .any(|x| x.starts_with("--in-place") || (x.starts_with('-') && !x.starts_with("--") && x.contains('i')))
            .then_some("sed -i writes files"),
        "find" => has(FIND_HOLD).then_some("find -delete/-exec/-ok/-fprint"),
        "git" => {
            if a.iter().any(|x| x.starts_with("-c")) {
                Some("git -c")
            } else if !sub.is_some_and(|s| GIT_SUBCMDS.contains(&s)) {
                Some("git subcommand not on safe list")
            } else {
                None
            }
        }
        "cargo" => (!sub.is_some_and(|s| CARGO_SUBCMDS.contains(&s))).then_some("cargo subcommand not on safe list"),
        "npm" | "pnpm" | "yarn" => {
            if has(&["-g", "-G", "--global"]) {
                Some("global npm install")
            } else if !sub.is_some_and(|s| JS_SUBCMDS.contains(&s)) {
                Some("npm subcommand not on safe list")
            } else {
                None
            }
        }
        // Only a relative script file: no -c/-e/-m, no stdin, no absolute path.
        "python3" | "node" => a
            .first()
            .is_none_or(|f| f.starts_with('-') || f.starts_with('/') || f.starts_with('~'))
            .then_some("python/node only for a relative script file"),
        "cd" => (paths.is_empty() || paths.iter().any(|p| unsafe_path(p))).then_some("cd outside working tree"),
        "rm" | "mv" | "cp" => {
            if paths.iter().any(|p| unsafe_path(p)) {
                Some("rm/mv/cp with absolute, parent, wildcard or . path")
            } else if prog == "mv" && paths.last().is_some_and(|p| p.to_lowercase().contains("trash")) {
                Some("mv into Trash")
            } else {
                None
            }
        }
        p if SHELL_READ_ONLY.contains(&p) => None,
        _ => Some("command not on safe list"),
    }
}

fn non_shell(n: &str, input: &str) -> Verdict {
    if LOCAL_TOOLS.contains(&n) {
        return Verdict::Allow;
    }
    // read_message / list_messages style: a read word before "message" and no other outward word.
    if let Some(m) = n.find("message") {
        let other = NON_SHELL_OUTWARD.iter().any(|k| *k != "message" && n.contains(k));
        if !other && READ_WORDS.iter().any(|r| n[..m].contains(r)) {
            return Verdict::Allow;
        }
    }
    let i = input.to_lowercase();
    if let Some(k) = NON_SHELL_OUTWARD.iter().find(|k| n.contains(**k)) {
        return hold(&format!("outward tool name: {k}"));
    }
    if n.contains("submit") {
        return hold("browser form submit");
    }
    let buy_words = ["buy", "pay", "checkout", "place order", "send", "publish", "post", "confirm", "delete", "purchase", "order", "subscribe"];
    if n.contains("click") && buy_words.iter().any(|k| i.contains(*k)) {
        return hold("browser click on outward control");
    }
    if READ_ONLY_TOOLS.contains(&n) {
        if n == "webfetch" && ["\"post\"", "\"put\"", "\"patch\"", "\"delete\""].iter().any(|m| i.contains(*m)) {
            return hold("WebFetch write method");
        }
        return Verdict::Allow;
    }
    hold("unrecognized tool, not on read-only list")
}
