//! Black-box integration tests against the real `suffice-backend serve` binary.
//! Agent CLIs are replaced by fixture scripts through SUFFICE_PROGRAM_* env vars.
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use suffice::json::{self, Value};

/// A running server; killed (only this child) on drop.
struct Server {
    child: Child,
    port: u16,
    token: String,
    dir: PathBuf,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

/// Start the real server on a fresh tmp dir; `extra_env` overrides the default fakes.
fn start(name: &str, extra_env: &[(&str, PathBuf)]) -> Server {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("suffice-it-{name}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_suffice-backend"));
    cmd.args(["serve", "--port", "0", "--dir"])
        .arg(&dir)
        .env("SUFFICE_IT_DIR", &dir)
        .env("SUFFICE_PROGRAM_CLAUDE", fixture("it_claude_ok.sh"))
        .env("SUFFICE_PROGRAM_SUFFICE", fixture("it_suffice.sh"))
        .stdout(Stdio::piped());
    for (k, v) in extra_env {
        cmd.env(k, v);
    }
    let mut child = cmd.spawn().unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap()).read_line(&mut line).unwrap();
    let port = line
        .split("127.0.0.1:")
        .nth(1)
        .and_then(|r| r.split_whitespace().next())
        .and_then(|p| p.parse().ok())
        .expect("port in banner");
    let token = fs::read_to_string(dir.join("token")).unwrap().trim().to_string();
    Server { child, port, token, dir }
}

/// Raw exchange; returns everything the server wrote before closing.
fn send(port: u16, request: &str) -> String {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_millis(1500))).unwrap();
    s.write_all(request.as_bytes()).unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    out
}

fn status_of(resp: &str) -> u16 {
    resp.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0)
}

/// Authenticated request; returns (status, body).
fn http(s: &Server, method: &str, path: &str, body: &str) -> (u16, String) {
    let resp = send(
        s.port,
        &format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {}\r\nContent-Length: {}\r\n\r\n{body}",
            s.port,
            s.token,
            body.len()
        ),
    );
    (status_of(&resp), resp.split("\r\n\r\n").nth(1).unwrap_or("").to_string())
}

fn parse(body: &str) -> Value {
    json::parse(body).unwrap_or_else(|e| panic!("bad json ({e}): {body}"))
}

