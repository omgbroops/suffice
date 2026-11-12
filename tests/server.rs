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
        "{method} {path} HTTP/1.1\r\nHost: x\r\n{headers}Content-Length: {}\r\n\r\n{body}",
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
