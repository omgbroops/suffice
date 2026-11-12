use loom::adapter::{command, parse_line};
use loom::types::{AgentKind, Event, Task, TaskState};
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

fn args(c: &loom::types::Cmd) -> Vec<&str> {
    c.args.iter().map(String::as_str).collect()
}

#[test]
fn claude_command_with_resume_and_model() {
    let c = command(&task(AgentKind::Claude, "hi", Some("sonnet")), Some("sess-1"));
    assert_eq!(c.program, "claude");
    assert_eq!(
        args(&c),
        ["-p", "hi", "--output-format", "stream-json", "--verbose", "--resume", "sess-1", "--model", "sonnet"]
    );
    assert_eq!(c.stdin, None);
    assert_eq!(c.cwd, PathBuf::from("/tmp/work"));
}

#[test]
fn claude_command_plain() {
    let c = command(&task(AgentKind::Claude, "hi", None), None);
    assert_eq!(args(&c), ["-p", "hi", "--output-format", "stream-json", "--verbose"]);
}

#[test]
fn codex_command_with_resume_and_model() {
    let c = command(&task(AgentKind::Codex, "do it", Some("gpt-x")), Some("th-9"));
    assert_eq!(c.program, "codex");
    assert_eq!(
        args(&c),
        ["exec", "--json", "--skip-git-repo-check", "-C", "/tmp/work", "resume", "th-9", "-m", "gpt-x", "do it"]
    );
}

#[test]
fn codex_command_plain() {
    let c = command(&task(AgentKind::Codex, "do it", None), None);
    assert_eq!(args(&c), ["exec", "--json", "--skip-git-repo-check", "-C", "/tmp/work", "do it"]);
}

#[test]
fn opencode_command_with_resume_and_model() {
    let c = command(&task(AgentKind::OpenCode, "p", Some("m1")), Some("s-2"));
    assert_eq!(c.program, "opencode");
    assert_eq!(args(&c), ["run", "--format", "json", "--session", "s-2", "-m", "m1", "p"]);
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
