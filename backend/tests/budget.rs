use suffice::adapter::parse_line;
use suffice::orchestrator::{logged_json, Engine};
use suffice::server::serve;
use suffice::types::{Access, AgentKind, Event, Task, TaskState};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

const TOKEN: &str = "test-token";
// unix seconds, well after the sample's resetsAt (1794704400)
const SAMPLE_RESET_S: u64 = 1_794_704_400;

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("suffice-budget-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        Dir(p)
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_claude.sh")
}

fn sample() -> String {
    fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/samples/claude.jsonl")).unwrap()
}

/// Write an executable fake CLI into `dir` and return its path.
fn script(dir: &Path, name: &str, body: &str) -> PathBuf {
    let p = dir.join(name);
    fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap();
    fs::set_permissions(&p, fs::Permissions::from_mode(0o755)).unwrap();
    p
}

/// Fake that emits the sample rate-limit line with status `rejected`, then fails.
fn rejected_script(dir: &Path) -> PathBuf {
    let line = sample().lines().nth(3).unwrap().replace("\"status\": \"allowed\"", "\"status\": \"rejected\"");
    script(dir, "rejected.sh", &format!("echo '{line}'\nexit 1"))
}

/// Fake that prints the full sample transcript (includes the claude rate-limit line) and succeeds.
fn sample_script(dir: &Path) -> PathBuf {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/samples/claude.jsonl");
    script(dir, "sample.sh", &format!("cat '{}'", p.display()))
}

fn task(id: &str, session: Option<&str>) -> Task {
    Task {
        id: id.into(),
        agent: AgentKind::Claude,
        prompt: "p".into(),
        cwd: std::env::temp_dir(),
        session_key: session.map(|s| s.to_string()),
        deps: vec![],
        max_retries: 0,
        attempts: 0,
        timeout_secs: 60,
        model: None,
        access: Access::Edit,
        env: BTreeMap::new(),
        state: TaskState::Pending,
        created_ms: 1,
    }
}

fn state(e: &Engine, id: &str) -> TaskState {
    e.tasks().into_iter().find(|t| t.id == id).unwrap().state
}

fn agent(e: &Engine, id: &str) -> AgentKind {
    e.tasks().into_iter().find(|t| t.id == id).unwrap().agent
}

fn session(e: &Engine, id: &str) -> Option<String> {
    e.tasks().into_iter().find(|t| t.id == id).unwrap().session_key
}

fn has_kind(e: &Engine, kind: &str) -> bool {
    e.events_since(0).iter().any(|l| logged_json(l).get("type").and_then(|v| v.as_str()) == Some(kind))
}

fn caps(kind: &str, window: &str, cap: f64) -> suffice::orchestrator::Caps {
    BTreeMap::from([(kind.to_string(), BTreeMap::from([(window.to_string(), cap)]))])
}

#[test]
fn sample_rate_limit_line_parses_to_utilization() {
    let line = sample().lines().nth(3).unwrap().to_string();
    let evs = parse_line(&AgentKind::Claude, &line);
    let found = evs.iter().find_map(|ev| match ev {
        Event::RateLimit { window, utilization, .. } if window == "seven_day" => Some(*utilization),
        _ => None,
    });
    assert!((found.flatten().expect("seven_day utilization") - 0.56).abs() < 1e-9);
}

#[test]
fn budgets_persist_and_torn_file_falls_back_to_defaults() {
    let d = Dir::new("persist");
    {
        let mut e = Engine::open(&d.0, 2).unwrap();
        e.set_budgets(caps("claude", "seven_day", 0.9)).unwrap();
    }
    let e = Engine::open(&d.0, 2).unwrap();
    assert_eq!(e.budgets(), &caps("claude", "seven_day", 0.9));
    drop(e);

    fs::write(d.0.join("budgets.json"), "{\"claude\": {").unwrap();
    let e = Engine::open(&d.0, 2).unwrap();
    assert!(e.budgets().is_empty());
}

#[test]
fn over_cap_skips_kind_and_fails_over_with_session_suffix() {
    let d = Dir::new("overcap");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", sample_script(&d.0));
    e.set_program("node", fixture());
    e.submit(task("seed", None)).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "seed"), TaskState::Done));

    e.set_budgets(caps("claude", "seven_day", 0.5)).unwrap();
    e.submit_with(task("t2", Some("k")), vec![AgentKind::Suffice]).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(agent(&e, "t2"), AgentKind::Suffice));
    assert_eq!(session(&e, "t2").as_deref(), Some("k@suffice"));
    assert!(has_kind(&e, "failover"));
    assert!(matches!(state(&e, "t2"), TaskState::Done));
}

#[test]
fn rate_limited_exit_fails_over_to_fallback() {
    let d = Dir::new("ratelimit");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", rejected_script(&d.0));
    e.set_program("node", fixture());
    e.submit_with(task("t1", Some("s")), vec![AgentKind::Suffice]).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(agent(&e, "t1"), AgentKind::Suffice));
    assert_eq!(session(&e, "t1").as_deref(), Some("s@suffice"));
    assert!(has_kind(&e, "failover"));
    assert!(matches!(state(&e, "t1"), TaskState::Done));
}