fn task_state(s: &Server, id: &str) -> String {
    let (_, b) = http(s, "GET", &format!("/tasks/{id}"), "");
    parse(&b).get("state").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn task_count(s: &Server) -> usize {
    let (_, b) = http(s, "GET", "/tasks", "");
    parse(&b).as_arr().map_or(0, |a| a.len())
}

/// JSON body with all whitespace removed, so substring checks ignore formatting.
fn compact(body: &str) -> String {
    body.chars().filter(|c| !c.is_whitespace()).collect()
}

fn cwd_json(s: &Server) -> String {
    format!("\"{}\"", s.dir.display())
}

#[test]
fn trigger_every_second_fires_then_disable_stops_and_delete_removes() {
    let s = start("trigger", &[]);
    let body = format!(
        r#"{{"id":"tick","when":{{"kind":"every","secs":1}},"template":{{"agent":"claude","prompt":"say ok","cwd":{}}}}}"#,
        cwd_json(&s)
    );
    let (c, b) = http(&s, "POST", "/triggers", &body);
    assert_eq!(c, 201, "{b}");

    sleep(Duration::from_millis(3500));
    assert_eq!(task_state(&s, "tick-1"), "done");
    assert_eq!(task_state(&s, "tick-2"), "done");

    let (c, b) = http(&s, "POST", "/triggers/tick/disable", "");
    assert_eq!(c, 200, "{b}");
    sleep(Duration::from_millis(500));
    let before = task_count(&s);
    sleep(Duration::from_millis(2000));
    assert_eq!(task_count(&s), before, "trigger fired while disabled");

    let (c, b) = http(&s, "DELETE", "/triggers/tick", "");
    assert_eq!(c, 200, "{b}");
    let (c, b) = http(&s, "GET", "/triggers", "");
    assert_eq!(c, 200);
    assert!(!compact(&b).contains("\"id\":\"tick\""), "trigger still listed: {b}");
}

#[test]
fn gated_template_waits_for_approval_and_agent_never_starts() {
    let s = start("gate", &[]);
    let body = format!(
        r#"{{"id":"gate","when":{{"kind":"manual"}},"template":{{"agent":"claude","prompt":"publish the package to npm","cwd":{}}}}}"#,
        cwd_json(&s)
    );
    let (c, b) = http(&s, "POST", "/triggers", &body);
    assert_eq!(c, 201, "{b}");
    let (c, b) = http(&s, "POST", "/triggers/gate/fire", "");
    assert_eq!(c, 200, "{b}");

    sleep(Duration::from_millis(1000));
    let (c, b) = http(&s, "GET", "/approvals?status=pending", "");
    assert_eq!(c, 200, "{b}");
    assert!(compact(&b).contains("\"task\":\"gate-1\""), "no pending approval for gate-1: {b}");
    assert!(!s.dir.join("started-claude").exists(), "gated agent was started");
}

#[test]
fn over_budget_claude_fails_over_to_suffice_and_usage_reports_percent() {
    let s = start("budget", &[("SUFFICE_PROGRAM_CLAUDE", fixture("it_claude_ratelimit.sh"))]);
    let (c, b) = http(&s, "PUT", "/budgets", r#"{"claude":{"seven_day":0.5}}"#);
    assert_eq!(c, 200, "{b}");

    let first = format!(r#"{{"id":"first","agent":"claude","prompt":"hi","cwd":{}}}"#, cwd_json(&s));
    let (c, b) = http(&s, "POST", "/tasks", &first);
    assert_eq!(c, 201, "{b}");
    sleep(Duration::from_millis(1500));
    assert_eq!(task_state(&s, "first"), "done");

    let second = format!(
        r#"{{"id":"second","agent":"claude","prompt":"hi","cwd":{},"fallback":["suffice"]}}"#,
        cwd_json(&s)
    );
    let (c, b) = http(&s, "POST", "/tasks", &second);
    assert_eq!(c, 201, "{b}");
    sleep(Duration::from_millis(1500));
    let (_, dbg) = http(&s, "GET", "/tasks/second", "");
    let (_, dbg2) = http(&s, "GET", "/events?limit=500", "");
    assert!(s.dir.join("started-suffice").exists(), "second task did not run on suffice: {dbg} {dbg2}");

    let (c, b) = http(&s, "GET", "/events?limit=500", "");
    assert_eq!(c, 200);
    let ev = compact(&b);
    assert!(ev.contains("failover") && ev.contains("\"to\":\"suffice\""), "no failover event: {b}");

    let (c, b) = http(&s, "GET", "/usage", "");
    assert_eq!(c, 200, "{b}");
    let rows = parse(&b);
    let row = rows
        .as_arr()
        .unwrap()
        .iter()
        .find(|r| r.get("kind").and_then(|v| v.as_str()) == Some("claude")
            && r.get("window").and_then(|v| v.as_str()) == Some("seven_day"))
        .unwrap_or_else(|| panic!("no claude seven_day usage row: {b}"));
    match row.get("percent") {
        Some(Value::Num(p)) => assert_eq!(*p, 90.0, "{b}"),
        other => panic!("percent is {other:?}: {b}"),
    }
}

#[test]
fn fallback_to_kind_that_cannot_enforce_read_access_is_refused() {
    let s = start("fallback", &[]);
    let body = format!(
        r#"{{"agent":"claude","prompt":"x","cwd":{},"access":"read","fallback":["opencode"]}}"#,
        cwd_json(&s)
    );
    let (c, b) = http(&s, "POST", "/tasks", &body);
    assert_eq!(c, 400, "{b}");
}

#[test]
fn cors_preflight_allows_put_only_for_allowed_origins() {
    let s = start("cors", &[]);
    let ok = send(
        s.port,
        "OPTIONS /budgets HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://localhost:7711\r\n\
         Access-Control-Request-Method: PUT\r\n\r\n",
    );
    let ok_lc = ok.to_ascii_lowercase();
    assert_eq!(status_of(&ok), 204, "{ok}");
    assert!(ok_lc.contains("access-control-allow-methods") && ok_lc.contains("put"), "{ok}");
    assert!(ok_lc.contains("access-control-allow-origin: http://localhost:7711"), "{ok}");

    let evil = send(
        s.port,
        "OPTIONS /budgets HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://evil.example\r\n\
         Access-Control-Request-Method: PUT\r\n\r\n",
    );
    assert!(!evil.to_ascii_lowercase().contains("access-control-allow-origin"), "{evil}");
}

#[test]
fn every_route_without_token_is_401() {
    let s = start("auth", &[]);
    let routes = [
        ("GET", "/health"),
        ("GET", "/agents"),
        ("GET", "/agents/x"),
        ("GET", "/tasks"),
        ("POST", "/tasks"),
        ("GET", "/tasks/x"),
        ("POST", "/tasks/x/cancel"),
        ("POST", "/tasks/x/retry"),
        ("GET", "/graph"),
        ("GET", "/events"),
        ("GET", "/stream"),
        ("GET", "/approvals"),
        ("POST", "/approvals/x/approve"),
        ("POST", "/approvals/x/deny"),
        ("GET", "/usage"),
        ("GET", "/budgets"),
        ("PUT", "/budgets"),
        ("GET", "/triggers"),
        ("POST", "/triggers"),
        ("POST", "/triggers/x/fire"),
        ("POST", "/triggers/x/enable"),
        ("POST", "/triggers/x/disable"),
        ("DELETE", "/triggers/x"),
    ];
    let mut bad = Vec::new();
    for (m, p) in routes {
        let resp = send(s.port, &format!("{m} {p} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n"));
        if status_of(&resp) != 401 {
            bad.push(format!("{m} {p} -> {}", status_of(&resp)));
        }
    }
    assert!(bad.is_empty(), "routes not returning 401: {bad:?}");
}
