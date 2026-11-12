//! Crash recovery: torn or garbage state files must not stop Engine::open, and an agent run
//! orphaned by a SIGKILLed server is killed on restart before the task reruns.
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use suffice::json;
use suffice::orchestrator::Engine;

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("suffice-recovery-{}-{}", name, std::process::id()));
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

#[test]
fn torn_events_tail_is_dropped() {
    let d = Dir::new("torn-events");
    fs::write(d.0.join("events.jsonl"), "{\"seq\":1\n{\"seq\":2,\"tas").unwrap();
    Engine::open(&d.0, 2).unwrap();
}

#[test]
fn torn_approvals_log_tail_is_dropped() {
    let d = Dir::new("torn-approvals");
    fs::write(d.0.join("approvals_log.jsonl"), "{\"ok\":true}\n{\"tru").unwrap();
    Engine::open(&d.0, 2).unwrap();
}

#[test]
fn garbage_state_files_are_set_aside() {
    for name in ["triggers.json", "sessions.json", "approvals.json", "runs.json"] {
        let d = Dir::new(&format!("garbage-{name}"));
        fs::write(d.0.join(name), "{{garbage").unwrap();
        Engine::open(&d.0, 2).unwrap_or_else(|e| panic!("{name}: {e}"));
        let stem = name.trim_end_matches(".json");
        assert!(d.0.join(format!("{stem}.corrupt")).exists(), "{name} not set aside");
    }
}

#[test]
fn leftover_tmp_files_are_ignored() {
    let d = Dir::new("tmp-leftover");
    for name in ["runs.json.tmp", "triggers.json.tmp", "sessions.json.tmp"] {
        fs::write(d.0.join(name), "{{garbage").unwrap();
    }
    Engine::open(&d.0, 2).unwrap();
}

/// Raw HTTP request; returns (status, body).
fn http(port: u16, method: &str, path: &str, token: &str, body: &str) -> (u16, String) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_millis(1500))).unwrap();
    write!(
        s,
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    let code = out.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    let body = out.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
    (code, body)
}

/// Start `suffice-backend serve --port 0` and return the child plus the bound port.
fn serve(dir: &Path) -> (Child, u16) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_suffice-backend"))
        .args(["serve", "--port", "0", "--dir"])
        .arg(dir)
        .env("SUFFICE_PROGRAM_CLAUDE", Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_claude_crash.sh"))
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap()).read_line(&mut line).unwrap();
    let port = line.split("127.0.0.1:").nth(1).and_then(|r| r.split_whitespace().next()).and_then(|p| p.parse().ok());
    (child, port.expect("port in banner"))
}

fn alive(pid: i64) -> bool {
    Command::new("kill").args(["-0", &pid.to_string()]).stderr(Stdio::null()).status().unwrap().success()
}

#[test]
fn orphan_run_is_killed_and_task_reruns_once() {
    let d = Dir::new("crash");
    let work = d.0.join("work");
    fs::create_dir_all(&work).unwrap();
    let (mut server, port) = serve(&d.0);
    let token = fs::read_to_string(d.0.join("token")).unwrap().trim().to_string();
    let body = format!("{{\"agent\":\"claude\",\"prompt\":\"hi\",\"cwd\":\"{}\"}}", work.display());
    let (code, resp) = http(port, "POST", "/tasks", &token, &body);
    assert_eq!(code, 201, "{resp}");
    let id = json::parse(&resp).unwrap().get("id").and_then(|v| v.as_str()).unwrap().to_string();

    // wait for the first run to be journaled
    let deadline = Instant::now() + Duration::from_secs(10);
    let pid = loop {
        let runs = fs::read_to_string(d.0.join("runs.json")).unwrap_or_default();
        if let Ok(v) = json::parse(&runs) {
            if let Some(p) = v.get(&id).and_then(|r| r.get("pid")).and_then(|p| p.as_i64()) {
                break p;
            }
        }
        assert!(Instant::now() < deadline, "first run never journaled");
        std::thread::sleep(Duration::from_millis(100));
    };

    server.kill().unwrap();
    server.wait().unwrap();
    assert!(alive(pid), "orphan should survive the server kill");

    let (mut server2, port2) = serve(&d.0);
    let deadline = Instant::now() + Duration::from_secs(5);
    while alive(pid) {
        if Instant::now() > deadline {
            let _ = Command::new("kill").args(["-9", &format!("-{pid}")]).status();
            panic!("orphan still alive 5 s after restart");
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let (_, state) = http(port2, "GET", &format!("/tasks/{id}"), &token, "");
        if state.contains("\"done\"") {
            break;
        }
        assert!(Instant::now() < deadline, "task never finished: {state}");
        std::thread::sleep(Duration::from_millis(200));
    }
    let _ = server2.kill();
    let _ = server2.wait();

    let markers = fs::read_to_string(work.join("markers")).unwrap();
    assert_eq!(markers, "start 1\nstart 2\nend 2\n");
    assert_eq!(fs::read_to_string(work.join("count")).unwrap().trim(), "2");
}