#[test]
fn no_fallback_waits_until_reset_then_tick_readies() {
    let d = Dir::new("waiting");
    let now = Arc::new(AtomicU64::new(1_700_000_000_000));
    let clock = now.clone();
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_clock(move || clock.load(Ordering::SeqCst));
    e.set_program("claude", rejected_script(&d.0));
    e.submit(task("t1", None)).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    match state(&e, "t1") {
        TaskState::Waiting { until } => assert_eq!(until, SAMPLE_RESET_S * 1000),
        other => panic!("expected Waiting, got {other:?}"),
    }

    now.store(SAMPLE_RESET_S * 1000 + 1, Ordering::SeqCst);
    e.tick();
    assert!(!matches!(state(&e, "t1"), TaskState::Waiting { .. }));
}

#[test]
fn budgets_route_round_trips_and_rejects_malformed() {
    let d = Dir::new("route");
    let e = Engine::open(&d.0, 2).unwrap();
    let srv = serve(e, "127.0.0.1:0", TOKEN).unwrap();
    let port = srv.port();
    let auth = format!("Authorization: Bearer {TOKEN}\r\n");

    let (code, _) = http(port, "PUT", "/budgets", &auth, "{\"claude\":{\"seven_day\":0.9}}");
    assert_eq!(code, 200);
    let (code, body) = http(port, "GET", "/budgets", &auth, "");
    assert_eq!(code, 200);
    assert!(body.contains("\"seven_day\""));
    let (code, _) = http(port, "PUT", "/budgets", &auth, "not json");
    assert_eq!(code, 400);
    let (code, _) = http(port, "POST", "/tasks", &auth, "{\"agent\":\"claude\",\"prompt\":\"p\",\"cwd\":\"/tmp\",\"fallback\":[\"codex\"]}");
    assert_eq!(code, 400);
    srv.stop();
}

#[test]
fn usage_reports_plan_percent_from_latest_rate_limit() {
    let d = Dir::new("usage");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", sample_script(&d.0));
    e.submit(task("t1", None)).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    let srv = serve(e, "127.0.0.1:0", TOKEN).unwrap();
    let auth = format!("Authorization: Bearer {TOKEN}\r\n");
    let (code, body) = http(srv.port(), "GET", "/usage", &auth, "");
    assert_eq!(code, 200);
    assert!(body.contains("\"percent\":56"), "body: {body}");
    srv.stop();
}

fn http(port: u16, method: &str, path: &str, headers: &str, body: &str) -> (u16, String) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_millis(1500))).unwrap();
    write!(
        s,
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{headers}Content-Length: {}\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    let code = out.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    (code, out)
}

fn rejected_line() -> String {
    sample().lines().nth(3).unwrap().replace("\"status\": \"allowed\"", "\"status\": \"rejected\"")
}

#[test]
fn cancelled_run_that_is_rate_limited_is_not_revived() {
    let d = Dir::new("cancelled");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", script(&d.0, "slow.sh", &format!("echo '{}'\nsleep 30", rejected_line())));
    e.set_program("node", fixture());
    e.submit_with(task("t1", None), vec![AgentKind::Suffice]).unwrap();
    e.pump(Duration::from_millis(500));
    e.cancel("t1").unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "t1"), TaskState::Cancelled));
    assert!(matches!(agent(&e, "t1"), AgentKind::Claude));
}

#[test]
fn rate_limit_cycles_are_bounded_then_fail() {
    let d = Dir::new("bound");
    let now = Arc::new(AtomicU64::new(1_700_000_000_000));
    let clock = now.clone();
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_clock(move || clock.load(Ordering::SeqCst));
    e.set_program("claude", rejected_script(&d.0));
    e.submit(task("t1", None)).unwrap();
    for _ in 0..4 {
        e.run_until_idle(Duration::from_secs(20));
        if let TaskState::Waiting { until } = state(&e, "t1") {
            now.store(until, Ordering::SeqCst);
            e.tick();
        }
    }
    match state(&e, "t1") {
        TaskState::Failed { error } => assert_eq!(error, "rate limited, gave up"),
        other => panic!("expected Failed, got {other:?}"),
    }
}

#[test]
fn rate_limit_matcher_needs_http_context_and_token_boundaries() {
    use suffice::orchestrator::rate_limit_text;
    assert!(rate_limit_text("HTTP 429 Too Many Requests"));
    assert!(rate_limit_text("Error 429: slow down"));
    assert!(!rate_limit_text("took 1429ms"));
    assert!(!rate_limit_text("listening on port 4290"));
    assert!(!rate_limit_text("finished in 429 ms"));
    assert!(rate_limit_text("Claude AI usage limit reached|1794704400"));
    assert!(rate_limit_text("Error: rate_limit_error"));
    assert!(rate_limit_text("API Error: Rate limit exceeded"));
}

