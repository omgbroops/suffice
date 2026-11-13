//! Tests for paths that had no coverage: queue retarget replay, failed-start session release,
//! request-head limits, orphan SIGKILL escalation, and dependency resolution when the journal fails.
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use suffice::orchestrator::Engine;
use suffice::queue::Queue;
use suffice::types::{Access, AgentKind, Task, TaskState};

static N: AtomicUsize = AtomicUsize::new(0);

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p = std::env::temp_dir().join(format!("suffice-gap-{name}-{}-{nanos}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
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

fn task(id: &str, session_key: Option<&str>) -> Task {
    Task {
        id: id.into(),
        agent: AgentKind::Claude,
        prompt: "p".into(),
        cwd: std::env::temp_dir(),
        session_key: session_key.map(String::from),
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

// ---- 1. queue retarget + journal replay ----

#[test]
fn retarget_fields_survive_reload() {
    let d = Dir::new("retarget");
    {
        let mut q = Queue::open(&d.0).unwrap();
        q.submit(task("a", None)).unwrap();
        q.retarget("a", AgentKind::Codex, Some("sess-9".into()), TaskState::Ready, 3).unwrap();
    }
    let q = Queue::open(&d.0).unwrap();
    let t = q.get("a").unwrap();
    assert!(matches!(t.agent, AgentKind::Codex), "agent {:?}", t.agent);
    assert_eq!(t.session_key.as_deref(), Some("sess-9"));
    assert_eq!(t.state, TaskState::Ready);
    assert_eq!(t.attempts, 3);
}

// ---- 1b. queue dependency resolution when the journal append fails ----

extern "C" {
    fn setrlimit(resource: i32, rlp: *const [u64; 2]) -> i32;
    fn getrlimit(resource: i32, rlp: *mut [u64; 2]) -> i32;
    fn signal(sig: i32, handler: usize) -> usize;
}
// macOS and Linux agree on these values
const RLIMIT_FSIZE: i32 = 1;
const SIGXFSZ: i32 = 25;
const SIG_IGN: usize = 1;

/// Caps file size at `limit` bytes; restores the old limit and SIGXFSZ disposition on drop.
struct FsizeCap {
    old: [u64; 2],
    old_sig: usize,
}

impl FsizeCap {
    fn set(limit: u64) -> FsizeCap {
        let mut old = [0u64; 2];
        unsafe {
            assert_eq!(getrlimit(RLIMIT_FSIZE, &mut old), 0);
            let old_sig = signal(SIGXFSZ, SIG_IGN); // an over-limit write would otherwise kill the test process
            assert_eq!(setrlimit(RLIMIT_FSIZE, &[limit, old[1]]), 0);
            FsizeCap { old, old_sig }
        }
    }
}

impl Drop for FsizeCap {
    fn drop(&mut self) {
        unsafe {
            setrlimit(RLIMIT_FSIZE, &self.old);
            signal(SIGXFSZ, self.old_sig);
        }
    }
}

#[test]
fn ready_does_not_apply_state_when_journal_append_fails() {
    let d = Dir::new("ready-fail");
    let mut q = Queue::open(&d.0).unwrap();
    q.submit(task("a", None)).unwrap();
    let len = fs::metadata(d.0.join("tasks.jsonl")).unwrap().len();
    {
        let _cap = FsizeCap::set(len); // the next append exceeds the file-size limit
        assert!(q.ready().is_empty());
        assert_eq!(q.get("a").unwrap().state, TaskState::Pending, "state applied though not journaled");
    }
    assert_eq!(q.ready(), vec!["a".to_string()]);
    assert_eq!(q.get("a").unwrap().state, TaskState::Ready);
}

// ---- 2. failed start releases the session ----

struct Restore(PathBuf);

impl Drop for Restore {
    fn drop(&mut self) {
        let _ = fs::set_permissions(&self.0, fs::Permissions::from_mode(0o755));
    }
}

#[test]
fn failed_journal_start_releases_session_for_next_tick() {
    let d = Dir::new("release");
    let mut e = Engine::open(&d.0, 1).unwrap();
    e.set_program("claude", fixture());
    e.submit(task("a", Some("s1"))).unwrap();
    {
        // runs.json.tmp cannot be created, so journal_start fails before spawn
        let _r = Restore(d.0.clone());
        fs::set_permissions(&d.0, fs::Permissions::from_mode(0o555)).unwrap();
        e.tick();
    }
    assert_eq!(e.tasks().into_iter().find(|t| t.id == "a").unwrap().state, TaskState::Ready);
    e.run_until_idle(Duration::from_secs(20));
    let st = e.tasks().into_iter().find(|t| t.id == "a").unwrap().state;
    assert_eq!(st, TaskState::Done, "session was not released");
}

// ---- 3. request-head limits ----

struct Server {
    child: Child,
    port: u16,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn start(name: &str) -> Server {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("suffice-gap-srv-{name}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let fx = |n: &str| Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(n);
    let mut child = Command::new(env!("CARGO_BIN_EXE_suffice-backend"))
        .args(["serve", "--port", "0", "--dir"])
        .arg(&dir)
        .env("SUFFICE_IT_DIR", &dir)
        .env("SUFFICE_PROGRAM_CLAUDE", fx("it_claude_ok.sh"))
        .env("SUFFICE_PROGRAM_SUFFICE", fx("it_suffice.sh"))
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap()).read_line(&mut line).unwrap();
    let port = line.split("127.0.0.1:").nth(1).and_then(|r| r.split_whitespace().next()).and_then(|p| p.parse().ok()).expect("port in banner");
    Server { child, port }
}

fn status_of(resp: &str) -> u16 {
    resp.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0)
}

/// Writes `request`, then returns (response text, whether the server closed the socket).
fn send(port: u16, request: &[u8]) -> (String, bool) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let _ = s.write_all(request);
    let mut out = Vec::new();
    let closed = s.read_to_end(&mut out).is_ok();
    (String::from_utf8_lossy(&out).into_owned(), closed)
}

#[test]
fn single_header_line_over_16k_with_newline_is_431() {
    let s = start("bigline");
    let mut req = b"GET /health HTTP/1.1\r\nX-Big: ".to_vec();
    req.extend(std::iter::repeat_n(b'a', 20 * 1024));
    req.extend_from_slice(b"\r\n\r\n");
    let (resp, _) = send(s.port, &req);
    assert_eq!(status_of(&resp), 431, "got {resp:?}");
}

#[test]
fn more_than_100_header_lines_is_431() {
    let s = start("manyheads");
    let mut req = b"GET /health HTTP/1.1\r\n".to_vec();
    req.extend(std::iter::repeat_n(b"X-H: 1\r\n".as_slice(), 120).flatten());
    req.extend_from_slice(b"\r\n");
    let (resp, _) = send(s.port, &req);
    assert_eq!(status_of(&resp), 431, "got {resp:?}");
}

#[test]
fn stalled_partial_request_line_is_closed_by_server() {
    let s = start("stall");
    let mut c = TcpStream::connect(("127.0.0.1", s.port)).unwrap();
    c.set_read_timeout(Some(Duration::from_secs(20))).unwrap();
    c.write_all(b"GET /hea").unwrap();
    let t = Instant::now();
    let mut out = Vec::new();
    let res = c.read_to_end(&mut out);
    let elapsed = t.elapsed();
    assert!(res.is_ok(), "read failed: {res:?}");
    assert!(elapsed < Duration::from_secs(13), "server kept stalled client for {elapsed:?}");
}

// ---- 4. kill_orphans escalates to SIGKILL for a leader that ignores SIGTERM ----

#[test]
fn orphan_ignoring_sigterm_is_sigkilled_on_recovery() {
    let mut child = Command::new("perl")
        .args(["-e", r#"$SIG{TERM}="IGNORE"; sleep 300"#])
        .process_group(0)
        .spawn()
        .unwrap();
    let pid = child.id();
    let d = Dir::new("orphan");
    let text = format!(r#"{{"t1":{{"nonce":"abc","pid":{pid},"program":"perl","start":""}}}}"#);
    fs::write(d.0.join("runs.json"), text).unwrap();
    let _engine = Engine::open(&d.0, 1).unwrap();
    // the child is ours, so wait reaps it; a survivor would make the recv time out
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait());
    });
    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(st)) => assert_eq!(st.signal(), Some(9), "exit {st:?}"),
        _ => {
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
            panic!("pid {pid} survived Engine::open");
        }
    }
}
