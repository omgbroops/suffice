//! Approval gate: nothing gets published, sent, bought or deleted without Abhay's OK.
//! Two checks: before a task starts (its prompt asks for an outward action) and on each ToolCall
//! event while it runs (the agent tries one). A hit holds the task as NeedsApproval.
use crate::types::{Event, Task};

#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    Allow,
    Hold { reason: String },
}

fn hold(reason: &str) -> Verdict {
    Verdict::Hold { reason: reason.to_string() }
}

// Single words match as prefixes (errs toward holding); phrases match as exact token runs.
const TASK_WORDS: &[&str] = &[
    "publish", "send", "email", "post", "tweet", "buy", "purchase", "pay", "order", "deploy",
    "delete", "upload", "submit", "push",
];
const TASK_PHRASES: &[&[&str]] = &[&["open", "a", "pr"], &["open", "a", "pull"], &["open", "pr"], &["open", "pull"]];

fn tokens(s: &str) -> Vec<String> {
    s.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(String::from).collect()
}

/// Pre-start check on the task itself.
pub fn check_task(task: &Task) -> Verdict {
    let w = tokens(&task.prompt);
    if let Some(k) = TASK_WORDS.iter().find(|k| w.iter().any(|t| t.starts_with(**k))) {
        return hold(&format!("prompt asks for outward action: {k}"));
    }
    let phrase_hit = |p: &&[&str]| w.windows(p.len()).any(|win| win.iter().zip(p.iter()).all(|(a, b)| a.as_str() == *b));
    if let Some(p) = TASK_PHRASES.iter().find(|p| phrase_hit(p)) {
        return hold(&format!("prompt asks for outward action: {}", p.join(" ")));
    }
    Verdict::Allow
}

const SHELL_TOOLS: &[&str] = &["bash", "shell", "exec", "command_execution", "run_terminal_cmd"];
const PROGRAMS: &[&str] = &[
    "git", "gh", "npm", "pnpm", "yarn", "cargo", "twine", "docker", "curl", "wget", "ssh", "scp", "sftp",
    "rsync", "sendmail", "mail", "mailx", "osascript", "rm", "open", "pkill", "killall", "brew", "pip", "pip3",
];
const NON_SHELL_OUTWARD: &[&str] = &[
    "send", "email", "message", "post", "publish", "tweet", "purchase", "buy", "checkout", "pay", "transfer",
    "deploy", "upload", "delete", "remove",
];
const READ_ONLY_TOOLS: &[&str] = &["read", "grep", "glob", "ls", "cat", "websearch", "webfetch"];

/// Live check on one event. Only ToolCall events can hold.
pub fn check_event(event: &Event) -> Verdict {
    let Event::ToolCall { name, input } = event else { return Verdict::Allow };
    let n = name.to_lowercase();
    if SHELL_TOOLS.contains(&n.as_str()) {
        // Every command word in every chained part is checked, so `bash -c`, `$(..)` and `a && b` are covered.
        for seg in segments(input) {
            for i in 0..seg.len() {
                if PROGRAMS.contains(&base(&seg[i])) {
                    if let Some(r) = shell_rule(&seg[i..]) {
                        return hold(r);
                    }
                }
            }
        }
        return Verdict::Allow;
    }
    non_shell(&n, input)
}

fn base(t: &str) -> &str {
    t.rsplit('/').next().unwrap_or(t)
}

/// Split on command separators; JSON noise (quotes, braces) is stripped from each word.
fn segments(text: &str) -> Vec<Vec<String>> {
    let t = text.replace("\\n", "\n").replace("\\t", " ").replace('"', " ");
    t.split(|c: char| matches!(c, ';' | '&' | '|' | '(' | ')' | '`' | '\n' | '\r'))
        .map(|s| {
            s.split_whitespace()
                .map(|w| w.trim_matches(|c: char| matches!(c, '"' | '\'' | '{' | '}' | '[' | ']' | ',')).to_string())
                .filter(|w| !w.is_empty())
                .collect()
        })
        .collect()
}

/// True when a curl/gh/wget style `-X`/`--method` flag names a write verb.
/// `c` is the short flag letter (`'\0'` = none); handles `-X POST`, `-XPOST`, `-sXPOST`, `--method POST`, `--method=POST`.
fn write_method(a: &[&str], c: char, long: &str) -> bool {
    let eq = format!("{long}=");
    let mut i = 0;
    while i < a.len() {
        let x = a[i];
        i += 1;
        let v: &str = if x == long {
            let v = a.get(i).copied().unwrap_or("");
            i += 1;
            v
        } else if let Some(v) = x.strip_prefix(eq.as_str()) {
            v
        } else if x.starts_with('-') && !x.starts_with("--") && x.contains(c) {
            let p = x.find(c).unwrap_or(0) + 1;
            if p == x.len() {
                let v = a.get(i).copied().unwrap_or("");
                i += 1;
                v
            } else {
                &x[p..]
            }
        } else {
            continue;
        };
        if matches!(v.to_ascii_uppercase().as_str(), "POST" | "PUT" | "PATCH" | "DELETE") {
            return true;
        }
    }
    false
}

