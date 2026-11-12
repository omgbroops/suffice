use suffice::orchestrator::Engine;
use suffice::server::{serve, Server};
use suffice::types::{Access, AgentKind, Event, Task, TaskState};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const TOKEN: &str = "test-token";

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("suffice-nightfix-test-{}-{}", name, std::process::id()));
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

/// A fake claude: logs each start to `starts`, then prints `body` and exits.
fn fake(dir: &Path, starts: &Path, body: &str) -> PathBuf {
    let p = dir.join("fake_claude.sh");
    let script = format!("#!/bin/sh\necho start >> '{}'\n{body}\n", starts.display());
    fs::write(&p, script).unwrap();
    fs::set_permissions(&p, fs::Permissions::from_mode(0o755)).unwrap();
    p
}

/// Prints a tool call, then a rate-limit message on stderr, and exits 1.
const RATE_LIMITED_AFTER_TOOL: &str = "echo '{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"name\":\"Read\",\"input\":{\"file_path\":\"/tmp/x\"}}]}}'\necho 'usage limit reached' >&2\nexit 1";

/// Prints a rate-limit message on stderr with no tool call, and exits 1.
const RATE_LIMITED: &str = "echo 'usage limit reached' >&2\nexit 1";

fn task(id: &str, max_retries: u32, access: Access) -> Task {
    Task {
        id: id.into(),
        agent: AgentKind::Claude,
        prompt: "p".into(),
        cwd: std::env::temp_dir(),
        session_key: None,
        deps: vec![],
        max_retries,
        attempts: 0,
        timeout_secs: 60,
        model: None,
        access,
        env: BTreeMap::new(),
        state: TaskState::Pending,
        created_ms: 1,
    }
}

fn state(e: &Engine, id: &str) -> TaskState {
    e.tasks().into_iter().find(|t| t.id == id).unwrap().state
}

fn starts(p: &Path) -> usize {
    fs::read_to_string(p).map_or(0, |s| s.lines().count())
}

fn wait_for(e: &mut Engine, secs: u64, mut done: impl FnMut(&Engine) -> bool) -> bool {
    let end = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < end {
        e.tick();
        if done(e) {
            return true;
        }
        e.pump(Duration::from_millis(100));
    }
    done(e)
}

#[test]
fn denied_rerun_stays_failed_and_never_respawns() {
    let d = Dir::new("deny");
    let starts_file = d.0.join("starts");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", fake(&d.0, &starts_file, RATE_LIMITED_AFTER_TOOL));
    e.submit_with(task("t", 3, Access::Edit), vec![AgentKind::OpenCode]).unwrap();
    assert!(wait_for(&mut e, 10, |e| matches!(state(e, "t"), TaskState::NeedsApproval { .. })), "{:?}", state(&e, "t"));
    e.deny("t").unwrap();
    assert!(matches!(state(&e, "t"), TaskState::Failed { .. }), "{:?}", state(&e, "t"));
    let end = Instant::now() + Duration::from_millis(1500);
    while Instant::now() < end {
        e.tick();
        e.pump(Duration::from_millis(100));
    }
    assert!(matches!(state(&e, "t"), TaskState::Failed { .. }), "{:?}", state(&e, "t"));
    assert_eq!(starts(&starts_file), 1, "a denied rerun must not spawn again");
}

fn wait_fallback_skip(e: &mut Engine) -> bool {
    wait_for(e, 10, |e| {
        e.events_since(0).iter().any(|l| matches!(&l.event, Event::Failover { reason, .. } if reason.starts_with("skipped:")))
    })
}

#[test]
fn persisted_fallback_that_cannot_enforce_access_is_skipped() {
    let d = Dir::new("skip");
    let starts_file = d.0.join("starts");
    let cfg = d.0.join("cfg");
    fs::create_dir_all(&cfg).unwrap();
    fs::write(
        cfg.join("fallbacks.json"),
        r#"{"t": {"kinds": ["gemini"], "waits": 0, "rerun": false}}"#,
    )
    .unwrap();
    let mut e = Engine::open(&cfg, 2).unwrap();
    e.set_program("claude", fake(&d.0, &starts_file, RATE_LIMITED));
    e.submit(task("t", 0, Access::Read)).unwrap();
    assert!(wait_fallback_skip(&mut e), "no skip event");
    let evs = e.events_since(0);
    let skip = evs.iter().find_map(|l| match &l.event {
        Event::Failover { to, reason, .. } => Some((to.clone(), reason.clone())),
        _ => None,
    });
    assert_eq!(skip, Some(("gemini".into(), "skipped: gemini can't enforce read".into())));
    assert!(!evs.iter().any(|l| matches!(&l.event, Event::Failover { reason, .. } if reason == "rate limited")));
    assert_eq!(starts(&starts_file), 1, "only the claude run may start");
}

fn tcp_http(port: u16, method: &str, path: &str, headers: &str, body: &str) -> (u16, String) {
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

fn start_server(name: &str) -> (Dir, Server) {
    let d = Dir::new(name);
    let e = Engine::open(&d.0, 2).unwrap();
    let s = serve(e, "127.0.0.1:0", TOKEN).unwrap();
    (d, s)
}

#[test]
fn post_read_task_with_non_enforcing_fallback_is_400() {
    let (_d, s) = start_server("fallback400");
    let body = r#"{"id":"r1","agent":"claude","prompt":"hi","cwd":"/tmp","access":"read","fallback":["opencode"]}"#;
    let auth = format!("Authorization: Bearer {TOKEN}\r\n");
    let (code, resp) = tcp_http(s.port(), "POST", "/tasks", &auth, body);
    assert_eq!(code, 400, "{resp}");
    assert!(resp.contains("opencode can't enforce read"), "{resp}");
    s.stop();
}

#[test]
fn cors_preflight_allows_put() {
    let (_d, s) = start_server("cors_put");
    let (code, resp) = tcp_http(s.port(), "OPTIONS", "/budgets", "Origin: http://localhost:7711\r\n", "");
    assert_eq!(code, 204);
    let methods = resp.lines().find(|l| l.starts_with("Access-Control-Allow-Methods:")).unwrap_or("");
    assert!(methods.contains("PUT"), "{resp}");
    s.stop();
}

#[test]
fn gemini_fallback_on_edit_task_is_skipped_and_never_spawned() {
    let d = Dir::new("geminiedit");
    let starts_file = d.0.join("starts");
    let gemini_starts = d.0.join("gemini_starts");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", fake(&d.0, &starts_file, RATE_LIMITED));
    let gd = d.0.join("gemini");
    fs::create_dir_all(&gd).unwrap();
    e.set_program("gemini", fake(&gd, &gemini_starts, "exit 0"));
    e.submit_with(task("t", 0, Access::Edit), vec![AgentKind::Claude, AgentKind::Gemini]).unwrap();
    assert!(wait_fallback_skip(&mut e), "no skip event");
    let skip = e.events_since(0).iter().find_map(|l| match &l.event {
        Event::Failover { to, reason, .. } => Some((to.clone(), reason.clone())),
        _ => None,
    });
    assert_eq!(skip, Some(("gemini".into(), "skipped: gemini can't enforce edit".into())));
    assert_eq!(starts(&gemini_starts), 0, "a skipped fallback must never spawn");
}
