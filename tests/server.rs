use loom::orchestrator::Engine;
use loom::server::{serve, Server};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const TOKEN: &str = "test-token";

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("loom-server-test-{}-{}", name, std::process::id()));
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

fn start(name: &str) -> (Dir, Server) {
    let dir = Dir::new(name);
    let mut e = Engine::open(&dir.0, 2).unwrap();
    e.set_program("claude", fixture());
    let s = serve(e, "127.0.0.1:0", TOKEN).unwrap();
    (dir, s)
}

/// Send one request and read until the server closes or the read times out.
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

fn auth() -> String {
    format!("Authorization: Bearer {TOKEN}\r\n")
}

fn body_of(resp: &str) -> &str {
    resp.split_once("\r\n\r\n").map_or("", |(_, b)| b)
}

fn wait_for(secs: u64, mut done: impl FnMut() -> bool) -> bool {
    let end = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < end {
        if done() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    done()
}

fn task_body(id: &str, prompt: &str) -> String {
    format!(r#"{{"id":"{id}","agent":"claude","prompt":"{prompt}","cwd":"/tmp"}}"#)
}

#[test]
fn rejects_without_token_and_serves_health() {
    let (_d, s) = start("auth");
    let (code, _) = http(s.port(), "GET", "/health", "", "");
    assert_eq!(code, 401);
    let (code, body) = http(s.port(), "GET", "/health", &auth(), "");
    assert_eq!(code, 200);
    assert!(body.contains("\"ok\":true"), "{body}");
    s.stop();
}

#[test]
fn unknown_route_404_and_bad_json_400() {
    let (_d, s) = start("routes");
    let (code, _) = http(s.port(), "GET", "/nope", &auth(), "");
    assert_eq!(code, 404);
    let (code, _) = http(s.port(), "POST", "/tasks", &auth(), "{not json");
    assert_eq!(code, 400);
    s.stop();
}

#[test]
fn oversized_body_is_413() {
    let (_d, s) = start("big");
    let mut c = TcpStream::connect(("127.0.0.1", s.port())).unwrap();
    write!(c, "POST /tasks HTTP/1.1\r\n{}Content-Length: 2000000\r\n\r\n", auth()).unwrap();
    let mut out = String::new();
    let _ = c.read_to_string(&mut out);
    assert!(out.starts_with("HTTP/1.1 413"), "{out}");
    s.stop();
}

#[test]
fn cors_preflight_allows_local_origin_only() {
    let (_d, s) = start("cors");
    let ok = format!("Origin: http://localhost:7711\r\n");
    let (code, resp) = http(s.port(), "OPTIONS", "/tasks", &ok, "");
    assert_eq!(code, 204);
    assert!(resp.contains("Access-Control-Allow-Origin: http://localhost:7711"), "{resp}");
    assert!(resp.contains("Authorization, Content-Type, Last-Event-ID"), "{resp}");
    let (_, resp) = http(s.port(), "OPTIONS", "/tasks", "Origin: https://evil.example\r\n", "");
    assert!(!resp.contains("Access-Control-Allow-Origin"), "{resp}");
    s.stop();
}

#[test]
fn post_task_runs_to_done_and_stream_replays_with_ids() {
    let (_d, s) = start("run");
    let port = s.port();
    let (code, resp) = http(port, "POST", "/tasks", &auth(), &task_body("t1", "hello"));
    assert_eq!(code, 201, "{resp}");

    let done = wait_for(20, || {
        let (_, r) = http(port, "GET", "/tasks/t1", &auth(), "");
        body_of(&r).contains("\"state\":\"done\"")
    });
    assert!(done, "task never reached done");

    let (code, resp) = http(port, "GET", "/stream?since=0&token=test-token", "", "");
    assert_eq!(code, 200);
    assert!(resp.contains("event: state"), "{resp}");
    let ids: Vec<u64> = resp
        .lines()
        .filter_map(|l| l.strip_prefix("id: "))
        .filter_map(|n| n.parse().ok())
        .collect();
    assert!(!ids.is_empty());
    assert!(ids.windows(2).all(|w| w[0] < w[1]), "ids not increasing: {ids:?}");

    let last = *ids.last().unwrap();
    let (_, resp) = http(port, "GET", "/stream", &format!("{}Last-Event-ID: {last}\r\n", auth()), "");
    assert!(!resp.lines().any(|l| l.starts_with("id: ")), "replay after last id duplicated: {resp}");
    s.stop();
}

#[test]
fn stream_requires_token_when_not_in_query() {
    let (_d, s) = start("streamauth");
    let (code, _) = http(s.port(), "GET", "/stream", "", "");
    assert_eq!(code, 401);
    s.stop();
}

#[test]
fn publish_task_waits_for_approval_then_approve_or_deny() {
    let (_d, s) = start("approve");
    let port = s.port();
    let (code, _) = http(port, "POST", "/tasks", &auth(), &task_body("p1", "publish the package"));
    assert_eq!(code, 201);
    http(port, "POST", "/tasks", &auth(), &task_body("p2", "publish again"));

    let pending = wait_for(10, || {
        let (_, r) = http(port, "GET", "/approvals?status=pending", &auth(), "");
        body_of(&r).contains("\"task\":\"p1\"") && body_of(&r).contains("\"task\":\"p2\"")
    });
    assert!(pending, "approvals not listed");

    let (code, resp) = http(port, "POST", "/approvals/ap1/approve", &auth(), "");
    assert_eq!(code, 200, "{resp}");
    let ran = wait_for(20, || {
        let (_, r) = http(port, "GET", "/tasks/p1", &auth(), "");
        body_of(&r).contains("\"state\":\"done\"")
    });
    assert!(ran, "approved task did not run");

    let (code, resp) = http(port, "POST", "/approvals/ap2/deny", &auth(), "");
    assert_eq!(code, 200, "{resp}");
    assert!(body_of(&resp).contains("\"state\":\"cancelled\""), "{resp}");
    s.stop();
}

#[test]
fn duplicate_and_unknown_dep_are_400() {
    let (_d, s) = start("dups");
    let port = s.port();
    assert_eq!(http(port, "POST", "/tasks", &auth(), &task_body("d1", "x")).0, 201);
    assert_eq!(http(port, "POST", "/tasks", &auth(), &task_body("d1", "x")).0, 400);
    let bad = r#"{"id":"d2","agent":"claude","prompt":"x","cwd":"/tmp","deps":["nope"]}"#;
    assert_eq!(http(port, "POST", "/tasks", &auth(), bad).0, 400);
    s.stop();
}

fn raw(port: u16, bytes: &[u8]) -> String {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
    s.write_all(bytes).unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    out
}

fn ids_of(resp: &str) -> Vec<u64> {
    resp.lines().filter_map(|l| l.strip_prefix("id: ")).filter_map(|n| n.parse().ok()).collect()
}

#[test]
fn state_events_cover_dep_ready_and_retry() {
    let (_d, s) = start("states");
    let port = s.port();
    http(port, "POST", "/tasks", &auth(), &task_body("s1", "one"));
    let dep = r#"{"id":"s2","agent":"claude","prompt":"two","cwd":"/tmp","deps":["s1"]}"#;
    assert_eq!(http(port, "POST", "/tasks", &auth(), dep).0, 201);
    let retry = r#"{"id":"s3","agent":"claude","prompt":"three","cwd":"/tmp","max_retries":1,"env":{"MODE":"fail"}}"#;
    assert_eq!(http(port, "POST", "/tasks", &auth(), retry).0, 201);
    let finished = wait_for(20, || {
        let (_, r) = http(port, "GET", "/tasks/s3", &auth(), "");
        body_of(&r).contains("\"state\":\"failed\"") && body_of(&r).contains("\"attempts\":1")
    });
    assert!(finished, "retry task did not fail after its retry");
    let (_, dep_ev) = http(port, "GET", "/events?task=s2", &auth(), "");
    assert!(body_of(&dep_ev).contains("\"state\":\"ready\""), "dep ready not logged: {dep_ev}");
    let (_, retry_ev) = http(port, "GET", "/events?task=s3", &auth(), "");
    assert!(retry_ev.matches("\"state\":\"ready\"").count() >= 2, "retry ready not logged: {retry_ev}");
    s.stop();
}

#[test]
fn generic_agent_is_held_until_approved() {
    let (_d, s) = start("generic");
    let port = s.port();
    let body = r#"{"id":"g1","agent":{"generic":{"program":"/bin/echo","args":["hi"]}},"prompt":"x","cwd":"/tmp"}"#;
    assert_eq!(http(port, "POST", "/tasks", &auth(), body).0, 201);
    let held = wait_for(10, || {
        let (_, r) = http(port, "GET", "/tasks/g1", &auth(), "");
        body_of(&r).contains("\"state\":\"needs_approval\"") && body_of(&r).contains("custom program")
    });
    assert!(held, "generic task not held");
    assert_eq!(http(port, "POST", "/approvals/ag1/approve", &auth(), "").0, 200);
    let ran = wait_for(20, || {
        let (_, r) = http(port, "GET", "/tasks/g1", &auth(), "");
        body_of(&r).contains("\"state\":\"done\"")
    });
    assert!(ran, "approved generic task did not run");
    s.stop();
}

#[test]
fn sse_replays_all_events_in_order() {
    let (_d, s) = start("sseorder");
    let port = s.port();
    for i in 0..4 {
        http(port, "POST", "/tasks", &auth(), &task_body(&format!("o{i}"), "hi"));
    }
    wait_for(30, || {
        let (_, r) = http(port, "GET", "/tasks", &auth(), "");
        body_of(&r).matches("\"state\":\"done\"").count() == 4
    });
    let (_, all) = http(port, "GET", "/events?limit=500", &auth(), "");
    let want: Vec<u64> = all.split("\"seq\":").skip(1).filter_map(|x| x.split(|c: char| !c.is_ascii_digit()).next()?.parse().ok()).collect();
    assert!(want.len() >= 20, "need 20+ events, got {}", want.len());
    let (_, resp) = http(port, "GET", "/stream?since=0&token=test-token", "", "");
    let got = ids_of(&resp);
    assert_eq!(got, want);
    s.stop();
}

#[test]
fn deny_on_non_pending_task_is_409() {
    let (_d, s) = start("deny409");
    let port = s.port();
    http(port, "POST", "/tasks", &auth(), &task_body("q1", "hello"));
    wait_for(20, || body_of(&http(port, "GET", "/tasks/q1", &auth(), "").1).contains("\"state\":\"done\""));
    assert_eq!(http(port, "POST", "/approvals/aq1/deny", &auth(), "").0, 409);
    s.stop();
}

#[test]
fn oversized_headers_are_431() {
    let (_d, s) = start("hdrs");
    let mut req = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n{}", s.port(), auth());
    req.push_str(&"X-Pad: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\r\n".repeat(300));
    req.push_str("\r\n");
    let out = raw(s.port(), req.as_bytes());
    assert!(out.starts_with("HTTP/1.1 431"), "{out}");
    s.stop();
}

#[test]
fn bad_percent_escapes_are_400_not_panics() {
    let (_d, s) = start("pct");
    let port = s.port();
    assert_eq!(http(port, "GET", "/tasks/%+1", &auth(), "").0, 400);
    assert_eq!(http(port, "GET", "/tasks/%é", &auth(), "").0, 400);
    assert_eq!(http(port, "GET", "/health", &auth(), "").0, 200, "server died");
    s.stop();
}

#[test]
fn foreign_host_header_is_421() {
    let (_d, s) = start("host");
    let req = format!("GET /health HTTP/1.1\r\nHost: evil.example:{}\r\n{}\r\n", s.port(), auth());
    let out = raw(s.port(), req.as_bytes());
    assert!(out.starts_with("HTTP/1.1 421"), "{out}");
    s.stop();
}

#[test]
fn connection_cap_is_503_above_64() {
    let (_dir, srv) = start("cap");
    let port = srv.port();
    // 64 idle connections each occupy a slot until they send a request or time out
    let idle: Vec<TcpStream> = (0..64).map(|_| TcpStream::connect(("127.0.0.1", port)).unwrap()).collect();
    let (code, _) = http(port, "GET", "/health", &auth(), "");
    assert_eq!(code, 503);
    drop(idle);
    srv.stop();
}
