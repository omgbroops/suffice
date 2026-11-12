use suffice::adapter::{command, parse_line};
use suffice::types::{Access, AgentKind, Event, Task, TaskState};
use std::collections::BTreeMap;
use std::path::PathBuf;

fn task(agent: AgentKind, prompt: &str, model: Option<&str>) -> Task {
    Task {
        id: "t1".into(),
        agent,
        prompt: prompt.into(),
        cwd: PathBuf::from("/tmp/work"),
        session_key: None,
        deps: vec![],
        max_retries: 0,
        attempts: 0,
        timeout_secs: 60,
        model: model.map(str::to_string),
        access: Access::Edit,
        env: BTreeMap::new(),
        state: TaskState::Pending,
        created_ms: 0,
    }
}

fn sample(name: &str) -> Vec<String> {
    let path = format!("{}/tests/samples/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(path).unwrap().lines().map(str::to_string).collect()
}

fn parse_all(kind: &AgentKind, lines: &[String]) -> Vec<Event> {
    lines.iter().flat_map(|l| parse_line(kind, l)).collect()
}

fn args(c: &suffice::types::Cmd) -> Vec<&str> {
    c.args.iter().map(String::as_str).collect()
}

/// Args with the `-c <hook>` pair removed, since its exe path differs per test binary.
fn without_hook(c: &suffice::types::Cmd) -> Vec<&str> {
    let mut v = args(c);
    let i = v.iter().position(|a| *a == "-c").expect("codex hook -c");
    v.drain(i..i + 2);
    v
}

#[test]
fn claude_command_with_resume_and_model() {
    let mut c = command(&task(AgentKind::Claude, "hi", Some("sonnet")), Some("sess-1"));
    take_settings(&mut c.args);
    assert_eq!(c.program, "claude");
    assert_eq!(
        args(&c),
        ["-p", "hi", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--allowedTools", "Read", "Grep", "Glob", "Edit", "Write", "MultiEdit", "Bash(cargo test:*)", "Bash(cargo build:*)", "Bash(cargo check:*)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(ls:*)", "Bash(npm test:*)", "--resume", "sess-1", "--model", "sonnet"]
    );
    assert_eq!(c.stdin, None);
    assert_eq!(c.cwd, PathBuf::from("/tmp/work"));
}

#[test]
fn claude_command_plain() {
    let mut c = command(&task(AgentKind::Claude, "hi", None), None);
    take_settings(&mut c.args);
    assert_eq!(args(&c), ["-p", "hi", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--allowedTools", "Read", "Grep", "Glob", "Edit", "Write", "MultiEdit", "Bash(cargo test:*)", "Bash(cargo build:*)", "Bash(cargo check:*)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(ls:*)", "Bash(npm test:*)"]);
}

/// Remove the `--settings <json>` pair from a claude argv and return the JSON.
fn take_settings(a: &mut Vec<String>) -> String {
    let i = a.iter().position(|x| x == "--settings").expect("--settings");
    a.remove(i);
    a.remove(i)
}

#[test]
fn claude_command_has_gate_hook() {
    let mut c = command(&task(AgentKind::Claude, "hi", None), None);
    let s = take_settings(&mut c.args);
    let v = suffice::json::parse(&s).expect("settings json");
    let pre = v.get("hooks").and_then(|h| h.get("PreToolUse")).and_then(|p| p.as_arr()).expect("PreToolUse");
    let hook = pre[0].get("hooks").and_then(|h| h.as_arr()).expect("hooks")[0].get("command").and_then(|c| c.as_str()).expect("command");
    assert!(hook.ends_with(" gate-hook"), "{hook}");
    let q = suffice::adapter::claude_hook_settings(std::path::Path::new("/a'b/x")).expect("utf8");
    assert!(q.contains(r"'/a'\\''b/x' gate-hook"), "{q}");
}

#[test]
fn suffice_command_has_gate_cmd() {
    let c = command(&task(AgentKind::Suffice, "hi", None), None);
    let g = c.env.get("SUFFICE_GATE_CMD").expect("SUFFICE_GATE_CMD");
    assert!(g.ends_with(" gate-hook"), "{g}");
}

#[test]
fn codex_command_with_resume_and_model() {
    let c = command(&task(AgentKind::Codex, "do it", Some("gpt-x")), Some("th-9"));
    assert_eq!(c.program, "codex");
    assert_eq!(
        without_hook(&c),
        ["exec", "--json", "--skip-git-repo-check", "-C", "/tmp/work", "--sandbox", "workspace-write", "resume", "th-9", "-m", "gpt-x", "do it"]
    );
}

#[test]
fn codex_command_plain() {
    let c = command(&task(AgentKind::Codex, "do it", None), None);
    assert_eq!(without_hook(&c), ["exec", "--json", "--skip-git-repo-check", "-C", "/tmp/work", "--sandbox", "workspace-write", "do it"]);
}

#[test]
fn opencode_command_with_resume_and_model() {
    let c = command(&task(AgentKind::OpenCode, "p", Some("m1")), Some("s-2"));
    assert_eq!(c.program, "opencode");
    assert_eq!(args(&c), ["run", "--format", "json", "--session", "s-2", "-m", "m1", "p"]);
}

fn opencode_permission(access: Access) -> Option<suffice::json::Value> {
    let mut t = task(AgentKind::OpenCode, "p", None);
    t.access = access;
    let c = command(&t, None);
    c.env.get("OPENCODE_PERMISSION").map(|s| suffice::json::parse(s).expect("valid json"))
}

#[test]
fn opencode_access_sets_permission_env() {
    use suffice::json::Value;
    for (access, edit) in [(Access::Read, "deny"), (Access::Edit, "allow")] {
        let p = opencode_permission(access).expect("permission env set");
        assert_eq!(p.get("edit").and_then(Value::as_str), Some(edit));
        assert_eq!(p.get("bash").and_then(Value::as_str), Some("deny"));
        let mut t = task(AgentKind::OpenCode, "p", None);
        t.access = access;
        let c = command(&t, None);
        assert_eq!(c.env.get("OPENCODE_DISABLE_PROJECT_CONFIG").map(String::as_str), Some("1"));
    }
}

#[test]
fn opencode_full_has_no_permission_env() {
    let mut t = task(AgentKind::OpenCode, "p", None);
    t.access = Access::Full;
    let c = command(&t, None);
    assert!(!c.env.contains_key("OPENCODE_PERMISSION"));
    assert!(!c.env.contains_key("OPENCODE_DISABLE_PROJECT_CONFIG"));
}

#[test]
fn gemini_command_with_resume() {
    let c = command(&task(AgentKind::Gemini, "p", None), Some("g-3"));
    assert_eq!(c.program, "gemini");
    assert_eq!(args(&c), ["-p", "p", "--output-format", "stream-json", "--resume", "g-3"]);
}

#[test]
fn generic_command_appends_prompt() {
    let kind = AgentKind::Generic { program: "echo".into(), args: vec!["a".into(), "b".into()] };
    let c = command(&task(kind, "last", None), Some("ignored"));
    assert_eq!(c.program, "echo");
    assert_eq!(args(&c), ["a", "b", "last"]);
}

#[test]
fn claude_sample_parses_cleanly() {
    let events = parse_all(&AgentKind::Claude, &sample("claude.jsonl"));
    let sessions = events.iter().filter(|e| matches!(e, Event::Session { .. })).count();
    assert_eq!(sessions, 1);
    assert!(events.iter().any(|e| *e == Event::Text { text: "ok".into() }));
    assert!(events.contains(&Event::Result { text: "ok".into(), is_error: false }));
    assert!(events.iter().any(|e| matches!(e, Event::Usage { .. })));
    assert!(!events.iter().any(|e| matches!(e, Event::Raw { .. })));
}

#[test]
fn codex_sample_has_session_and_failed_result() {
    let events = parse_all(&AgentKind::Codex, &sample("codex.jsonl"));
    assert!(events.contains(&Event::Session { native_id: "01a1cdd4-1aa4-7392-9851-5ce7da615254".into() }));
    let last_result = events.iter().rev().find_map(|e| match e {
        Event::Result { is_error, .. } => Some(*is_error),
        _ => None,
    });
    assert_eq!(last_result, Some(true));
}

#[test]
fn garbage_line_is_raw_for_claude() {
    let events = parse_line(&AgentKind::Claude, "not json {");
    assert_eq!(events, vec![Event::Raw { line: "not json {".into() }]);
}

#[test]
fn prompt_is_one_unchanged_argv_element() {
    let prompt = "say \"hi\"\nthen `; rm -rf /` 'x'";
    for kind in [AgentKind::Claude, AgentKind::Codex, AgentKind::OpenCode, AgentKind::Gemini] {
        let c = command(&task(kind, prompt, None), None);
        assert_eq!(c.args.iter().filter(|a| a.as_str() == prompt).count(), 1);
    }
}

fn with_access(agent: AgentKind, access: Access) -> Task {
    let mut t = task(agent, "do it", None);
    t.access = access;
    t
}

#[test]
fn suffice_access_argv() {
    for (access, name) in [(Access::Read, "read"), (Access::Edit, "edit"), (Access::Full, "full")] {
        let c = command(&with_access(AgentKind::Suffice, access), None);
        let i = c.args.iter().position(|a| a == "--access").expect("--access");
        assert_eq!(c.args[i + 1], name, "{access:?}");
    }
}

#[test]
fn claude_access_argv() {
    let edit_tools = [
        "Read", "Grep", "Glob", "Edit", "Write", "MultiEdit", "Bash(cargo test:*)", "Bash(cargo build:*)",
        "Bash(cargo check:*)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(ls:*)",
        "Bash(npm test:*)",
    ];
    let mut edit = vec!["--permission-mode", "dontAsk", "--allowedTools"];
    edit.extend(edit_tools);
    let read = ["--permission-mode", "dontAsk", "--allowedTools", "Read", "Grep", "Glob", "WebSearch"];
    let full = ["--permission-mode", "bypassPermissions"];
    for (access, want) in [(Access::Read, &read[..]), (Access::Edit, &edit[..]), (Access::Full, &full[..])] {
        let mut c = command(&with_access(AgentKind::Claude, access), None);
        take_settings(&mut c.args);
        let mut expect = vec!["-p".to_string(), "do it".into(), "--output-format".into(), "stream-json".into(), "--verbose".into()];
        expect.extend(want.iter().map(|s| s.to_string()));
        assert_eq!(c.args, expect, "{access:?}");
    }
}

#[test]
fn codex_access_argv() {
    for (access, sandbox) in [(Access::Read, "read-only"), (Access::Edit, "workspace-write"), (Access::Full, "danger-full-access")] {
        let bypass: &[&str] = &[];
        let c = command(&with_access(AgentKind::Codex, access), None);
        assert_eq!(
            without_hook(&c),
            [&["exec", "--json", "--skip-git-repo-check", "-C", "/tmp/work", "--sandbox", sandbox][..], bypass, &["do it"]].concat(),
            "{access:?}"
        );
        let r = command(&with_access(AgentKind::Codex, access), Some("sess"));
        assert_eq!(
            without_hook(&r),
            [&["exec", "--json", "--skip-git-repo-check", "-C", "/tmp/work", "--sandbox", sandbox][..], bypass, &["resume", "sess", "do it"]].concat(),
            "{access:?} resume"
        );
    }
}

#[test]
fn codex_hook_at_every_access_level() {
    for access in [Access::Read, Access::Edit, Access::Full] {
        for resume in [None, Some("sess")] {
            let c = command(&with_access(AgentKind::Codex, access), resume);
            let i = c.args.iter().position(|a| a == "-c").expect("-c");
            assert!(c.args[i + 1].starts_with("hooks.PreToolUse="), "{access:?}");
            assert!(c.args[i + 1].contains(" gate-hook"), "{access:?}");
            let resume_at = c.args.iter().position(|a| a == "resume");
            assert!(resume_at.is_none_or(|r| i < r), "hook must precede resume");
            assert_eq!(c.args.last().map(String::as_str), Some("do it"));
        }
    }
}

#[test]
fn codex_never_bypasses_hook_trust() {
    // the flag would also run a cloned repo's own hooks (e.g. SessionStart) with no model action
    for access in [Access::Read, Access::Edit, Access::Full] {
        let c = command(&with_access(AgentKind::Codex, access), None);
        assert!(!c.args.iter().any(|a| a == "--dangerously-bypass-hook-trust"), "{access:?}");
    }
}

#[test]
fn toml_basic_str_escapes_quote_and_backslash() {
    assert_eq!(suffice::adapter::toml_basic_str(r#"/a"b\c"#), r#"/a\"b\\c"#);
}

#[test]
fn opencode_gemini_generic_have_no_sandbox_flags() {
    let generic = AgentKind::Generic { program: "echo".into(), args: vec![] };
    for kind in [AgentKind::OpenCode, AgentKind::Gemini, generic] {
        let base = command(&with_access(kind.clone(), Access::Edit), None).args;
        for access in [Access::Read, Access::Full] {
            assert_eq!(command(&with_access(kind.clone(), access), None).args, base, "{kind:?} {access:?}");
        }
    }
}

#[test]
fn suffice_command_with_model() {
    std::env::set_var("SUFFICE_REPO", "/repo");
    let c = command(&task(AgentKind::Suffice, "hi", Some("gpt-x")), None);
    assert_eq!(c.program, "node");
    assert_eq!(args(&c), vec!["/repo/packages/cli/bin/suffice.mjs", "-p", "--cwd", "/tmp/work", "--access", "edit", "--model", "gpt-x", "hi"]);
}

#[test]
fn suffice_command_without_model() {
    std::env::set_var("SUFFICE_REPO", "/repo");
    let c = command(&task(AgentKind::Suffice, "hi", None), None);
    assert_eq!(args(&c), vec!["/repo/packages/cli/bin/suffice.mjs", "-p", "--cwd", "/tmp/work", "--access", "edit", "hi"]);
}

#[test]
fn suffice_parse_emits_text_per_line() {
    let ev = parse_line(&AgentKind::Suffice, "final answer");
    assert_eq!(ev, vec![Event::Text { text: "final answer".into() }]);
}

#[test]
fn opencode_gate_env_at_every_access_level() {
    std::env::set_var("SUFFICE_HOME", oc_home()); // command() installs the plugin; keep it out of the real ~/.suffice
    for access in [Access::Read, Access::Edit, Access::Full] {
        let mut t = task(AgentKind::OpenCode, "p", None);
        t.access = access;
        t.env.insert("OPENCODE_PURE".into(), "1".into());
        t.env.insert("SUFFICE_GATE_CMD".into(), "true".into());
        let c = command(&t, None);
        let dir = c.env.get("OPENCODE_CONFIG_DIR").expect("OPENCODE_CONFIG_DIR");
        assert!(dir.ends_with("backend/opencode"), "{dir}");
        let g = c.env.get("SUFFICE_GATE_CMD").expect("SUFFICE_GATE_CMD");
        assert!(g.ends_with(" gate-hook"), "{g}");
        assert_eq!(c.env.get("OPENCODE_PURE").map(String::as_str), Some("0"));
        assert_ne!(c.env.get("OPENCODE_PERMISSION").map(String::as_str), Some("\"deny\""), "plugin installed, tools follow access");
    }
}

fn oc_home() -> PathBuf {
    std::env::temp_dir().join(format!("suffice-oc-home-{}", std::process::id()))
}

#[test]
fn opencode_command_restores_a_tampered_plugin() {
    std::env::set_var("SUFFICE_HOME", oc_home());
    let file = oc_home().join("backend/opencode/plugins/suffice-gate.js");
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    std::fs::write(&file, "export const X = async () => ({});").unwrap();
    command(&task(AgentKind::OpenCode, "p", None), None);
    let want = std::fs::read_to_string(format!("{}/assets/opencode-gate.js", env!("CARGO_MANIFEST_DIR"))).unwrap();
    assert_eq!(std::fs::read_to_string(&file).unwrap(), want);
}

#[test]
fn opencode_denies_every_tool_when_plugin_cannot_install() {
    let deny = |dir: &std::path::Path| {
        suffice::adapter::opencode_gate_env(dir).into_iter().any(|(k, v)| k == "OPENCODE_PERMISSION" && v == "\"deny\"")
    };
    let blocked = oc_home().join("blocked");
    std::fs::create_dir_all(&blocked).unwrap();
    std::fs::write(blocked.join("x"), "a file where the dir should be").unwrap();
    assert!(deny(&blocked.join("x")), "install fails");
    assert!(deny(std::path::Path::new("rel/opencode")), "relative dir");
    assert!(!deny(&oc_home().join("ok")), "good dir keeps access rules");
}

#[test]
fn install_opencode_gate_writes_plugin_asset() {
    let dir = std::env::temp_dir().join(format!("suffice-gate-test-{}", std::process::id()));
    suffice::adapter::install_opencode_gate(&dir).expect("install");
    let got = std::fs::read_to_string(dir.join("plugins/suffice-gate.js")).expect("plugin file");
    let want = std::fs::read_to_string(format!("{}/assets/opencode-gate.js", env!("CARGO_MANIFEST_DIR"))).unwrap();
    assert_eq!(got, want);
    std::fs::remove_dir_all(&dir).unwrap();
}
