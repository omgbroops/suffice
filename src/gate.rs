//! Approval gate: nothing gets published, sent, bought or deleted without Abhay's OK.
//! Two checks: before a task starts (its prompt asks for an outward action) and on each ToolCall
//! event while it runs (the agent tries one). A hit holds the task as NeedsApproval.
//! Fail closed: shell commands must be on an allowlist with per-program flag lists; anything unclear holds.
use crate::types::{Event, Task};

#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    Allow,
    Hold { reason: String },
}

fn hold(reason: &str) -> Verdict {
    Verdict::Hold { reason: reason.to_string() }
}

// Verbs that hold anywhere in a prompt.
const TASK_WORDS: &[&str] = &[
    "publish", "send", "sent", "resend", "email", "mail", "notify", "comment", "share", "tweet", "buy", "purchase",
    "bought", "pay", "paid", "deploy", "delete", "upload", "submit", "push", "message", "reply", "forward", "announce",
    "merge", "wipe", "ship",
];
// Words that hold only as a verb: at clause start or right after to/and/then/please.
const TASK_VERBS: &[&str] = &["text", "order", "post", "drop", "release"];
const VERB_LEAD: &[&str] = &["to", "and", "then", "please"];
const TASK_PHRASES: &[&[&str]] = &[
    &["open", "a", "pr"],
    &["open", "a", "pull"],
    &["open", "pr"],
    &["open", "pull"],
    &["create", "a", "pr"],
    &["create", "pr"],
    &["gh", "pr", "create"],
    &["pull", "request"],
    &["e", "mail"],
];

fn tokens(s: &str) -> Vec<String> {
    s.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(String::from).collect()
}

