use loom::queue::Queue;
use loom::types::{AgentKind, Task, TaskState};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

struct Dir(PathBuf);
impl Dir {
    fn new() -> Dir {
        let p = std::env::temp_dir().join(format!("loom-test-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        Dir(p)
    }
}
impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn task(id: &str, deps: &[&str], max_retries: u32) -> Task {
    Task {
        id: id.into(),
        agent: AgentKind::Claude,
        prompt: "p".into(),
        cwd: PathBuf::from("/work"),
        session_key: None,
        deps: deps.iter().map(|d| d.to_string()).collect(),
        max_retries,
        attempts: 0,
        timeout_secs: 60,
        model: None,
        env: BTreeMap::new(),
        state: TaskState::Pending,
        created_ms: 1,
    }
}

#[test]
fn submit_replay_roundtrip() {
    let d = Dir::new();
    let mut t = task("a", &[], 2);
    t.agent = AgentKind::Generic { program: "echo".into(), args: vec!["x y".into(), "é\"".into()] };
    t.session_key = Some("s1".into());
    t.model = Some("m".into());
    t.env.insert("K".into(), "v\n".into());
    t.env.insert("Z".into(), "".into());
    t.cwd = PathBuf::from("/a/b");
    t.timeout_secs = 9;
    t.created_ms = 1_700_000_000_123;
    {
        let mut q = Queue::open(&d.0).unwrap();
        q.submit(t.clone()).unwrap();
    }
    let q = Queue::open(&d.0).unwrap();
    assert_eq!(q.get("a"), Some(&t));
    assert_eq!(q.all().len(), 1);
}

#[test]
fn torn_last_line_ignored() {
    let d = Dir::new();
    {
        let mut q = Queue::open(&d.0).unwrap();
        q.submit(task("a", &[], 0)).unwrap();
    }
    std::fs::OpenOptions::new()
        .append(true)
        .open(d.0.join("tasks.jsonl"))
        .unwrap()
        .write_all(b"{\"op\":\"sub")
        .unwrap();
    let mut q = Queue::open(&d.0).unwrap();
    assert_eq!(q.all().len(), 1);
    q.submit(task("b", &[], 0)).unwrap();
    drop(q);
    assert_eq!(Queue::open(&d.0).unwrap().all().len(), 2);
}

#[test]
fn corrupt_middle_line_is_error() {
    let d = Dir::new();
    {
        let mut q = Queue::open(&d.0).unwrap();
        q.submit(task("a", &[], 0)).unwrap();
        q.submit(task("b", &[], 0)).unwrap();
    }
    let path = d.0.join("tasks.jsonl");
    let text = std::fs::read_to_string(&path).unwrap();
    let mut lines = text.lines();
    let (first, second) = (lines.next().unwrap(), lines.next().unwrap());
    std::fs::write(&path, format!("{first}\ngarbage\n{second}\n")).unwrap();
    let err = Queue::open(&d.0).err().expect("corrupt line must fail");
    assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
    assert!(err.to_string().contains("line 2"), "{err}");
}

#[test]
fn running_becomes_ready_on_reopen() {
    let d = Dir::new();
    {
        let mut q = Queue::open(&d.0).unwrap();
        q.submit(task("a", &[], 0)).unwrap();
        assert_eq!(q.ready(), vec!["a".to_string()]);
        q.set_state("a", TaskState::Running { pid: 42 }).unwrap();
    }
    let q = Queue::open(&d.0).unwrap();
    assert_eq!(q.get("a").unwrap().state, TaskState::Ready);
    drop(q);
    assert_eq!(Queue::open(&d.0).unwrap().get("a").unwrap().state, TaskState::Ready);
}

#[test]
fn deps_wait_then_run() {
    let d = Dir::new();
    let mut q = Queue::open(&d.0).unwrap();
    q.submit(task("a", &[], 0)).unwrap();
    q.submit(task("b", &["a"], 0)).unwrap();
    assert_eq!(q.ready(), vec!["a".to_string()]);
    q.set_state("a", TaskState::Running { pid: 1 }).unwrap();
    q.set_state("a", TaskState::Done).unwrap();
    assert_eq!(q.ready(), vec!["b".to_string()]);
    assert_eq!(q.get("b").unwrap().state, TaskState::Ready);
}

#[test]
fn failed_dep_fails_dependents_transitively() {
    let d = Dir::new();
    let mut q = Queue::open(&d.0).unwrap();
    q.submit(task("a", &[], 0)).unwrap();
    q.submit(task("b", &["a"], 0)).unwrap();
    q.submit(task("c", &["b"], 0)).unwrap();
    q.ready();
    q.set_state("a", TaskState::Running { pid: 1 }).unwrap();
    q.set_state("a", TaskState::Failed { error: "boom".into() }).unwrap();
    assert!(q.ready().is_empty());
    assert_eq!(q.get("b").unwrap().state, TaskState::Failed { error: "dep a failed".into() });
    assert_eq!(q.get("c").unwrap().state, TaskState::Failed { error: "dep b failed".into() });
}

#[test]
fn retry_until_max_retries() {
    let d = Dir::new();
    let mut q = Queue::open(&d.0).unwrap();
    q.submit(task("a", &[], 2)).unwrap();
    q.ready();
    for attempt in 1..=2u32 {
        q.set_state("a", TaskState::Running { pid: 1 }).unwrap();
        q.set_state("a", TaskState::Failed { error: "x".into() }).unwrap();
        let t = q.get("a").unwrap();
        assert_eq!(t.state, TaskState::Ready);
        assert_eq!(t.attempts, attempt);
    }
    q.set_state("a", TaskState::Running { pid: 1 }).unwrap();
    q.set_state("a", TaskState::Failed { error: "x".into() }).unwrap();
    let t = q.get("a").unwrap();
    assert_eq!(t.state, TaskState::Failed { error: "x".into() });
    assert_eq!(t.attempts, 2);
}

#[test]
fn invalid_transitions_rejected() {
    let d = Dir::new();
    let mut q = Queue::open(&d.0).unwrap();
    q.submit(task("a", &[], 0)).unwrap();
    assert!(q.set_state("a", TaskState::Done).is_err());
    q.ready();
    q.set_state("a", TaskState::Running { pid: 1 }).unwrap();
    q.set_state("a", TaskState::Done).unwrap();
    assert!(q.set_state("a", TaskState::Running { pid: 2 }).is_err());
    assert!(q.set_state("missing", TaskState::Done).is_err());
}

#[test]
fn submit_rejects_bad_ids_and_deps() {
    let d = Dir::new();
    let mut q = Queue::open(&d.0).unwrap();
    q.submit(task("a", &[], 0)).unwrap();
    assert!(q.submit(task("a", &[], 0)).is_err());
    assert!(q.submit(task("b", &["zzz"], 0)).is_err());
    assert!(q.submit(task("c", &["c"], 0)).is_err());
    assert!(q.get("b").is_none() && q.get("c").is_none());
}

#[test]
fn thousand_tasks_fast() {
    let d = Dir::new();
    let start = std::time::Instant::now();
    {
        let mut q = Queue::open(&d.0).unwrap();
        for i in 0..1000 {
            q.submit(task(&format!("t{i}"), &[], 0)).unwrap();
        }
    }
    let q = Queue::open(&d.0).unwrap();
    assert_eq!(q.all().len(), 1000);
    assert!(start.elapsed().as_secs_f64() < 2.0, "took {:?}", start.elapsed());
}
