//! Per-CLI command building and output parsing. Pure: no process spawning here.
use crate::json::{self, Value};
use crate::types::{Access, AgentKind, Cmd, Event, Task};
use std::path::{Path, PathBuf};

/// Build the headless command for a task. `resume` is the CLI's native session id from a
/// previous run on the same session_key.
pub fn command(task: &Task, resume: Option<&str>) -> Cmd {
    let prompt = task.prompt.clone();
    let (program, args): (String, Vec<String>) = match &task.agent {
        AgentKind::Claude => {
            let mut a = strs(&["-p"]);
            a.push(prompt);
            a.extend(strs(&["--output-format", "stream-json", "--verbose"]));
            a.extend(claude_access(task.access));
            if let Some(id) = resume {
                a.extend(strs(&["--resume", id]));
            }
            if let Some(m) = &task.model {
                a.extend(strs(&["--model", m]));
            }
            ("claude".into(), a)
        }
        AgentKind::Codex => {
            let cwd = task.cwd.to_string_lossy().into_owned();
            let sandbox = match task.access {
                Access::Read => "read-only",
                Access::Edit => "workspace-write",
                Access::Full => "danger-full-access",
            };
            let mut a = strs(&["exec", "--json", "--skip-git-repo-check", "-C", &cwd, "--sandbox", sandbox]);
            if let Some(id) = resume {
                a.extend(strs(&["resume", id]));
            }
            if let Some(m) = &task.model {
                a.extend(strs(&["-m", m]));
            }
            a.push(prompt);
            ("codex".into(), a)
        }
        AgentKind::OpenCode => {
            let mut a = strs(&["run", "--format", "json"]);
            if let Some(id) = resume {
                a.extend(strs(&["--session", id]));
            }
            if let Some(m) = &task.model {
                a.extend(strs(&["-m", m]));
            }
            a.push(prompt);
            ("opencode".into(), a)
        }
        AgentKind::Gemini => {
            // shortcut: gemini flags unverified (CLI not installed), check gemini --help when installed
            // shortcut: no CLI-level sandbox flag for gemini, gate only; check its permission config when wiring
            let mut a = strs(&["-p"]);
            a.push(prompt);
            a.extend(strs(&["--output-format", "stream-json"]));
            if let Some(id) = resume {
                a.extend(strs(&["--resume", id]));
            }
            ("gemini".into(), a)
        }
        AgentKind::Suffice => {
            let repo = std::env::var("SUFFICE_REPO").map(PathBuf::from).unwrap_or_else(|_| {
                Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap_or(Path::new(".")).to_path_buf()
            });
            let script = repo.join("packages/cli/bin/suffice.mjs").to_string_lossy().into_owned();
            let cwd = task.cwd.to_string_lossy().into_owned();
            let mut a = vec![script, "-p".into(), "--cwd".into(), cwd];
            a.extend(strs(&["--access", task.access.name()]));
            if let Some(m) = &task.model {
                a.extend(strs(&["--model", m]));
            }
            a.push(prompt);
            ("node".into(), a)
        }
        AgentKind::Generic { program, args } => {
            // shortcut: no CLI-level sandbox flag for generic, gate only; check its permission config when wiring
            let mut a = args.clone();
            a.push(prompt);
            (program.clone(), a)
        }
    };
    let mut env = task.env.clone();
    if matches!(task.agent, AgentKind::OpenCode) {
        env.extend(opencode_env(task.access));
    }
    Cmd {
        program,
        args,
        cwd: task.cwd.clone(),
        env,
        stdin: None,
    }
}

/// opencode reads its permission config from env, so the access level is enforced there.
fn opencode_env(access: Access) -> Vec<(String, String)> {
    let edit = match access {
        Access::Read => "deny",
        Access::Edit => "allow",
        Access::Full => return vec![],
    };
    let s = Value::str;
    let read = Value::Obj(vec![("*".into(), s("allow")), ("*.env".into(), s("deny")), ("*.env.*".into(), s("deny"))]);
    let perm = Value::Obj(vec![
        ("*".into(), s("deny")),
        ("read".into(), read),
        ("glob".into(), s("allow")),
        ("grep".into(), s("allow")),
        ("lsp".into(), s("allow")),
        ("todowrite".into(), s("allow")),
        ("edit".into(), s(edit)),
        ("bash".into(), s("deny")),
        ("task".into(), s("deny")),
        ("webfetch".into(), s("deny")),
        ("websearch".into(), s("deny")),
        ("external_directory".into(), s("deny")),
        ("doom_loop".into(), s("deny")),
        ("question".into(), s("deny")),
    ]);
    vec![
        ("OPENCODE_PERMISSION".into(), perm.to_string()),
        // a repo's opencode.json must not loosen the access level
        ("OPENCODE_DISABLE_PROJECT_CONFIG".into(), "1".into()),
    ]
}

