//! gemini-cli stream-json (packages/core/src/output/types.ts) must reach the gate: gemini has no pre-exec hook.
use std::collections::BTreeMap;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::time::{Duration, Instant};
use suffice::adapter::parse_line;
use suffice::gate::{check_event, Verdict};
use suffice::orchestrator::Engine;
use suffice::types::{Access, AgentKind, Event, Task, TaskState};

fn held(ev: &Event) -> bool {
    matches!(check_event(ev), Verdict::Hold { .. })
}

#[test]
fn gemini_tool_use_is_a_gated_tool_call() {
    let rm = r#"{"type":"tool_use","timestamp":"t","tool_name":"run_shell_command","tool_id":"1","parameters":{"command":"rm -rf ~"}}"#;
    let ev = parse_line(&AgentKind::Gemini, rm);
    assert!(matches!(&ev[..], [Event::ToolCall { name, .. }] if name == "run_shell_command"), "{ev:?}");
    assert!(held(&ev[0]));
    let ls = r#"{"type":"tool_use","timestamp":"t","tool_name":"run_shell_command","tool_id":"2","parameters":{"command":"ls"}}"#;
    assert!(!held(&parse_line(&AgentKind::Gemini, ls)[0]));
    let read = r#"{"type":"tool_use","timestamp":"t","tool_name":"read_file","tool_id":"3","parameters":{"absolute_path":"/x"}}"#;
    assert!(!held(&parse_line(&AgentKind::Gemini, read)[0]));
    // unreadable tool_use: still a call, and held
    for bad in [r#"{"type":"tool_use","parameters":{"command":"ls"}}"#, r#"{"type":"tool_use","tool_name":"run_shell_command","parameters":"ls"}"#] {
        let ev = parse_line(&AgentKind::Gemini, bad);
        assert!(matches!(&ev[..], [Event::ToolCall { .. }]) && held(&ev[0]), "{bad}: {ev:?}");
    }
}

#[test]
fn gemini_session_text_and_result() {
    let ev = parse_line(&AgentKind::Gemini, r#"{"type":"init","timestamp":"t","session_id":"abc","model":"m"}"#);
    assert!(matches!(&ev[..], [Event::Session { native_id }] if native_id == "abc"));
    let ev = parse_line(&AgentKind::Gemini, r#"{"type":"message","timestamp":"t","role":"assistant","content":"hi"}"#);
    assert!(matches!(&ev[..], [Event::Text { text }] if text == "hi"));
    let ev = parse_line(&AgentKind::Gemini, r#"{"type":"result","timestamp":"t","status":"error","error":{"type":"x","message":"boom"}}"#);
    assert!(matches!(&ev[..], [Event::Result { text, is_error: true }] if text == "boom"));
    let ev = parse_line(&AgentKind::Gemini, r#"{"type":"result","timestamp":"t","status":"success"}"#);
    assert!(matches!(&ev[..], [Event::Result { is_error: false, .. }]));
}

#[test]
fn gemini_run_with_destructive_shell_call_needs_approval() {
    let dir = std::env::temp_dir().join(format!("suffice-gemini-gate-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let stub = dir.join("gemini.sh");
    fs::write(&stub, "#!/bin/sh\necho '{\"type\":\"init\",\"timestamp\":\"t\",\"session_id\":\"s1\",\"model\":\"m\"}'\necho '{\"type\":\"tool_use\",\"timestamp\":\"t\",\"tool_name\":\"run_shell_command\",\"tool_id\":\"1\",\"parameters\":{\"command\":\"rm -rf ~\"}}'\nsleep 30\n").unwrap();
    fs::set_permissions(&stub, fs::Permissions::from_mode(0o755)).unwrap();
    let mut e = Engine::open(&dir.join("state"), 1).unwrap();
    e.set_program("gemini", &stub);
    e.submit(Task {
        id: "g".into(),
        agent: AgentKind::Gemini,
        prompt: "p".into(),
        cwd: std::env::temp_dir(),
        session_key: None,
        deps: vec![],
        max_retries: 0,
        attempts: 0,
        timeout_secs: 60,
        model: None,
        access: Access::Edit,
        env: BTreeMap::new(),
        state: TaskState::Pending,
        created_ms: 1,
    })
    .unwrap();
    e.tick();
    let end = Instant::now() + Duration::from_secs(10);
    let st = |e: &Engine| e.tasks().into_iter().find(|t| t.id == "g").unwrap().state;
    while Instant::now() < end && !matches!(st(&e), TaskState::NeedsApproval { .. }) {
        e.pump(Duration::from_millis(100));
    }
    let s = st(&e);
    let _ = e.cancel("g");
    e.run_until_idle(Duration::from_secs(5));
    let _ = fs::remove_dir_all(&dir);
    assert!(matches!(s, TaskState::NeedsApproval { .. }), "gemini rm -rf ran ungated: {s:?}");
}
