use std::collections::BTreeMap;
use std::path::PathBuf;
use suffice::adapter::{command, parse_line};
use suffice::gate::{check_event, Verdict};
use suffice::types::{Access, AgentKind, Event, Task, TaskState};

fn held(v: &Verdict) -> bool {
    matches!(v, Verdict::Hold { .. })
}

fn bash(cmd: &str) -> Event {
    Event::ToolCall { name: "Bash".into(), input: format!(r#"{{"command":"{cmd}"}}"#) }
}

fn call(name: &str, input: &str) -> Event {
    Event::ToolCall { name: name.into(), input: input.into() }
}

fn task(agent: AgentKind, prompt: &str) -> Task {
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
        model: None,
        access: Access::Edit,
        env: BTreeMap::new(),
        state: TaskState::Pending,
        created_ms: 0,
    }
}

#[test]
fn git_risky_subcommand_flags_held() {
    for c in [
        "git fetch --upload-pack=./x.sh ../r",
        "git fetch -u x",
        "git branch -D main",
        "git checkout -- .",
        "git stash clear",
        "git worktree remove --force x",
    ] {
        assert!(held(&check_event(&bash(c))), "not held: {c}");
    }
}

#[test]
fn git_safe_subcommand_forms_allowed() {
    for c in ["git fetch --all", "git branch", "git checkout -b feat", "git status"] {
        assert!(!held(&check_event(&bash(c))), "held: {c}");
    }
}

#[test]
fn non_shell_read_name_with_action_or_command_key_held() {
    for (n, i) in [
        ("get_and_execute", r#"{"cmd":"rm -rf ~"}"#),
        ("list_and_run", "{}"),
        ("read_file", r#"{"cmd":"x"}"#),
    ] {
        assert!(held(&check_event(&call(n, i))), "not held: {n} {i}");
    }
}

#[test]
fn non_shell_read_name_plain_input_allowed() {
    for (n, i) in [("read_file", r#"{"path":"a"}"#), ("list_files", "{}")] {
        assert!(!held(&check_event(&call(n, i))), "held: {n} {i}");
    }
}

#[test]
fn prompt_starting_with_dash_is_not_a_bare_argv_element() {
    let agents = [
        AgentKind::Codex,
        AgentKind::OpenCode,
        AgentKind::Suffice,
        AgentKind::Generic { program: "x".into(), args: vec![] },
    ];
    for kind in agents {
        let c = command(&task(kind.clone(), "--x"), None);
        assert!(!c.args.iter().any(|a| a == "--x"), "bare --x in argv: {kind:?}");
        assert!(c.args.iter().any(|a| a == " --x"), "missing ' --x' in argv: {kind:?}");
    }
}

#[test]
fn claude_assistant_text_without_string_keeps_tool_use() {
    let line = r#"{"type":"assistant","message":{"content":[{"type":"text"},{"type":"tool_use","name":"Bash","input":{"command":"rm -rf /"}}]}}"#;
    let evs = parse_line(&AgentKind::Claude, line);
    assert!(
        evs.iter().any(|e| matches!(e, Event::ToolCall { name, .. } if name == "Bash")),
        "no Bash ToolCall in {evs:?}"
    );
}

fn verdict(name: &str, input: &str) -> bool {
    matches!(check_event(&Event::ToolCall { name: name.into(), input: input.into() }), Verdict::Hold { .. })
}
fn held_sh(c: &str) -> bool {
    verdict("Bash", &suffice::json::Value::Obj(vec![("command".into(), suffice::json::Value::str(c))]).to_string())
}

#[test]
fn git_abbreviations_paths_and_transports_are_held() {
    for c in [
        "git branch --del feat", "git switch --discard-c main", "git checkout --forc x", "git checkout src/foo.rs",
        "git checkout HEAD file", "git checkout ./", "git checkout main", "git fetch ext::sh", "git worktree add /tmp/x",
        "git worktree move a b", "git branch --edit-description", "git branch --set-upstream-to=o/x", "git add --upload-p=x",
        "git stash pop", "git stash drop", "git fetch ../r",
    ] {
        assert!(held_sh(c), "should hold: {c}");
    }
    for c in ["git switch main", "git switch -c feat/x", "git checkout -b feat", "git branch -a", "git fetch origin",
              "git fetch --all", "git stash", "git stash list", "git worktree list", "git status"] {
        assert!(!held_sh(c), "should allow: {c}");
    }
}

#[test]
fn more_action_verbs_and_plurals_skip_the_read_shortcut() {
    for n in ["search_and_replace", "get_and_reset", "list_runs", "read_then_executes", "get_and_push"] {
        assert!(verdict(n, "{}"), "should hold: {n}");
    }
    assert!(!verdict("list_files", "{}"));
}

#[test]
fn gemini_and_codex_shell_tools_route_to_shell_rules() {
    assert!(!verdict("run_shell_command", r#"{"command":"ls"}"#));
    assert!(verdict("run_shell_command", r#"{"command":"rm -rf ~"}"#));
    assert!(!verdict("local_shell", r#"{"command":["ls","-la"]}"#));
    assert!(verdict("local_shell", r#"{"command":["bash","-lc","rm -rf ~"]}"#));
    assert!(verdict("local_shell", r#"{"command":["rm","-rf","/"]}"#));
}

#[test]
fn git_global_options_are_held_and_nested_local_shell_is_read() {
    assert!(held_sh("git -C status -c core.fsmonitor=touch status"));
    assert!(held_sh("git --git-dir status -c core.sshCommand=x fetch origin"));
    assert!(!verdict("local_shell", r#"{"type":"exec","action":{"command":["ls","-la"]}}"#));
    assert!(verdict("local_shell", r#"{"type":"exec","action":{"command":["bash","-lc","rm -rf ~"]}}"#));
}