/// Parse one stdout line from this agent kind into zero or more normalized events.
/// Unparseable lines become Event::Raw, never dropped.
pub fn parse_line(kind: &AgentKind, line: &str) -> Vec<Event> {
    if let AgentKind::Generic { .. } | AgentKind::Suffice = kind {
        return vec![Event::Text { text: line.to_string() }];
    }
    let Ok(v) = json::parse(line) else {
        return raw(line);
    };
    let ev = match kind {
        AgentKind::Claude => claude_event(&v),
        AgentKind::Codex => codex_event(&v),
        // shortcut: opencode event shape unverified, capture a sample
        AgentKind::OpenCode => defensive_event(&v),
        // shortcut: gemini event shape unverified, capture a sample
        AgentKind::Gemini => defensive_event(&v),
        AgentKind::Generic { .. } | AgentKind::Suffice => None,
    };
    ev.unwrap_or_else(|| raw(line))
}

fn raw(line: &str) -> Vec<Event> {
    vec![Event::Raw { line: line.to_string() }]
}

/// Whether the kind's CLI enforces the Access level itself (claude, codex and suffice).
pub fn enforces_access(kind: &AgentKind) -> bool {
    // shortcut: opencode env permission set but unverified, flip after a real run proves it is honored
    matches!(kind, AgentKind::Claude | AgentKind::Codex | AgentKind::Suffice)
}

fn claude_access(access: Access) -> Vec<String> {
    const EDIT_TOOLS: &[&str] = &[
        "Read", "Grep", "Glob", "Edit", "Write", "MultiEdit", "Bash(cargo test:*)", "Bash(cargo build:*)",
        "Bash(cargo check:*)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(ls:*)",
        "Bash(npm test:*)",
    ];
    match access {
        Access::Read => strs(&["--permission-mode", "dontAsk", "--allowedTools", "Read", "Grep", "Glob", "WebSearch"]),
        Access::Edit => {
            let mut a = strs(&["--permission-mode", "dontAsk", "--allowedTools"]);
            a.extend(strs(EDIT_TOOLS));
            a
        }
        Access::Full => strs(&["--permission-mode", "bypassPermissions"]),
    }
}

fn strs(xs: &[&str]) -> Vec<String> {
    xs.iter().map(|s| s.to_string()).collect()
}

fn sget(v: &Value, k: &str) -> Option<String> {
    v.get(k)?.as_str().map(str::to_string)
}

fn tok(v: Option<&Value>) -> u64 {
    v.and_then(Value::as_i64).and_then(|n| u64::try_from(n).ok()).unwrap_or(0)
}

fn usage(u: Option<&Value>, cost_usd: Option<f64>) -> Event {
    Event::Usage {
        input_tokens: tok(u.and_then(|u| u.get("input_tokens"))),
        output_tokens: tok(u.and_then(|u| u.get("output_tokens"))),
        cost_usd,
    }
}

/// One window of a `rate_limit_event`; its own resetsAt/status win over the top-level ones.
fn rate_limit(window: &str, x: &Value, top: &str, top_reset: Option<u64>) -> Event {
    Event::RateLimit {
        window: window.to_string(),
        utilization: match x.get("utilization") {
            Some(Value::Num(n)) => Some(*n),
            _ => None,
        },
        resets_at: x.get("resetsAt").and_then(Value::as_i64).and_then(|n| u64::try_from(n).ok()).or(top_reset),
        status: sget(x, "status").unwrap_or_else(|| top.to_string()),
    }
}

