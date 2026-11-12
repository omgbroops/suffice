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