#[test]
fn rate_limited_run_with_tool_calls_waits_for_approval_then_approve_fails_over() {
    let d = Dir::new("partial");
    let tool = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x"}}]}}"#;
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", script(&d.0, "partial.sh", &format!("echo '{tool}'\necho '{}'\nexit 1", rejected_line())));
    e.set_program("node", fixture());
    e.submit_with(task("t1", None), vec![AgentKind::Suffice]).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "t1"), TaskState::NeedsApproval { .. }));
    assert!(matches!(agent(&e, "t1"), AgentKind::Claude));
    e.approve("t1").unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(agent(&e, "t1"), AgentKind::Suffice));
    assert!(matches!(state(&e, "t1"), TaskState::Done));
}

#[test]
fn rerun_approval_deny_marks_failed() {
    let d = Dir::new("deny");
    let tool = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x"}}]}}"#;
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", script(&d.0, "partial2.sh", &format!("echo '{tool}'\necho '{}'\nexit 1", rejected_line())));
    e.submit_with(task("t1", None), vec![AgentKind::Suffice]).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    e.deny("t1").unwrap();
    assert!(matches!(state(&e, "t1"), TaskState::Failed { .. }));
}

#[test]
fn fallbacks_survive_restart_and_drop_primary_and_duplicates() {
    let d = Dir::new("fbpersist");
    {
        let mut e = Engine::open(&d.0, 2).unwrap();
        e.submit_with(task("t1", None), vec![AgentKind::Claude, AgentKind::Suffice, AgentKind::Suffice]).unwrap();
    }
    let text = fs::read_to_string(d.0.join("fallbacks.json")).unwrap();
    assert_eq!(text.matches("suffice").count(), 1, "{text}");
    assert!(!text.contains("claude"), "{text}");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", rejected_script(&d.0));
    e.set_program("node", fixture());
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(agent(&e, "t1"), AgentKind::Suffice));
}

#[test]
fn rate_limit_matcher_requires_word_boundary_before_rate() {
    use suffice::orchestrator::rate_limit_text;
    for s in ["accurate limit exceeded", "generate limits", "integrate limit"] {
        assert!(!rate_limit_text(s), "{s}");
    }
    for s in ["rate limit: HTTP 429", "rate_limit_error status 429", "Rate-limit error 429"] {
        assert!(rate_limit_text(s), "{s}");
    }
}

#[test]
fn rerun_approval_survives_restart() {
    let d = Dir::new("rerunrestart");
    let tool = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x"}}]}}"#;
    {
        let mut e = Engine::open(&d.0, 2).unwrap();
        e.set_program("claude", script(&d.0, "partial3.sh", &format!("echo '{tool}'\necho '{}'\nexit 1", rejected_line())));
        e.submit_with(task("t1", None), vec![AgentKind::Suffice]).unwrap();
        e.run_until_idle(Duration::from_secs(20));
        assert!(matches!(state(&e, "t1"), TaskState::NeedsApproval { .. }));
    }
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("node", fixture());
    e.approve("t1").unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(agent(&e, "t1"), AgentKind::Suffice));
    assert!(has_kind(&e, "failover"));
}

#[test]
fn cancel_clears_rerun_so_resubmit_and_approve_do_not_fail_over() {
    let d = Dir::new("cancelrerun");
    let tool = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x"}}]}}"#;
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", script(&d.0, "partial4.sh", &format!("echo '{tool}'\necho '{}'\nexit 1", rejected_line())));
    e.set_program("node", fixture());
    e.submit_with(task("t1", None), vec![AgentKind::Suffice]).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "t1"), TaskState::NeedsApproval { .. }));
    e.cancel("t1").unwrap();
    assert!(e.approve("t1").is_err());
    e.run_until_idle(Duration::from_secs(20));
    assert!(!has_kind(&e, "failover"));
    let text = fs::read_to_string(d.0.join("fallbacks.json")).unwrap_or_default();
    assert!(!text.contains("\"t1\""), "{text}");
}

#[test]
fn zero_tool_rate_limit_fails_over_and_publish_prompt_still_gates() {
    let d = Dir::new("npmgate");
    let marker = d.0.join("gemini_ran");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", rejected_script(&d.0));
    e.set_program("node", script(&d.0, "touch.sh", &format!("touch '{}'\necho '{{}}'", marker.display())));
    let mut t = task("t1", None);
    t.prompt = "publish the package to npm".into();
    e.submit_with(t, vec![AgentKind::Suffice]).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "t1"), TaskState::NeedsApproval { .. }));
    assert!(!marker.exists());
    e.approve("t1").unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(has_kind(&e, "failover"));
    assert!(matches!(agent(&e, "t1"), AgentKind::Suffice));
    assert!(matches!(state(&e, "t1"), TaskState::NeedsApproval { .. }));
    assert!(!marker.exists());
}
