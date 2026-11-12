//! Approval gate: nothing gets published, sent, bought or deleted without Abhay's OK.
//! Two checks: before a task starts (its prompt asks for an outward action) and on each ToolCall
//! event while it runs (the agent tries one). A hit holds the task as NeedsApproval.
//! Fail closed: shell commands must be on an allowlist with per-program flag lists; anything unclear holds.
use crate::types::{Access, Event, Task};

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
    "bought", "pay", "paid", "deploy", "delete", "upload", "submit", "push", "forward", "announce",
    "merge", "wipe", "ship", "dm", "cc", "bcc",
];
// Words that hold only as a verb: at clause start or right after to/and/then/please.
const TASK_VERBS: &[&str] = &["text", "order", "post", "drop", "release"];
const VERB_LEAD: &[&str] = &["to", "and", "then", "please"];
// "message" holds unless the previous word is a log/status-like noun or the next word is one of these.
const MSG_PREV: &[&str] = &["error", "commit", "log", "warning", "status", "exit", "help", "usage", "debug"];
const MSG_NEXT: &[&str] = &["mean", "means", "meant", "says", "said", "format"];
// "reply" holds unless every token in its clause is one of these.
const REPLY_OK: &[&str] = &[
    "with", "only", "just", "in", "one", "a", "an", "the", "word", "words", "number", "answer", "ok", "okay", "yes", "no",
    "sentence", "sentences", "line", "lines", "briefly", "using", "json", "plain", "text", "exactly", "short", "single", "done",
    "ready",
];
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

/// Maps fullwidth ASCII and ideographic space to plain ASCII so lookalike words still match.
fn fold(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '\u{FF01}'..='\u{FF5E}' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
            '\u{3000}' => ' ',
            _ => c,
        })
        .collect()
}

/// Words of folded raw text, as (raw, lowercased) pairs, so indices line up even when lowercasing changes length.
fn words(s: &str) -> Vec<(String, String)> {
    s.split(|c: char| !c.is_alphanumeric()).filter(|x| !x.is_empty()).map(|r| (r.to_string(), r.to_lowercase())).collect()
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
    if task.access == Access::Full {
        return hold("full access needs OK");
    }
    let prompt = fold(&task.prompt);
    let all = words(&prompt);
    if let Some(k) = TASK_WORDS.iter().find(|k| all.iter().any(|(_, l)| word_hit(l, k))) {
        return hold(&format!("prompt asks for outward action: {k}"));
    }
    let phrase_hit = |p: &&[&str]| all.windows(p.len()).any(|win| win.iter().zip(p.iter()).all(|((_, l), k)| word_hit(l, k)));
    if let Some(p) = TASK_PHRASES.iter().find(|p| phrase_hit(p)) {
        return hold(&format!("prompt asks for outward action: {}", p.join(" ")));
    }
    // shortcut: word rules catch honest outward asks, not adversarial prompts ("tell bob hi" or "error message bob" pass);
    // tool-call checks (check_event) are the real boundary. Upgrade to a classifier if prompts come from untrusted sources.
    // Clauses split on raw punctuation (not hyphen), so "reply-with-thanks" stays in one clause.
    for clause in prompt.split(['.', ';', ',', ':', '!', '?', '\n', '。', '、']) {
        let cw = words(clause);
        for (j, (_, l)) in cw.iter().enumerate() {
            if word_hit(l, "reply") {
                // a bare "Reply." would pass vacuously and leave the recipient to the next clause
                let answer = j + 1 < cw.len() && cw[j + 1..].iter().all(|(_, n)| REPLY_OK.contains(&n.as_str()));
                if j != 0 || !answer {
                    return hold("prompt asks for outward action: reply");
                }
            }
            if word_hit(l, "message") {
                let prev = if j > 0 { cw[j - 1].1.as_str() } else { "" };
                let shape = MSG_PREV.contains(&prev) || cw.get(j + 1).is_some_and(|(_, n)| MSG_NEXT.contains(&n.as_str()));
                let near = cw[j + 1..(j + 4).min(cw.len())].iter().any(|(_, n)| n == "to" || n == "for");
                let name = cw[j + 1..].iter().any(|(r, _)| r.starts_with(|c: char| c.is_uppercase() || !c.is_ascii()));
                if !shape || near || name {
                    return hold("prompt asks for outward action: message");
                }
            }
        }
        // Verbs match whole space-separated words, so hyphenated compounds like "post-processing" are not verbs.
        let vw: Vec<String> = clause.split_whitespace().map(|x| x.trim_matches(|c: char| !c.is_alphanumeric() && c != '-').to_lowercase()).collect();
        for (i, l) in vw.iter().enumerate() {
            let lead = i == 0 || VERB_LEAD.contains(&vw[i - 1].as_str());
            if let Some(k) = TASK_VERBS.iter().find(|k| lead && word_hit(l, k)) {
                return hold(&format!("prompt asks for outward action: {k}"));
            }
        }
    }
    Verdict::Allow
}