fn is_curl_body(x: &str) -> bool {
    if x.starts_with("--") {
        ["--data", "--form", "--upload-file", "--json"].iter().any(|p| x.starts_with(*p))
    } else {
        x.starts_with('-') && x[1..].chars().any(|c| matches!(c, 'd' | 'F' | 'T'))
    }
}

/// A path that is not safely under /tmp. Relative paths are allowed (cwd is not known here).
fn outside_tmp(p: &str) -> bool {
    let under = |root: &str| p == root || p.starts_with(&format!("{root}/"));
    let safe = (under("/tmp") || under("/private/tmp")) && !p.contains("..");
    !safe && (p.starts_with('/') || p.starts_with('~') || p.starts_with('$') || p.contains(".."))
}

/// Rule for one command starting at its program word. Returns the matched rule name.
fn shell_rule(t: &[String]) -> Option<&'static str> {
    let a: Vec<&str> = t[1..].iter().map(String::as_str).collect();
    let has = |xs: &[&str]| a.iter().any(|x| xs.contains(x));
    match base(&t[0]) {
        "git" => {
            let mut i = 0;
            while i < a.len() && a[i].starts_with('-') {
                i += if matches!(a[i], "-C" | "-c" | "--git-dir" | "--work-tree" | "--namespace") { 2 } else { 1 };
            }
            (a.get(i) == Some(&"push")).then_some("git push")
        }
        "gh" => {
            let mut w: Vec<&str> = vec![];
            let mut i = 0;
            while i < a.len() {
                if matches!(a[i], "-R" | "--repo" | "--hostname") {
                    i += 2;
                    continue;
                }
                if !a[i].starts_with('-') {
                    w.push(a[i]);
                }
                i += 1;
            }
            match w.as_slice() {
                ["pr", "create" | "merge" | "comment" | "review", ..] => Some("gh pr create/merge/comment/review"),
                ["issue", "create" | "comment", ..] => Some("gh issue create/comment"),
                ["release", ..] => Some("gh release"),
                ["api", ..] if write_method(&a, 'X', "--method") || has(&["-f", "-F", "--field", "--raw-field", "--input"]) => {
                    Some("gh api POST/PATCH/PUT/DELETE")
                }
                _ => None,
            }
        }
        "npm" | "pnpm" | "yarn" => {
            if a.contains(&"publish") {
                Some("npm/pnpm/yarn publish")
            } else if has(&["-g", "-G", "--global"]) && has(&["install", "i", "add"]) {
                Some("npm global install")
            } else {
                None
            }
        }
        "cargo" => a.contains(&"publish").then_some("cargo publish"),
        "twine" => a.contains(&"upload").then_some("twine upload"),
        "docker" => a.contains(&"push").then_some("docker push"),
        "curl" => {
            if write_method(&a, 'X', "--request") {
                Some("curl POST/PUT/PATCH/DELETE")
            } else if a.iter().any(|x| is_curl_body(x)) {
                Some("curl body (-d/-F/-T/--upload-file)")
            } else {
                None
            }
        }
        "wget" => {
            let body = a.iter().any(|x| x.starts_with("--post-") || x.starts_with("--body-"));
            (body || write_method(&a, '\0', "--method")).then_some("wget POST/body")
        }
        "ssh" | "scp" | "sftp" => Some("ssh/scp/sftp to remote host"),
        "rsync" => a.iter().any(|x| x.contains(':') && !x.starts_with('-')).then_some("rsync to remote host"),
        "sendmail" | "mail" | "mailx" => Some("sends mail"),
        "osascript" => Some("osascript (can send messages)"),
        "rm" => {
            let rec = a.iter().any(|x| *x == "--recursive" || (x.starts_with('-') && !x.starts_with("--") && x.chars().any(|c| c == 'r' || c == 'R')));
            let bad = a.iter().filter(|x| !x.starts_with('-')).any(|x| outside_tmp(x));
            (rec && bad).then_some("rm -r outside /tmp")
        }
        "open" => a.iter().any(|x| x.contains("://") || x.starts_with("mailto:")).then_some("open URL"),
        "pkill" | "killall" => Some("pkill/killall"),
        "brew" | "pip" | "pip3" => a.contains(&"install").then_some("brew/pip install"),
        _ => None,
    }
}

fn non_shell(n: &str, input: &str) -> Verdict {
    let i = input.to_lowercase();
    if let Some(k) = NON_SHELL_OUTWARD.iter().find(|k| n.contains(**k)) {
        return hold(&format!("outward tool name: {k}"));
    }
    if n.contains("submit") {
        return hold("browser form submit");
    }
    let buy_words = ["buy", "pay", "checkout", "place order", "send", "publish", "post", "confirm", "delete"];
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