/// Whole word `t` is `k` or one of its plain inflections (sends, deleting, posted, replied, paying).
/// Irregular forms (sent, paid, bought) are listed as words instead.
fn word_hit(t: &str, k: &str) -> bool {
    let stem = k.strip_suffix('e').unwrap_or(k);
    let last = k.chars().last().unwrap_or('_');
    let mut forms = vec![format!("{k}s"), format!("{k}es"), format!("{k}ed"), format!("{k}d"), format!("{stem}ing"), format!("{k}{last}ing"), format!("{k}{last}ed")];
    if let Some(s) = k.strip_suffix('y') {
        forms.push(format!("{s}ied"));
        forms.push(format!("{s}ies"));
    }
    t == k || forms.iter().any(|f| f == t)
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
    for clause in task.prompt.split(['.', ';', ',', '!', '?', '\n']) {
        let cw: Vec<String> = clause
            .split_whitespace()
            .map(|x| x.trim_matches(|c: char| !c.is_alphanumeric() && c != '-').to_lowercase())
            .collect();
        for (i, t) in cw.iter().enumerate() {
            let lead = i == 0 || VERB_LEAD.contains(&cw[i - 1].as_str());
            if let Some(k) = TASK_VERBS.iter().find(|k| lead && word_hit(t, k)) {
                return hold(&format!("prompt asks for outward action: {k}"));
            }
        }
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

// Shell: a command is allowed only if every part (split on ; & | newline) is a program on these lists,
// with flags checked per program.
const SHELL_READ_ONLY: &[&str] = &[
    "ls", "cat", "head", "tail", "wc", "cut", "tr", "diff", "echo", "printf", "pwd", "which", "file", "stat", "du",
    "df", "date", "true", "false", "test", "cd",
];
const GIT_SUBCMDS: &[&str] = &[
    "status", "log", "diff", "show", "branch", "rev-parse", "ls-files", "blame", "add", "checkout", "switch",
    "stash", "fetch", "worktree",
];
const CARGO_SUBCMDS: &[&str] = &["build", "test", "check", "fmt", "clippy"];
const JS_SUBCMDS: &[&str] = &["test", "ci"];

/// Live check on one event. Only ToolCall events can hold.
pub fn check_event(event: &Event) -> Verdict {
    let Event::ToolCall { name, input } = event else { return Verdict::Allow };
    if SHELL_TOOLS.contains(&name.to_lowercase().as_str()) {
        return shell_verdict(&shell_command(input));
    }
    non_shell(name, input)
}

/// The command text: the "command" or "cmd" field when the input is JSON, else the raw input.
fn shell_command(input: &str) -> String {
    match crate::json::parse(input) {
        Ok(v) => v.get("command").or_else(|| v.get("cmd")).and_then(|c| c.as_str()).unwrap_or(input).to_string(),
        Err(_) => input.to_string(),
    }
}

/// `VAR=value` word.
fn is_assign(w: &str) -> bool {
    w.split_once('=').is_some_and(|(k, _)| !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
}

/// A path argument that could reach outside the working tree or match many files.
fn unsafe_path(p: &str) -> bool {
    let t = p.trim_end_matches('/');
    p.starts_with('/') || p.starts_with('~') || p.contains("..") || p.contains('*') || t.is_empty() || t == "."
}

fn shell_verdict(cmd: &str) -> Verdict {
    // Not plainly readable: no quoting, expansion, redirection, braces, non-ASCII, eval or base64.
    let lower = cmd.to_lowercase();
    if !cmd.is_ascii() || cmd.contains(['"', '\'', '\\', '$', '`', '<', '>', '{', '}']) || lower.contains("eval") || lower.contains("base64") {
        return hold("shell quoting, expansion, redirect or eval: not plainly readable");
    }
    for part in cmd.split([';', '&', '|', '\n', '\r']) {
        let w: Vec<&str> = part.split_whitespace().collect();
        let Some((&prog, args)) = w.split_first() else { continue };
        if is_assign(prog) {
            return hold("VAR=value prefix");
        }
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
    let flags: Vec<&str> = a.iter().copied().filter(|x| x.starts_with('-')).collect();
    let paths: Vec<&str> = a.iter().copied().filter(|x| !x.starts_with('-')).collect();
    let only = |ok: &[&str]| flags.iter().all(|f| ok.contains(f));
    match prog {
        p if p.contains('/') => Some("path-qualified command"),
        "find" => (!only(&["-name", "-iname", "-type", "-maxdepth", "-mindepth", "-path", "-print", "-newer"]))
            .then_some("find primary not on safe list"),
        "grep" | "rg" => (!only(&[
            "-n", "-i", "-l", "-c", "-r", "-w", "-v", "-F", "-e", "-A", "-B", "-C", "--line-number", "--ignore-case",
        ]))
        .then_some("grep/rg flag not on safe list"),
        "git" => {
            if a.iter().any(|x| x.starts_with("-c")) {
                return Some("git -c");
            }
            match sub {
                Some("diff" | "show" | "log") => {
                    let ok = |f: &str| {
                        matches!(f, "-p" | "--stat" | "--oneline" | "--name-only")
                            || (f.starts_with("-n") && f[2..].chars().all(|c| c.is_ascii_digit()))
                    };
                    (!flags.iter().all(|f| ok(f))).then_some("git diff/show/log flag not on safe list")
                }
                Some(s) if GIT_SUBCMDS.contains(&s) => None,
                _ => Some("git subcommand not on safe list"),
            }
        }
        "cargo" => {
            let ok_sub = sub.is_some_and(|s| CARGO_SUBCMDS.contains(&s));
            let ok_flags = only(&["--release", "--all", "--workspace", "--test", "--lib", "-p", "-q", "--no-fail-fast"]);
            (!(ok_sub && ok_flags)).then_some("cargo subcommand or flag not on safe list")
        }
        "npm" | "pnpm" | "yarn" => {
            if has(&["-g", "-G", "--global"]) {
                Some("global npm install")
            } else if sub.is_some_and(|s| JS_SUBCMDS.contains(&s)) {
                None
            } else {
                Some("npm subcommand not on safe list")
            }
        }
        "cd" => (paths.is_empty() || paths.iter().any(|p| unsafe_path(p))).then_some("cd outside working tree"),
        "rm" => paths.iter().any(|p| unsafe_path(p)).then_some("rm with absolute, parent, wildcard or . path"),
        "mv" | "cp" | "mkdir" | "touch" => {
            if !only(&["-r", "-p", "-f", "-n", "-v"]) {
                Some("mv/cp/mkdir/touch flag not on safe list")
            } else if paths.iter().any(|p| unsafe_path(p)) {
                Some("mv/cp/mkdir/touch with absolute, parent, wildcard or . path")
            } else if prog == "mv" && paths.last().is_some_and(|p| p.to_lowercase().contains("trash")) {
                Some("mv into Trash")
            } else {
                None
            }
        }
        "sort" | "uniq" => {
            if flags.iter().any(|f| f.starts_with("--") || f.contains('o')) {
                Some("sort/uniq -o or long flag")
            } else if prog == "uniq" && paths.len() > 1 {
                Some("uniq with output file")
            } else {
                None
            }
        }
        p if SHELL_READ_ONLY.contains(&p) => None,
        _ => Some("command not on safe list"),
    }
}

/// Lowercase words of a tool name, split on separators and camelCase boundaries.
fn name_words(name: &str) -> Vec<String> {
    let mut spaced = String::new();
    let mut prev_lower = false;
    for c in name.chars() {
        if c.is_uppercase() && prev_lower {
            spaced.push('_');
        }
        prev_lower = c.is_lowercase();
        spaced.push(c);
    }
    spaced.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(String::from).collect()
}

fn non_shell(name: &str, input: &str) -> Verdict {
    let n = name.to_lowercase();
    if LOCAL_TOOLS.contains(&n.as_str()) {
        return Verdict::Allow;
    }
    // Whole-word read verb (read_message, list_files) with no other outward word; "message" must follow the read verb.
    let words = name_words(name);
    let other = words.iter().any(|w| w != "message" && NON_SHELL_OUTWARD.contains(&w.as_str()));
    let read = words.iter().position(|w| READ_WORDS.contains(&w.as_str()));
    let msg = words.iter().position(|w| w == "message");
    if !other && read.is_some_and(|r| msg.is_none_or(|m| r < m)) {
        return Verdict::Allow;
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
    if n == "browser_click" || n == "browser_type" {
        const BROWSER_OUTWARD: &[&str] = &[
            "buy", "pay", "checkout", "order", "purchase", "subscribe", "send", "publish", "post", "submit",
            "confirm", "delete", "sign up", "place order",
        ];
        let outward = BROWSER_OUTWARD.iter().any(|k| i.contains(*k))
            || i.contains("type=submit") || i.contains("\"submit\"")
            || (i.contains("form") && i.contains("action"));
        return if outward { hold("browser outward action") } else { Verdict::Allow };
    }
    if READ_ONLY_TOOLS.contains(&n.as_str()) {
        if n == "webfetch" && ["\"post\"", "\"put\"", "\"patch\"", "\"delete\""].iter().any(|m| i.contains(*m)) {
            return hold("WebFetch write method");
        }
        return Verdict::Allow;
    }
    hold("unrecognized tool, not on read-only list")
}