const SHELL_TOOLS: &[&str] = &["bash", "shell", "exec", "command_execution", "run_terminal_cmd"];
// workspace-local tools; patch/todoread/lsp/skill are opencode's, apply_patch/update_plan codex's (their hooks send every call)
const LOCAL_TOOLS: &[&str] = &[
    "edit", "write", "multiedit", "notebookedit", "todowrite", "task", "patch", "apply_patch", "todoread", "update_plan",
    "lsp", "skill",
];
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
        "curl" => {
            // Plain GET only: one http(s) URL plus at least one safe flag (bare `curl URL` stays held).
            let (mut urls, mut bad, mut i) = (0, false, 0);
            while i < a.len() {
                let x = a[i];
                if x.starts_with('-') {
                    match x {
                        "-s" | "-S" | "-L" | "-f" | "-I" | "-i" | "-v" | "--silent" | "--show-error" | "--location" | "--fail" | "--head" => {}
                        "-m" | "--max-time" => {
                            i += 1;
                            bad |= !a.get(i).is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit() || c == '.'));
                        }
                        _ => bad = true,
                    }
                } else if plain_get_url(x) {
                    urls += 1;
                } else {
                    bad = true;
                }
                i += 1;
            }
            (bad || urls != 1 || flags.is_empty()).then_some("curl: only plain GET with safe flags")
        }
        "gh" => {
            // Read-only subcommands; no positionals (so `pr view 3` stays held) and no --web.
            let (mut words, mut bad, mut i) = (Vec::new(), false, 0);
            while i < a.len() {
                match a[i] {
                    "--json" => {
                        i += 1;
                        bad |= !a.get(i).is_some_and(|v| !v.starts_with('-'));
                    }
                    "-R" | "--repo" => {
                        i += 1;
                        bad |= !a.get(i).is_some_and(|v| owner_repo(v));
                    }
                    "-L" | "--limit" => {
                        i += 1;
                        bad |= !a.get(i).is_some_and(|v| !v.is_empty() && v.chars().all(|c| c.is_ascii_digit()));
                    }
                    "--state" => {
                        i += 1;
                        bad |= !a.get(i).is_some_and(|v| matches!(*v, "open" | "closed" | "merged" | "all"));
                    }
                    x if x.starts_with('-') => bad = true,
                    x => words.push(x),
                }
                i += 1;
            }
            let ok = matches!(words.as_slice(), ["pr", "view" | "list" | "diff" | "checks" | "status"] | ["issue", "view" | "list" | "status"] | ["repo", "view"]);
            (bad || !ok).then_some("gh: only read-only pr/issue/repo subcommands")
        }
        // Real containment for code the agent runs is the CLI sandbox (Access level); this rule only avoids pointless holds.
        "python3" | "node" => {
            let script = |p: &str| {
                let ext = if prog == "python3" { p.ends_with(".py") } else { p.ends_with(".js") || p.ends_with(".mjs") };
                ext && !p.starts_with('-') && !p.contains('/') && !unsafe_path(p)
            };
            let ok = a.len() == 1 && script(a[0]);
            (!ok).then_some("python3/node: only a plain relative script, no flags")
        }
        "docker" => match a {
            ["ps" | "images"] => None,
            ["build", "-t", name, path] => {
                let ctx = *path == "." || (path.chars().all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c)) && !path.contains(".git") && !path.contains(".."));
                let ok = !name.starts_with('-') && !path.starts_with('-') && ctx;
                (!ok).then_some("docker build: only -t NAME and a relative path")
            }
            _ => Some("docker subcommand not on safe list"),
        },
        p if SHELL_READ_ONLY.contains(&p) => None,
        _ => Some("command not on safe list"),
    }
}

/// curl GET target: https, exact allowlisted host, no userinfo, globbing or long query.
fn plain_get_url(u: &str) -> bool {
    const HOSTS: &[&str] = &[
        "github.com", "api.github.com", "raw.githubusercontent.com", "crates.io", "static.crates.io", "docs.rs",
        "registry.npmjs.org", "pypi.org", "files.pythonhosted.org",
    ];
    let Some(rest) = u.strip_prefix("https://") else { return false };
    let host = &rest[..rest.find(['/', '?', '#']).unwrap_or(rest.len())];
    let query_len = u.split_once('?').map_or(0, |(_, q)| q.len());
    HOSTS.contains(&host) && query_len <= 200 && !u.contains(['[', ']', '{', '}', '@'])
}

/// gh -R/--repo value: exactly owner/repo, no host prefix.
fn owner_repo(v: &str) -> bool {
    let ok = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c));
    v.split_once('/').is_some_and(|(o, r)| ok(o) && ok(r))
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
