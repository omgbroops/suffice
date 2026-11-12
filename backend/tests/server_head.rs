//! Request-head limits against the real `suffice-backend serve` binary.
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// A running server; killed (only this child) on drop.
struct Server {
    child: Child,
    port: u16,
    token: String,
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

/// Start the real server on a fresh tmp dir.
fn start(name: &str) -> Server {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("suffice-head-{name}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_suffice-backend"));
    cmd.args(["serve", "--port", "0", "--dir"])
        .arg(&dir)
        .env("SUFFICE_IT_DIR", &dir)
        .env("SUFFICE_PROGRAM_CLAUDE", fixture("it_claude_ok.sh"))
        .env("SUFFICE_PROGRAM_SUFFICE", fixture("it_suffice.sh"))
        .stdout(Stdio::piped());
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
    Server { child, port, token }
}

fn status_of(resp: &str) -> u16 {
    resp.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0)
}

/// Raw exchange; returns (everything written before close, whether the server closed the socket).
fn send(port: u16, request: &[u8]) -> (String, bool) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_millis(1500))).unwrap();
    let _ = s.write_all(request);
    let mut out = Vec::new();
    let closed = s.read_to_end(&mut out).is_ok();
    (String::from_utf8_lossy(&out).into_owned(), closed)
}

#[test]
fn oversized_header_line_without_newline_is_rejected_quickly() {
    let s = start("big-line");
    let mut req = b"GET /health HTTP/1.1\r\nX-Big: ".to_vec();
    req.extend(std::iter::repeat_n(b'a', 20 * 1024));
    let t = Instant::now();
    let (resp, closed) = send(s.port, &req);
    let elapsed = t.elapsed();
    assert!(elapsed < Duration::from_secs(2), "took {elapsed:?}");
    assert!(closed || status_of(&resp) == 431, "got {resp:?}");
}

#[test]
fn dribbling_client_is_disconnected_at_head_deadline() {
    let s = start("dribble");
    let mut c = TcpStream::connect(("127.0.0.1", s.port)).unwrap();
    c.set_read_timeout(Some(Duration::from_secs(15))).unwrap();
    let t = Instant::now();
    let mut dropped = false;
    while t.elapsed() < Duration::from_secs(15) {
        if c.write_all(b"a").is_err() {
            dropped = true;
            break;
        }
        sleep(Duration::from_millis(500));
    }
    let elapsed = t.elapsed();
    assert!(dropped, "server kept the connection open for {elapsed:?}");
    assert!(elapsed < Duration::from_secs(12), "disconnected after {elapsed:?}");
}

#[test]
fn authed_health_get_still_returns_200() {
    let s = start("health");
    let req = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {}\r\n\r\n",
        s.port, s.token
    );
    let (resp, _) = send(s.port, req.as_bytes());
    assert_eq!(status_of(&resp), 200, "got {resp:?}");
}
