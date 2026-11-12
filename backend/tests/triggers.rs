use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use suffice::json::Value;
use suffice::orchestrator::Engine;
use suffice::server::serve;
use suffice::triggers::When;
use suffice::types::{AgentKind, Access, Task, TaskState};

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("suffice-trig-test-{}-{}", name, std::process::id()));
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

fn engine(dir: &Path) -> Engine {
    let mut e = Engine::open(dir, 2).unwrap();
    e.set_program("claude", fixture());
    e
}

fn template(prompt: &str) -> Value {
    Value::Obj(vec![
        ("agent".into(), Value::str("claude")),
        ("prompt".into(), Value::str(prompt)),
        ("cwd".into(), Value::str(&std::env::temp_dir().to_string_lossy())),
    ])
}

fn task(id: &str, prompt: &str) -> Task {
    Task {
        id: id.into(),
        agent: AgentKind::Claude,
        prompt: prompt.into(),
        cwd: std::env::temp_dir(),
        session_key: None,
        deps: vec![],
        max_retries: 0,
        attempts: 0,
        timeout_secs: 20,
        model: None,
        access: Access::Edit,
        env: BTreeMap::new(),
        state: TaskState::Pending,
        created_ms: 1,
    }
}

fn state(e: &Engine, id: &str) -> Option<TaskState> {
    e.tasks().into_iter().find(|t| t.id == id).map(|t| t.state)
}

#[test]
fn every_fires_once_per_interval() {
    let dir = Dir::new("every");
    let mut e = engine(&dir.0);
    let clock = Arc::new(AtomicU64::new(0));
    let c = clock.clone();
    e.set_clock(move || c.load(Ordering::SeqCst));
    e.add_trigger("ev", When::Every { secs: 1 }, template("hi")).unwrap();

    clock.store(999, Ordering::SeqCst);
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(e.triggers()[0].fires, 0);

    clock.store(1000, Ordering::SeqCst);
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(e.triggers()[0].fires, 1);
    assert!(matches!(state(&e, "ev-1"), Some(TaskState::Done)));

    clock.store(1500, Ordering::SeqCst);
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(e.triggers()[0].fires, 1);
}

#[test]
fn fire_is_skipped_while_previous_task_is_open() {
    let dir = Dir::new("skip");
    let mut e = engine(&dir.0);
    e.add_trigger("m", When::Manual, template("hi")).unwrap();
    assert_eq!(e.fire_now("m").unwrap(), "fired");
    // no tick yet, so "m-1" is still pending
    assert_eq!(e.fire_now("m").unwrap(), "skipped");
    assert_eq!(e.triggers()[0].fires, 1);
    assert!(e.fire_now("nope").is_err());
}

#[test]
fn missed_slots_fire_once_after_reopen() {
    let dir = Dir::new("missed");
    {
        let mut e = engine(&dir.0);
        e.set_clock(|| 0);
        e.add_trigger("slow", When::Every { secs: 10 }, template("hi")).unwrap();
    }
    let mut e = engine(&dir.0);
    let clock = Arc::new(AtomicU64::new(100_000));
    let c = clock.clone();
    e.set_clock(move || c.load(Ordering::SeqCst));
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(e.triggers()[0].fires, 1);
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(e.triggers()[0].fires, 1);
}

#[test]
fn on_done_chains_once_per_finished_task() {
    let dir = Dir::new("chain");
    let mut e = engine(&dir.0);
    e.submit(task("build", "compile")).unwrap();
    e.add_trigger("chain", When::OnDone { task_prefix: "build".into() }, template("next")).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "build"), Some(TaskState::Done)));
    assert!(matches!(state(&e, "chain-1"), Some(TaskState::Done)));
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(e.triggers()[0].fires, 1);
    assert!(state(&e, "chain-2").is_none());
}

#[test]
fn trigger_task_goes_through_gate() {
    let dir = Dir::new("gate");
    let mut e = engine(&dir.0);
    e.add_trigger("pub", When::Manual, template("publish the report")).unwrap();
    e.fire_now("pub").unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "pub-1"), Some(TaskState::NeedsApproval { .. })));
}

#[test]
fn triggers_survive_reopen() {
    let dir = Dir::new("persist");
    {
        let mut e = engine(&dir.0);
        e.add_trigger("keep", When::Daily { hour: 9, minute: 30 }, template("hi")).unwrap();
        assert!(e.add_trigger("keep", When::Manual, template("hi")).is_err());
        assert!(e.add_trigger("bad", When::Manual, Value::Str("x".into())).is_err());
    }
    let e = engine(&dir.0);
    assert_eq!(e.triggers().len(), 1);
    assert!(matches!(e.triggers()[0].when, When::Daily { hour: 9, minute: 30 }));
}

fn http(port: u16, method: &str, path: &str, body: &str) -> (u16, String) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_millis(1500))).unwrap();
    write!(
        s,
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer test-token\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    let code = out.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    (code, out)
}

#[test]
fn api_create_fire_delete() {
    let dir = Dir::new("api");
    let s = serve(engine(&dir.0), "127.0.0.1:0", "test-token").unwrap();
    let p = s.port();
    let ok = r#"{"id":"api","when":{"kind":"manual"},"template":{"agent":"claude","prompt":"hi","cwd":"/tmp"}}"#;
    assert_eq!(http(p, "POST", "/triggers", ok).0, 201);
    assert_eq!(http(p, "POST", "/triggers", ok).0, 400);
    assert_eq!(http(p, "POST", "/triggers", r#"{"id":"b","when":{"kind":"every","secs":0},"template":{"agent":"claude","prompt":"x","cwd":"/tmp"}}"#).0, 400);
    assert_eq!(http(p, "POST", "/triggers", r#"{"id":"b","when":{"kind":"manual"},"template":"x"}"#).0, 400);
    let (code, body) = http(p, "GET", "/triggers", "");
    assert_eq!(code, 200);
    assert!(body.contains("\"api\""), "{body}");
    assert_eq!(http(p, "POST", "/triggers/api/fire", "").0, 200);
    assert_eq!(http(p, "POST", "/triggers/api/disable", "").0, 200);
    assert_eq!(http(p, "POST", "/triggers/nope/fire", "").0, 404);
    assert_eq!(http(p, "DELETE", "/triggers/api", "").0, 200);
    assert_eq!(http(p, "DELETE", "/triggers/api", "").0, 404);
    s.stop();
}
