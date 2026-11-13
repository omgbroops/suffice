use suffice::orchestrator::Engine;
use suffice::server::{serve, Server};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const TOKEN: &str = "test-token";

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("suffice-routes-test-{}-{}", name, std::process::id()));
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

fn ids_of(resp: &str) -> Vec<u64> {
    resp.lines().filter_map(|l| l.strip_prefix("id: ")).filter_map(|n| n.parse().ok()).collect()
}

fn task_body(id: &str, prompt: &str) -> String {
    format!(r#"{{"id":"{id}","agent":"claude","prompt":"{prompt}","cwd":"/tmp"}}"#)
}

/// A task with no session: a generic agent is held for approval before it ever runs.
fn held_body(id: &str) -> String {
    format!(r#"{{"id":"{id}","agent":{{"generic":{{"program":"/bin/echo","args":["hi"]}}}},"prompt":"x","cwd":"/tmp"}}"#)
}

fn wait_state(port: u16, id: &str, state: &str) -> bool {
    wait_for(20, || {
        let (_, r) = http(port, "GET", &format!("/tasks/{id}"), &auth(), "");
        body_of(&r).contains(&format!("\"state\":\"{state}\""))
    })
}

#[test]
fn message_errors_map_to_404_400_409() {
    let (_d, s) = start("msg_err");
    let port = s.port();
    assert_eq!(http(port, "POST", "/tasks", &auth(), &held_body("g1")).0, 201);

    let (code, r) = http(port, "POST", "/tasks/nope/messages", &auth(), r#"{"text":"hi"}"#);
    assert_eq!(code, 404, "{r}");
    assert!(body_of(&r).contains("no task 'nope'"), "{r}");

    let (code, r) = http(port, "POST", "/tasks/g1/messages", &auth(), r#"{"text":""}"#);
    assert_eq!(code, 400, "{r}");
    assert!(body_of(&r).contains("text is empty"), "{r}");

    let long = format!(r#"{{"text":"{}"}}"#, "a".repeat(32769));
    let (code, r) = http(port, "POST", "/tasks/g1/messages", &auth(), &long);
    assert_eq!(code, 400, "{r}");
    assert!(body_of(&r).contains("over 32768 bytes"), "{r}");

    let (code, r) = http(port, "POST", "/tasks/g1/messages", &auth(), r#"{"text":"hi"}"#);
    assert_eq!(code, 409, "{r}");
    assert!(body_of(&r).contains("has no session"), "{r}");

    let (code, r) = http(port, "POST", "/tasks/g1/messages", &auth(), "{not json");
    assert_eq!(code, 400, "{r}");
    assert!(body_of(&r).contains("bad JSON"), "{r}");
    s.stop();
}

#[test]
fn message_on_sessioned_task_is_202() {
    let (_d, s) = start("msg_ok");
    let port = s.port();
    let body = r#"{"id":"t1","agent":"claude","prompt":"hello","cwd":"/tmp","session_key":"k1"}"#;
    assert_eq!(http(port, "POST", "/tasks", &auth(), body).0, 201);
    assert!(wait_state(port, "t1", "done"), "t1 never finished");
    let (code, r) = http(port, "POST", "/tasks/t1/messages", &auth(), r#"{"text":"more"}"#);
    assert_eq!(code, 202, "{r}");
    assert!(body_of(&r).contains("\"task\":\"t1.m"), "{r}");
    s.stop();
}

#[test]
fn retry_and_cancel_unknown_and_wrong_state() {
    let (_d, s) = start("retry_err");
    let port = s.port();
    let (code, r) = http(port, "POST", "/tasks/nope/retry", &auth(), "");
    assert_eq!(code, 404, "{r}");
    let (code, r) = http(port, "POST", "/tasks/nope/cancel", &auth(), "");
    assert_eq!(code, 404, "{r}");

    assert_eq!(http(port, "POST", "/tasks", &auth(), &task_body("t1", "hello")).0, 201);
    assert!(wait_state(port, "t1", "done"), "t1 never finished");
    let (code, r) = http(port, "POST", "/tasks/t1/retry", &auth(), "");
    assert_eq!(code, 400, "{r}");
    assert!(body_of(&r).contains("is not failed or cancelled"), "{r}");
    s.stop();
}

#[test]
fn retry_failed_task_requeues_it() {
    let (_d, s) = start("retry_ok");
    let port = s.port();
    let body = r#"{"id":"f1","agent":{"generic":{"program":"/bin/false","args":[]}},"prompt":"x","cwd":"/tmp"}"#;
    assert_eq!(http(port, "POST", "/tasks", &auth(), body).0, 201);
    assert_eq!(http(port, "POST", "/approvals/af1/approve", &auth(), "").0, 200);
    assert!(wait_state(port, "f1", "failed"), "f1 never failed");
    let (code, r) = http(port, "POST", "/tasks/f1/retry", &auth(), "");
    assert_eq!(code, 200, "{r}");
    let b = body_of(&r);
    assert!(b.contains("\"state\":\"ready\"") || b.contains("\"state\":\"queued\""), "{r}");
    s.stop();
}

#[test]
fn graph_has_nodes_and_dependency_edge() {
    let (_d, s) = start("graph");
    let port = s.port();
    assert_eq!(http(port, "POST", "/tasks", &auth(), &held_body("a")).0, 201);
    let b = r#"{"id":"b","agent":"claude","prompt":"x","cwd":"/tmp","deps":["a"]}"#;
    assert_eq!(http(port, "POST", "/tasks", &auth(), b).0, 201);
    let (code, r) = http(port, "GET", "/graph", &auth(), "");
    assert_eq!(code, 200, "{r}");
    let g = body_of(&r);
    assert!(g.contains("\"id\":\"a\"") && g.contains("\"id\":\"b\""), "{r}");
    assert!(g.contains(r#""edges":[{"from":"a","to":"b"}]"#), "{r}");
    s.stop();
}

#[test]
fn stream_task_filter_and_event_names() {
    let (_d, s) = start("sse_task");
    let port = s.port();
    assert_eq!(http(port, "POST", "/tasks", &auth(), &task_body("t1", "hi")).0, 201);
    assert_eq!(http(port, "POST", "/tasks", &auth(), &task_body("t2", "hi")).0, 201);
    assert!(wait_state(port, "t1", "done") && wait_state(port, "t2", "done"), "tasks never finished");
    let (code, r) = http(port, "GET", "/stream?task=t1&token=test-token", "", "");
    assert_eq!(code, 200, "{r}");
    let b = body_of(&r);
    assert!(b.contains("event: state") && b.contains("event: session") && b.contains("event: result"), "{r}");
    assert!(b.contains("\"task\":\"t1\""), "{r}");
    assert!(!b.contains("\"task\":\"t2\""), "t2 leaked into t1 stream: {r}");
    s.stop();
}

#[test]
fn stream_last_event_id_and_since_skip_earlier_events() {
    let (_d, s) = start("sse_replay");
    let port = s.port();
    assert_eq!(http(port, "POST", "/tasks", &auth(), &task_body("t1", "hi")).0, 201);
    assert!(wait_state(port, "t1", "done"), "t1 never finished");
    let (_, all) = http(port, "GET", "/stream?since=0&token=test-token", "", "");
    let ids = ids_of(&all);
    assert!(ids.len() >= 4, "need several events, got {ids:?}");
    let mid = ids[ids.len() / 2];

    let (code, r) = http(port, "GET", "/stream?token=test-token", &format!("Last-Event-ID: {mid}\r\n"), "");
    assert_eq!(code, 200, "{r}");
    let got = ids_of(&r);
    assert!(!got.is_empty() && got.iter().all(|&i| i > mid), "{got:?} not after {mid}");

    let (_, r) = http(port, "GET", &format!("/stream?since={mid}&token=test-token"), "", "");
    assert_eq!(ids_of(&r), got);

    let (code, r) = http(port, "GET", "/stream?since=xyz&token=test-token", "", "");
    assert_eq!(code, 400, "{r}");
    assert!(body_of(&r).contains("bad since"), "{r}");
    s.stop();
}

#[test]
fn other_400_404_branches() {
    let (_d, s) = start("misc");
    let port = s.port();
    let t = &auth();
    assert_eq!(http(port, "GET", "/events?since=abc", t, "").0, 400);
    assert_eq!(http(port, "GET", "/tasks/nope/thread", t, "").0, 404);
    assert_eq!(http(port, "GET", "/tasks/nope/thread?since=x", t, "").0, 400);
    assert_eq!(http(port, "GET", "/agents/nope", t, "").0, 404);
    assert_eq!(http(port, "POST", "/approvals/x1/approve", t, "").0, 404);
    assert_eq!(http(port, "PUT", "/budgets", t, "garbage").0, 400);
    assert_eq!(http(port, "POST", "/triggers/nope/fire", t, "").0, 404);
    assert_eq!(http(port, "DELETE", "/triggers/nope", t, "").0, 404);
    s.stop();
}