fn claude_event(v: &Value) -> Option<Vec<Event>> {
    let ty = v.get("type").and_then(Value::as_str)?;
    match ty {
        "rate_limit_event" => {
            let info = v.get("rate_limit_info")?;
            let top = sget(info, "status").unwrap_or_default();
            let top_reset = info.get("resetsAt").and_then(Value::as_i64).and_then(|n| u64::try_from(n).ok());
            let mut out = vec![];
            if let Some(Value::Obj(ws)) = info.get("unifiedWindows") {
                out.extend(ws.iter().map(|(w, x)| rate_limit(w, x, &top, top_reset)));
            }
            if out.is_empty() {
                if let Some(w) = sget(info, "rateLimitType") {
                    out.push(rate_limit(&w, info, &top, top_reset));
                }
            }
            Some(out)
        }
        "system" => match v.get("subtype").and_then(Value::as_str) {
            Some("init") => Some(vec![Event::Session { native_id: sget(v, "session_id")? }]),
            Some(s) if s.starts_with("hook") || s.starts_with("rate_limit") => Some(vec![]),
            _ => None,
        },
        "assistant" => {
            let mut out = vec![];
            for item in content(v) {
                match item.get("type").and_then(Value::as_str) {
                    Some("text") => out.push(Event::Text { text: sget(item, "text")? }),
                    Some("tool_use") => out.push(Event::ToolCall {
                        name: sget(item, "name")?,
                        input: item.get("input").map(|i| i.to_string()).unwrap_or_default(),
                    }),
                    _ => {}
                }
            }
            Some(out)
        }
        "user" => {
            let mut out = vec![];
            for item in content(v) {
                if item.get("type").and_then(Value::as_str) == Some("tool_result") {
                    out.push(Event::ToolResult {
                        name: sget(item, "tool_use_id")?,
                        output: output_text(item.get("content")),
                        is_error: item.get("is_error") == Some(&Value::Bool(true)),
                    });
                }
            }
            Some(out)
        }
        "result" => {
            let is_error = v.get("is_error") == Some(&Value::Bool(true))
                || v.get("subtype").and_then(Value::as_str).is_some_and(|s| s != "success");
            let cost = match v.get("total_cost_usd")? {
                Value::Num(n) => Some(*n),
                _ => None,
            };
            Some(vec![
                Event::Result { text: sget(v, "result").unwrap_or_default(), is_error },
                usage(v.get("usage"), cost),
            ])
        }
        _ => None,
    }
}

fn codex_event(v: &Value) -> Option<Vec<Event>> {
    let ty = v.get("type").and_then(Value::as_str)?;
    match ty {
        "thread.started" => Some(vec![Event::Session { native_id: sget(v, "thread_id")? }]),
        "item.completed" => {
            let item = v.get("item")?;
            match item.get("type").and_then(Value::as_str)? {
                "agent_message" => Some(vec![Event::Text { text: sget(item, "text")? }]),
                "command_execution" => {
                    Some(vec![Event::ToolCall { name: "shell".into(), input: sget(item, "command")? }])
                }
                _ => None,
            }
        }
        "turn.completed" => Some(vec![usage(v.get("usage"), None)]),
        "turn.failed" => {
            let text = v.get("error").and_then(|e| sget(e, "message"))?;
            Some(vec![Event::Result { text, is_error: true }])
        }
        "error" => Some(vec![Event::Stderr { line: sget(v, "message")? }]),
        _ => None,
    }
}

/// Best-effort parse for CLIs without a captured sample (opencode, gemini).
fn defensive_event(v: &Value) -> Option<Vec<Event>> {
    let mut out = vec![];
    if let Some(id) = sget(v, "sessionID").or_else(|| sget(v, "session_id")) {
        out.push(Event::Session { native_id: id });
    }
    if let Some(part) = v.get("part") {
        match part.get("type").and_then(Value::as_str) {
            Some("text") => out.extend(sget(part, "text").map(|text| Event::Text { text })),
            Some("tool") => out.extend(sget(part, "tool").map(|name| Event::ToolCall {
                name,
                input: part.get("state").map(|s| s.to_string()).unwrap_or_default(),
            })),
            _ => {}
        }
    }
    if out.is_empty() { None } else { Some(out) }
}

fn content(v: &Value) -> &[Value] {
    v.get("message").and_then(|m| m.get("content")).and_then(Value::as_arr).unwrap_or(&[])
}

/// tool_result content is either a string or an array of {type:"text", text} items.
fn output_text(c: Option<&Value>) -> String {
    match c {
        Some(Value::Str(s)) => s.clone(),
        Some(Value::Arr(items)) => items.iter().filter_map(|i| sget(i, "text")).collect::<Vec<_>>().join("\n"),
        _ => String::new(),
    }
}
