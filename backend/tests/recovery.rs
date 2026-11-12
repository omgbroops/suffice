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

fn orphan_script() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sleep_orphan.sh")
}

/// Same `ps` call the engine uses for the start-time record.
fn lstart(pid: u32) -> String {
    let out = Command::new("ps").env("LC_ALL", "C").env("TZ", "UTC").args(["-o", "lstart=", "-p", &pid.to_string()]).output().unwrap();
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// Spawn a fake agent in its own process group, as the pool does.
fn spawn_orphan(nonce: &str) -> Child {
    use std::os::unix::process::CommandExt;
    Command::new(orphan_script()).env("SUFFICE_RUN_NONCE", nonce).process_group(0).spawn().unwrap()
}

/// Wait up to `secs` for the child to exit; true if it did.
fn exits_within(child: &mut Child, secs: u64) -> bool {
    let end = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < end {
        if child.try_wait().unwrap().is_some() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

#[test]
fn spawn_then_crash_before_pid_is_found_by_nonce() {
    let d = Dir::new("nonce");
    let mut orphan = spawn_orphan("feedface00");
    // wait for python to exec: until then ps shows /usr/bin/env, whose environment macOS hides
    let end = Instant::now() + Duration::from_secs(10);
    while Instant::now() < end {
        let ps = Command::new("ps").args(["-E", "-o", "command=", "-p", &orphan.id().to_string()]).output().unwrap();
        if String::from_utf8_lossy(&ps.stdout).contains("SUFFICE_RUN_NONCE=feedface00") {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let runs = format!(
        "{{\"t1\":{{\"nonce\":\"feedface00\",\"pid\":null,\"program\":\"{}\",\"start\":\"\"}}}}\n",
        orphan_script().display()
    );
    fs::write(d.0.join("runs.json"), runs).unwrap();
    Engine::open(&d.0, 2).unwrap();
    assert!(exits_within(&mut orphan, 4), "nonce-tagged orphan was not killed");
}

#[test]
fn pid_alive_but_not_ours_is_never_killed() {
    let d = Dir::new("not-ours");
    let mut other = Command::new("/bin/sleep").arg("30").spawn().unwrap();
    let runs = format!(
        "{{\"t1\":{{\"nonce\":\"\",\"pid\":{},\"program\":\"/nonexistent/fake_claude\",\"start\":\"{}\"}}}}\n",
        other.id(),
        lstart(other.id())
    );
    fs::write(d.0.join("runs.json"), runs).unwrap();
    Engine::open(&d.0, 2).unwrap();
    let alive = other.try_wait().unwrap().is_none();
    let _ = other.kill();
    let _ = other.wait();
    assert!(alive, "an unrelated pid was killed");
}

#[test]
fn three_orphans_close_in_under_four_seconds() {
    let d = Dir::new("three");
    let mut kids: Vec<Child> = (0..3).map(|i| spawn_orphan(&format!("n{i}"))).collect();
    let entries: Vec<String> = kids
        .iter()
        .enumerate()
        .map(|(i, c)| {
            format!(
                "\"t{i}\":{{\"nonce\":\"n{i}\",\"pid\":{},\"program\":\"{}\",\"start\":\"{}\"}}",
                c.id(),
                orphan_script().display(),
                lstart(c.id())
            )
        })
        .collect();
    fs::write(d.0.join("runs.json"), format!("{{{}}}\n", entries.join(","))).unwrap();
    let t0 = Instant::now();
    Engine::open(&d.0, 2).unwrap();
    assert!(t0.elapsed() < Duration::from_secs(4), "open took {:?}", t0.elapsed());
    for k in kids.iter_mut() {
        assert!(exits_within(k, 1), "orphan {} still alive", k.id());
    }
}

#[test]
fn unreadable_event_line_is_skipped_not_truncated() {
    let d = Dir::new("unknown-kind");
    let log = d.0.join("events.jsonl");
    let lines = [
        r#"{"seq":1,"task":"a","ms":1,"type":"text","text":"one"}"#,
        r#"{"seq":2,"task":"a","ms":2,"type":"from_a_newer_build","x":1}"#,
        r#"{"seq":3,"task":"a","ms":3,"type":"text","text":"three"}"#,
    ];
    fs::write(&log, lines.iter().map(|l| format!("{l}\n")).collect::<String>()).unwrap();
    let e = Engine::open(&d.0, 2).unwrap();
    let seqs: Vec<u64> = e.events_since(0).iter().map(|l| l.seq).collect();
    assert_eq!(seqs, vec![1, 3], "later events must survive an unreadable line");
    drop(e);
    let text = fs::read_to_string(&log).unwrap();
    assert!(text.contains("from_a_newer_build") && text.contains("three"), "{text}");
}
