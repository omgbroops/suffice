//! Engine tests for "message a task": a message becomes a follow-up task on the same session.
use suffice::orchestrator::{Engine, MsgErr};
use suffice::server::serve;
use suffice::types::{Access, AgentKind, Event, Task, TaskState};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("suffice-msg-test-{}-{}", name, std::process::id()));
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

fn engine(dir: &Path) -> Engine {
    let mut e = Engine::open(dir, 2).unwrap();
    e.set_program("claude", Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_claude.sh"));
    e
}

fn task(id: &str, prompt: &str) -> Task {
    Task {
        id: id.into(),
        agent: AgentKind::Claude,
        prompt: prompt.into(),
        cwd: std::env::temp_dir(),
        session_key: Some("sess".into()),
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

fn sleeping(id: &str) -> Task {
    let mut t = task(id, "p");
    t.env.insert("MODE".into(), "sleep".into());
    t.env.insert("SLEEP_SECS".into(), "3".into());
    t
}

fn get(e: &Engine, id: &str) -> Task {
    e.tasks().into_iter().find(|t| t.id == id).unwrap()
}

fn state(e: &Engine, id: &str) -> TaskState {
    get(e, id).state
}

fn wait_for(e: &mut Engine, secs: u64, mut done: impl FnMut(&Engine) -> bool) -> bool {
    let end = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < end {
        if done(e) {
            return true;
        }
        e.pump(Duration::from_millis(100));
    }
    done(e)
}

#[test]
fn rejects_unknown_empty_long_and_sessionless() {
    let d = Dir::new("reject");
    let mut e = engine(&d.0);
    e.submit(task("a", "p")).unwrap();
    let mut no_session = task("b", "p");
    no_session.session_key = None;
    e.submit(no_session).unwrap();
    assert_eq!(e.message("zz", "hi"), Err(MsgErr::NoTask));
    assert_eq!(e.message("a", ""), Err(MsgErr::Empty));
    assert_eq!(e.message("a", " \n\t"), Err(MsgErr::Empty));
    assert_eq!(e.message("a", &"x".repeat(32769)), Err(MsgErr::TooLong));
    assert_eq!(e.message("b", "hi"), Err(MsgErr::NoSession));
    assert_eq!(e.message("a", &"x".repeat(32768)), Ok("a.m1".to_string()));
    assert!(e.tasks().iter().all(|t| !t.id.starts_with("b.")));
}

#[test]
fn message_to_running_task_waits_for_it() {
    let d = Dir::new("running");
    let mut e = engine(&d.0);
    e.submit(sleeping("a")).unwrap();
    e.tick();
    assert!(wait_for(&mut e, 10, |e| matches!(state(e, "a"), TaskState::Running { .. })));
    assert_eq!(e.message("a", "more"), Ok("a.m1".to_string()));
    assert_eq!(get(&e, "a.m1").deps, vec!["a".to_string()]);
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(state(&e, "a"), TaskState::Done);
    assert_eq!(state(&e, "a.m1"), TaskState::Done);
}

#[test]
fn message_to_done_task_has_no_dep_and_copies_config() {
    let d = Dir::new("done");
    let mut e = engine(&d.0);
    e.submit(task("a", "p")).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(state(&e, "a"), TaskState::Done);
    assert_eq!(e.message("a", "more"), Ok("a.m1".to_string()));
    let f = get(&e, "a.m1");
    assert!(f.deps.is_empty());
    assert_eq!(f.prompt, "more");
    assert_eq!(f.session_key, Some("sess".to_string()));
    assert_eq!(f.agent, AgentKind::Claude);
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(state(&e, "a.m1"), TaskState::Done);
}

#[test]
fn failed_original_does_not_block_follow_up() {
    let d = Dir::new("failed");
    let mut e = engine(&d.0);
    let mut t = task("a", "p");
    t.env.insert("MODE".into(), "fail".into());
    e.submit(t).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "a"), TaskState::Failed { .. }));
    assert_eq!(e.message("a", "retry it"), Ok("a.m1".to_string()));
    assert!(get(&e, "a.m1").deps.is_empty());
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(state(&e, "a.m1"), TaskState::Done);
}

