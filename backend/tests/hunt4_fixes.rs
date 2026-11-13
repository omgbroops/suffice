use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use suffice::orchestrator::Engine;

fn tmp(name: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let d = std::env::temp_dir().join(format!("suffice-h4-{name}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&d).unwrap();
    d
}

fn alive(pid: u32) -> bool {
    Command::new("kill").args(["-0", &pid.to_string()]).stderr(Stdio::null()).status().unwrap().success()
}

fn kill9(pid: u32) {
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).stderr(Stdio::null()).status();
}

/// `sh` leads its own process group and backgrounds a sleep; returns (leader, sleep pid).
fn group_with_sleep() -> (Child, u32) {
    let mut child = Command::new("sh")
        .args(["-c", "sleep 300 & echo $!; wait"])
        .stdout(Stdio::piped())
        .process_group(0)
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.as_mut().unwrap()).read_line(&mut line).unwrap();
    (child, line.trim().parse().unwrap())
}

/// Journal one run the way the engine writes runs.json (nonce, pid, program, start).
fn journal(dir: &Path, task: &str, pid: u32, start: &str) {
    let text = format!(r#"{{"{task}":{{"nonce":"abc","pid":{pid},"program":"sh","start":"{start}"}}}}"#);
    fs::write(dir.join("runs.json"), text).unwrap();
}

#[test]
fn leader_gone_group_children_are_killed_on_recovery() {
    let (mut leader, sleeper) = group_with_sleep();
    let dir = tmp("gone");
    journal(&dir, "t1", leader.id(), "");
    leader.kill().unwrap();
    leader.wait().unwrap();
    let _engine = Engine::open(&dir, 1).unwrap();
    let t0 = Instant::now();
    while alive(sleeper) && t0.elapsed() < Duration::from_secs(2) {
        std::thread::sleep(Duration::from_millis(50));
    }
    let gone = !alive(sleeper);
    kill9(sleeper);
    assert!(gone, "background sleep {sleeper} of a dead leader survived recovery");
}

#[test]
fn journal_without_start_time_still_kills_the_group() {
    let (mut leader, sleeper) = group_with_sleep();
    let dir = tmp("nostart");
    journal(&dir, "t1", leader.id(), "");
    let _engine = Engine::open(&dir, 1).unwrap();
    let t0 = Instant::now();
    while alive(sleeper) && t0.elapsed() < Duration::from_secs(2) {
        std::thread::sleep(Duration::from_millis(50));
    }
    let gone = !alive(sleeper);
    kill9(sleeper);
    let _ = leader.wait();
    assert!(gone, "run with empty start time was not killed: sleep {sleeper} alive");
}

#[test]
fn unprovable_run_stays_journaled() {
    let mut other = Command::new("sleep").arg("300").spawn().unwrap();
    let dir = tmp("keep");
    // program "sh" does not match the live `sleep`, so the run cannot be proven ours
    journal(&dir, "t1", other.id(), "");
    let _engine = Engine::open(&dir, 1).unwrap();
    let kept = fs::read_to_string(dir.join("runs.json")).unwrap().contains("\"t1\"");
    other.kill().unwrap();
    other.wait().unwrap();
    assert!(kept, "unprovable run was dropped from runs.json");
}

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

fn start_with_body_deadline(ms: &str) -> Server {
    let dir = tmp("srv");
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let mut child = Command::new(env!("CARGO_BIN_EXE_suffice-backend"))
        .args(["serve", "--port", "0", "--dir"])
        .arg(&dir)
        .env("SUFFICE_IT_DIR", &dir)
        .env("SUFFICE_PROGRAM_CLAUDE", fixture.join("it_claude_ok.sh"))
        .env("SUFFICE_PROGRAM_SUFFICE", fixture.join("it_suffice.sh"))
        .env("SUFFICE_BODY_DEADLINE_MS", ms)
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap()).read_line(&mut line).unwrap();
    let port = line.split("127.0.0.1:").nth(1).and_then(|r| r.split_whitespace().next()).and_then(|p| p.parse().ok()).expect("port in banner");
    let token = fs::read_to_string(dir.join("token")).unwrap().trim().to_string();
    Server { child, port, token }
}

#[test]
fn stalled_request_body_is_cut_off_by_total_deadline() {
    let s = start_with_body_deadline("1000");
    let mut c = TcpStream::connect(("127.0.0.1", s.port)).unwrap();
    c.set_read_timeout(Some(Duration::from_millis(300))).unwrap();
    write!(
        c,
        "POST /tasks HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {}\r\nContent-Length: 100\r\n\r\n{}",
        s.token,
        "x".repeat(10)
    )
    .unwrap();
    let start = Instant::now();
    let mut buf = [0u8; 256];
    let mut closed = false;
    // one byte per round keeps each server read under its own timeout; only a total deadline can end it
    while start.elapsed() < Duration::from_secs(5) {
        let _ = c.write(b"x");
        match c.read(&mut buf) {
            Ok(_) => {
                closed = true;
                break;
            }
            Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => {
                closed = true;
                break;
            }
        }
    }
    assert!(closed, "trickled body was still being read after 5 s");
    assert!(start.elapsed() < Duration::from_secs(4), "deadline took {:?}", start.elapsed());
}
