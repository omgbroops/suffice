//! Parser paths that feed the post-hoc gate: codex item events, unreadable claude tool_use, claude user/rate_limit, opencode.
use suffice::adapter::parse_line;
use suffice::gate::{check_event, Verdict};
use suffice::types::{AgentKind, Event};

fn held(ev: &Event) -> bool {
    matches!(check_event(ev), Verdict::Hold { .. })
}

#[test]
fn codex_command_started_is_gated_shell_call() {
    let line = r#"{"type":"item.started","item":{"id":"i1","type":"command_execution","command":"rm -rf ~","status":"in_progress"}}"#;
    let ev = parse_line(&AgentKind::Codex, line);
    assert_eq!(ev, vec![Event::ToolCall { name: "Bash".into(), input: r#"{"command":"rm -rf ~"}"#.into() }]);
    assert!(held(&ev[0]));
}

#[test]
fn codex_command_completed_is_tool_result_only() {
    let fail = r#"{"type":"item.completed","item":{"id":"i1","type":"command_execution","aggregated_output":"boom","exit_code":1,"status":"completed"}}"#;
    assert_eq!(
        parse_line(&AgentKind::Codex, fail),
        vec![Event::ToolResult { name: "i1".into(), output: "boom".into(), is_error: true }]
    );
    let ok = r#"{"type":"item.completed","item":{"id":"i2","type":"command_execution","aggregated_output":"fine","exit_code":0,"status":"completed"}}"#;
    assert_eq!(
        parse_line(&AgentKind::Codex, ok),
        vec![Event::ToolResult { name: "i2".into(), output: "fine".into(), is_error: false }]
    );
}

#[test]
fn codex_mcp_call_started_is_named_tool_call() {
    let line = r#"{"type":"item.started","item":{"id":"i3","type":"mcp_tool_call","server":"srv","tool":"t","arguments":{"a":1}}}"#;
    assert_eq!(
        parse_line(&AgentKind::Codex, line),
        vec![Event::ToolCall { name: "mcp__srv__t".into(), input: r#"{"a":1}"#.into() }]
    );
}

#[test]
fn codex_file_change_started_is_apply_patch() {
    let line = r#"{"type":"item.started","item":{"id":"i4","type":"file_change","changes":[{"path":"a.txt","kind":"add"}]}}"#;
    let ev = parse_line(&AgentKind::Codex, line);
    assert!(matches!(&ev[..], [Event::ToolCall { name, .. }] if name == "apply_patch"), "{ev:?}");
}

#[test]
fn codex_unreadable_tool_call_is_held() {
    let bad_cmd = r#"{"type":"item.started","item":{"id":"i5","type":"command_execution","command":5}}"#;
    let ev = parse_line(&AgentKind::Codex, bad_cmd);
    assert!(matches!(&ev[..], [Event::ToolCall { name, .. }] if name == "codex_unreadable_tool_call"), "{ev:?}");
    assert!(held(&ev[0]));

    let no_tool = r#"{"type":"item.started","item":{"id":"i6","type":"mcp_tool_call","server":"srv"}}"#;
    let ev = parse_line(&AgentKind::Codex, no_tool);
    assert!(matches!(&ev[..], [Event::ToolCall { name, .. }] if name == "codex_unreadable_tool_call"), "{ev:?}");
    assert!(held(&ev[0]));
}

#[test]
fn claude_unnamed_tool_use_keeps_text_and_is_held() {
    let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hi"},{"type":"tool_use","id":"u1","input":{"x":1}}]}}"#;
    let ev = parse_line(&AgentKind::Claude, line);
    assert_eq!(
        ev,
        vec![
            Event::Text { text: "hi".into() },
            Event::ToolCall {
                name: "claude_unreadable_tool_use".into(),
                input: r#"{"type":"tool_use","id":"u1","input":{"x":1}}"#.into(),
            },
        ]
    );
    assert!(held(&ev[1]));
}

#[test]
fn claude_user_tool_result_string_and_array() {
    let s = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u1","content":"out"}]}}"#;
    assert_eq!(
        parse_line(&AgentKind::Claude, s),
        vec![Event::ToolResult { name: "u1".into(), output: "out".into(), is_error: false }]
    );
    let a = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u2","is_error":true,"content":[{"type":"text","text":"a"},{"type":"text","text":"b"}]}]}}"#;
    assert_eq!(
        parse_line(&AgentKind::Claude, a),
        vec![Event::ToolResult { name: "u2".into(), output: "a\nb".into(), is_error: true }]
    );
}

#[test]
fn claude_rate_limit_unified_windows() {
    let line = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":100,"unifiedWindows":{"five_hour":{"utilization":0.5}}}}"#;
    assert_eq!(
        parse_line(&AgentKind::Claude, line),
        vec![Event::RateLimit { window: "five_hour".into(), utilization: Some(0.5), resets_at: Some(100), status: "allowed".into() }]
    );
}

#[test]
fn claude_rate_limit_type_fallback() {
    let line = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":100,"rateLimitType":"seven_day"}}"#;
    let ev = parse_line(&AgentKind::Claude, line);
    assert!(matches!(&ev[..], [Event::RateLimit { window, .. }] if window == "seven_day"), "{ev:?}");
}

#[test]
fn opencode_text_and_tool_parts() {
    let text = r#"{"sessionID":"s1","part":{"type":"text","text":"yo"}}"#;
    assert_eq!(
        parse_line(&AgentKind::OpenCode, text),
        vec![Event::Session { native_id: "s1".into() }, Event::Text { text: "yo".into() }]
    );
    let tool = r#"{"part":{"type":"tool","tool":"bash","state":{"status":"running"}}}"#;
    let ev = parse_line(&AgentKind::OpenCode, tool);
    assert!(matches!(&ev[..], [Event::ToolCall { name, .. }] if name == "bash"), "{ev:?}");
}

#[test]
fn codex_started_item_without_type_is_held() {
    let ev = parse_line(&AgentKind::Codex, r#"{"type":"item.started","item":{"id":"i","command":"rm -rf ~"}}"#);
    assert!(matches!(&ev[..], [Event::ToolCall { name, .. }] if name == "codex_unreadable_tool_call") && held(&ev[0]), "{ev:?}");
}

/// An approval recorded from the parsed codex call must let the codex PreToolUse hook's payload through gate-hook.
#[test]
fn approved_codex_call_matches_the_hook_payload() {
    use std::io::Write;
    let ev = parse_line(&AgentKind::Codex, r#"{"type":"item.started","item":{"id":"i","type":"command_execution","command":"rm -rf ~","status":"in_progress"}}"#);
    let [Event::ToolCall { name, input }] = &ev[..] else { panic!("{ev:?}") };
    assert!(held(&ev[0]));
    let approved = suffice::json::Value::Arr(vec![suffice::json::Value::Obj(vec![
        ("name".into(), suffice::json::Value::Str(name.clone())),
        ("input".into(), suffice::json::Value::Str(input.clone())),
    ])])
    .to_string();
    // codex hook stdin shape per its hooks docs: tool_name "Bash", tool_input {"command": ...}
    let hook = r#"{"session_id":"t","hook_event_name":"PreToolUse","tool_name":"Bash","tool_use_id":"c1","tool_input":{"command":"rm -rf ~"}}"#;
    let run = |env: Option<&str>| {
        let mut c = std::process::Command::new(env!("CARGO_BIN_EXE_suffice-backend"));
        c.arg("gate-hook").stdin(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).env_remove("SUFFICE_APPROVED_CALLS");
        if let Some(e) = env {
            c.env("SUFFICE_APPROVED_CALLS", e);
        }
        let mut c = c.spawn().unwrap();
        c.stdin.take().unwrap().write_all(hook.as_bytes()).unwrap();
        c.wait().unwrap().code()
    };
    assert_eq!(run(None), Some(2), "unapproved must be blocked");
    assert_eq!(run(Some(&approved)), Some(0), "approval from the parsed call must match the hook payload");
}