#[test]
fn cancelled_original_does_not_block_follow_up() {
    let d = Dir::new("cancelled");
    let mut e = engine(&d.0);
    e.submit(sleeping("a")).unwrap();
    e.tick();
    assert!(wait_for(&mut e, 10, |e| matches!(state(e, "a"), TaskState::Running { .. })));
    e.cancel("a").unwrap();
    assert_eq!(state(&e, "a"), TaskState::Cancelled);
    assert_eq!(e.message("a", "again"), Ok("a.m1".to_string()));
    assert!(get(&e, "a.m1").deps.is_empty());
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(state(&e, "a.m1"), TaskState::Done);
}

#[test]
fn gate_holds_outward_follow_up() {
    let d = Dir::new("gate");
    let mut e = engine(&d.0);
    e.submit(task("a", "p")).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(e.message("a", "publish the package"), Ok("a.m1".to_string()));
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "a.m1"), TaskState::NeedsApproval { .. }), "{:?}", state(&e, "a.m1"));
}

#[test]
fn user_event_is_logged_and_persisted() {
    let d = Dir::new("event");
    let mut e = engine(&d.0);
    e.submit(task("a", "p")).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    e.message("a", "hello there").unwrap();
    assert!(e.events_since(0).iter().any(|l| l.task == "a" && l.event == Event::User { text: "hello there".into() }));
    let log = fs::read_to_string(d.0.join("events.jsonl")).unwrap();
    assert!(log.lines().any(|l| l.contains("\"type\":\"user\"") && l.contains("\"text\":\"hello there\"")), "{log}");
}

#[test]
fn follow_up_ids_count_up() {
    let d = Dir::new("ids");
    let mut e = engine(&d.0);
    e.submit(task("a", "p")).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(e.message("a", "one"), Ok("a.m1".to_string()));
    assert_eq!(e.message("a", "two"), Ok("a.m2".to_string()));
    assert_eq!(e.message("a", "three"), Ok("a.m3".to_string()));
    assert_eq!(e.message("a.m1", "chained"), Ok("a.m1.m1".to_string()));
}

fn get_raw(port: u16, path: &str) -> (u16, String) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_millis(1500))).unwrap();
    write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer tok\r\n\r\n").unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    let code = out.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    (code, out)
}

#[test]
fn thread_view_orders_turns_and_filters_events() {
    let d = Dir::new("thread");
    let mut e = engine(&d.0);
    e.submit(task("a", "p")).unwrap();
    assert_eq!(e.message("a", "one"), Ok("a.m1".to_string()));
    assert_eq!(e.message("a", "hello there"), Ok("a.m2".to_string()));
    let s = serve(e, "127.0.0.1:0", "tok").unwrap();
    let port = s.port();

    let (code, body) = get_raw(port, "/tasks/a/thread");
    assert_eq!(code, 200, "{body}");
    let root = body.find("\"id\":\"a\"").unwrap();
    let (m1, m2) = (body.find("\"id\":\"a.m1\"").unwrap(), body.find("\"id\":\"a.m2\"").unwrap());
    assert!(root < m1 && m1 < m2, "{body}");
    assert!(body.contains("\"hello there\""), "{body}");
    assert!(body.contains("\"kind\":\"user\""), "{body}");

    let (_, body) = get_raw(port, "/tasks/a/thread?since=1000000");
    assert!(body.contains("\"events\":[]"), "{body}");

    let (code, body) = get_raw(port, "/tasks/a.m1/thread");
    assert_eq!(code, 200, "{body}");
    assert!(body.contains("\"id\":\"a.m2\""), "{body}");

    let (code, _) = get_raw(port, "/tasks/zz/thread");
    assert_eq!(code, 404);
    s.stop();
}
