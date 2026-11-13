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
            a.extend(claude_hook());
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
            // shortcut: no --dangerously-bypass-hook-trust (it also runs a cloned repo's own hooks unprompted),
            // so codex may skip this untrusted hook; live run needed to see, then trust it via a managed layer
            a.extend(codex_hook());
            if let Some(id) = resume {
                a.extend(strs(&["resume", id]));
            }
            if let Some(m) = &task.model {
                a.extend(strs(&["-m", m]));
            }
            a.push(prompt_arg(prompt));
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
            a.push(prompt_arg(prompt));
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
            a.push(prompt_arg(prompt));
            ("node".into(), a)
        }
        AgentKind::Generic { program, args } => {
            // shortcut: no CLI-level sandbox flag for generic, gate only; check its permission config when wiring
            let mut a = args.clone();
            a.push(prompt_arg(prompt));
            (program.clone(), a)
        }
    };
    let mut env = task.env.clone();
    if matches!(task.agent, AgentKind::OpenCode) {
        env.extend(opencode_env(task.access));
        // set after task.env so a task cannot override the gate plugin or disable it (OPENCODE_PURE)
        env.extend(opencode_gate_env(&opencode_config_dir()));
    }
    if matches!(task.agent, AgentKind::Suffice) {
        env.insert("SUFFICE_GATE_CMD".into(), suffice_gate_cmd());
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

/// `--settings` wiring a PreToolUse hook to this binary's `gate-hook`; empty if the exe path is unknown.
fn claude_hook() -> Vec<String> {
    // no usable exe path: a hook that blocks every tool call, so the gate fails closed instead of vanishing
    let s = std::env::current_exe().ok().and_then(|exe| claude_hook_settings(&exe)).unwrap_or_else(|| hook_json("echo 'suffice gate: hook unavailable' >&2; exit 2"));
    vec!["--settings".into(), s]
}

/// Settings JSON for a PreToolUse command hook running `exe gate-hook`. None if the path is not UTF-8.
pub fn claude_hook_settings(exe: &Path) -> Option<String> {
    Some(hook_json(&gate_hook_command(exe)?))
}

/// One `-c hooks=...` value running the gate hook for codex and self-trusting it by exact hash
/// (key and hash scheme from codex 0.159). Fails closed like `claude_hook`.
fn codex_hook() -> Vec<String> {
    let cmd = std::env::current_exe().ok().and_then(|exe| gate_hook_command(&exe)).unwrap_or_else(|| "echo 'suffice gate: hook unavailable' >&2; exit 2".into());
    let key = "/<session-flags>/config.toml:pre_tool_use:0:0";
    let hooks = format!(
        "hooks={{PreToolUse=[{{matcher=\".*\",hooks=[{{type=\"command\",command=\"{}\",timeout=600}}]}}],state={{\"{key}\"={{trusted_hash=\"{}\"}}}}}}",
        toml_basic_str(&cmd),
        codex_hook_trust_hash(&cmd)
    );
    vec!["-c".into(), hooks]
}

/// Codex's trust hash for a single pre_tool_use command hook (matcher ".*", timeout 600).
pub fn codex_hook_trust_hash(cmd: &str) -> String {
    let json = format!(
        "{{\"event_name\":\"pre_tool_use\",\"hooks\":[{{\"async\":false,\"command\":{},\"timeout\":600,\"type\":\"command\"}}],\"matcher\":\".*\"}}",
        json_str(cmd)
    );
    format!("sha256:{}", sha256_hex(json.as_bytes()))
}

/// JSON string literal escaped like serde_json (`/` and non-ASCII left raw).
fn json_str(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Lowercase hex SHA-256 (FIPS 180-4), std only.
pub fn sha256_hex(bytes: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    let mut msg = bytes.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&(bytes.len() as u64).wrapping_mul(8).to_be_bytes());
    for block in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([block[4 * i], block[4 * i + 1], block[4 * i + 2], block[4 * i + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let mut v = h;
        for i in 0..64 {
            let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
            let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
            let t1 = v[7].wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
            let maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(maj);
            v = [t1.wrapping_add(t2), v[0], v[1], v[2], v[3].wrapping_add(t1), v[4], v[5], v[6]];
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(v[i]);
        }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

/// Escapes `\`, `"` and control chars so `s` can sit inside a TOML basic string.
pub fn toml_basic_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 || c as u32 == 0x7f => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// `'<exe>' gate-hook` with the exe path shell-quoted. None if the path is not UTF-8.
pub fn gate_hook_command(exe: &Path) -> Option<String> {
    let quoted = format!("'{}'", exe.to_str()?.replace('\'', "'\\''"));
    Some(format!("{quoted} gate-hook"))
}

/// Shell command the suffice CLI runs before each bash call; exit 2 blocks it. Fails closed if the exe path is unknown.
fn suffice_gate_cmd() -> String {
    std::env::current_exe().ok().and_then(|exe| gate_hook_command(&exe)).unwrap_or_else(|| "echo 'suffice gate: hook unavailable' >&2; exit 2".into())
}

/// Gate plugin source, loaded by opencode from `<opencode_config_dir>/plugins/`.
const OPENCODE_GATE_JS: &str = include_str!("../assets/opencode-gate.js");

/// Config dir opencode reads the gate plugin from: `<SUFFICE_HOME or ~/.suffice>/backend/opencode`.
pub fn opencode_config_dir() -> PathBuf {
    let base = std::env::var("SUFFICE_HOME").map(PathBuf::from).unwrap_or_else(|_| {
        std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(".")).join(".suffice")
    });
    base.join("backend").join("opencode")
}

/// Gate env for an opencode run reading plugins from `dir`. Reinstalls the plugin every run, since an
/// earlier run's agent may have rewritten it; if that fails, opencode's own permission denies every tool.
pub fn opencode_gate_env(dir: &Path) -> Vec<(String, String)> {
    let mut env = vec![
        ("OPENCODE_CONFIG_DIR".into(), dir.to_string_lossy().into_owned()),
        ("SUFFICE_GATE_CMD".into(), suffice_gate_cmd()),
        ("OPENCODE_PURE".into(), "0".into()),
    ];
    if !dir.is_absolute() || install_opencode_gate(dir).is_err() {
        env.push(("OPENCODE_PERMISSION".into(), "\"deny\"".into()));
    }
    env
}

/// Writes the gate plugin into `dir/plugins/suffice-gate.js` if its content differs. Caller must fail startup on error.
pub fn install_opencode_gate(dir: &Path) -> std::io::Result<()> {
    let plugins = dir.join("plugins");
    std::fs::create_dir_all(&plugins)?;
    let file = plugins.join("suffice-gate.js");
    if std::fs::read_to_string(&file).ok().as_deref() == Some(OPENCODE_GATE_JS) {
        return Ok(());
    }
    // temp + rename: a plain write truncates first, so a starting opencode could load an empty plugin.
    // The temp name must not end in .js/.ts, or opencode's plugins/*.{js,ts} glob would load it.
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = plugins.join(format!(".suffice-gate.{}.{n}.tmp", std::process::id()));
    std::fs::write(&tmp, OPENCODE_GATE_JS)?;
    std::fs::rename(&tmp, file).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

fn hook_json(command: &str) -> String {
    let cmd = Value::Str(command.to_string());
    let hook = Value::Obj(vec![("type".into(), Value::str("command")), ("command".into(), cmd)]);
    let entry = Value::Obj(vec![("matcher".into(), Value::str("*")), ("hooks".into(), Value::Arr(vec![hook]))]);
    let pre = Value::Obj(vec![("PreToolUse".into(), Value::Arr(vec![entry]))]);
    Value::Obj(vec![("hooks".into(), pre)]).to_string()
}

/// Prompt as a trailing positional: a leading '-' would parse as a flag, so it gets a leading space.
// shortcut: leading space alters the prompt text, upgrade to a proper `--` separator once each CLI's parser is confirmed
fn prompt_arg(prompt: String) -> String {
    if prompt.starts_with('-') { format!(" {prompt}") } else { prompt }
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
                    Some("text") => {
                        if let Some(text) = sget(item, "text") {
                            out.push(Event::Text { text });
                        }
                    }
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
