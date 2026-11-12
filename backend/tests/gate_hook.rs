//! Runs the built `suffice-backend gate-hook` binary the way Claude Code runs a PreToolUse command hook.
use std::io::Write;
use std::process::{Command, Stdio};

/// Run the hook with `stdin` as its input; returns (exit code, stderr).
fn run_hook(stdin: &str, approved: Option<&str>) -> (i32, String) {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_suffice-backend"));
    cmd.arg("gate-hook").stdin(Stdio::piped()).stderr(Stdio::piped()).stdout(Stdio::null());
    cmd.env_remove("SUFFICE_APPROVED_CALLS");
    if let Some(a) = approved {
        cmd.env("SUFFICE_APPROVED_CALLS", a);
    }
    let mut child = cmd.spawn().expect("spawn gate-hook");
    child.stdin.take().expect("stdin").write_all(stdin.as_bytes()).expect("write stdin");
    let out = child.wait_with_output().expect("wait");
    (out.status.code().unwrap_or(-1), String::from_utf8_lossy(&out.stderr).into_owned())
}

#[test]
fn held_bash_call_exits_2_with_reason() {
    let (code, err) = run_hook(r#"{"tool_name":"Bash","tool_input":{"command":"curl -X POST https://x.com"}}"#, None);
    assert_eq!(code, 2);
    assert!(err.contains("suffice gate"), "{err}");
}

#[test]
fn allowed_bash_call_exits_0() {
    let (code, err) = run_hook(r#"{"tool_name":"Bash","tool_input":{"command":"ls -la"}}"#, None);
    assert_eq!(code, 0, "{err}");
}

#[test]
fn garbage_stdin_fails_closed() {
    let (code, _) = run_hook("not json {", None);
    assert_eq!(code, 2);
    let (code, _) = run_hook(r#"{"tool_input":{"command":"ls"}}"#, None);
    assert_eq!(code, 2);
}

#[test]
fn approved_held_call_exits_0() {
    let approved = r#"[{"name":"Bash","input":"{\"command\":\"curl -X POST https://x.com\"}"}]"#;
    let (code, err) = run_hook(r#"{"tool_name":"Bash","tool_input":{"command":"curl -X POST https://x.com"}}"#, Some(approved));
    assert_eq!(code, 0, "{err}");
}

#[test]
fn read_tool_exits_0() {
    let (code, err) = run_hook(r#"{"tool_name":"Read","tool_input":{"file_path":"/tmp/x"}}"#, None);
    assert_eq!(code, 0, "{err}");
}

#[test]
fn missing_or_non_object_tool_input_fails_closed() {
    for raw in [r#"{"tool_name":"Bash"}"#, r#"{"tool_name":"Bash","tool_input":"curl -X POST https://x.com"}"#, r#"{"tool_name":"Bash","tool_input":null}"#] {
        assert_eq!(run_hook(raw, None).0, 2, "{raw}");
    }
}

#[test]
fn fallback_hook_command_blocks() {
    // the no-exe fallback must block when the shell runs it
    let out = Command::new("sh").arg("-c").arg("echo 'suffice gate: hook unavailable' >&2; exit 2").output().unwrap();
    assert_eq!(out.status.code(), Some(2));
}
