use loom::orchestrator::Engine;
use loom::types::{AgentKind, Event, Task, TaskState};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("loom-orch-test-{}-{}", name, std::process::id()));
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

fn task(id: &str, deps: &[&str], max_retries: u32) -> Task {
    Task {
        id: id.into(),
        agent: AgentKind::Claude,
        prompt: "p".into(),
        cwd: std::env::temp_dir(),
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

fn with_env(mut t: Task, kv: &[(&str, &str)]) -> Task {
    for (k, v) in kv {
        t.env.insert(k.to_string(), v.to_string());
    }
    t
}

fn state(e: &Engine, id: &str) -> TaskState {
    e.tasks().into_iter().find(|t| t.id == id).unwrap().state
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

fn engine(dir: &Path, max: usize) -> Engine {
    let mut e = Engine::open(dir, max).unwrap();
    e.set_program("claude", fixture());
    e
}

fn has_exit(e: &Engine) -> bool {
    e.events_since(0).iter().any(|l| matches!(l.event, Event::Exit { .. }))
}

#[test]
fn runs_task_to_done_and_logs_events() {
    let d = Dir::new("done");
    let mut e = engine(&d.0, 2);
    e.submit(task("a", &[], 0)).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(state(&e, "a"), TaskState::Done);
    let evs = e.events_since(0);
    assert!(evs.iter().any(|l| l.task == "a" && matches!(l.event, Event::Result { .. })));
    assert!(evs.iter().any(|l| matches!(l.event, Event::Exit { code: Some(0) })));
    assert!(evs.windows(2).all(|w| w[0].seq < w[1].seq));
    assert_eq!(e.events_since(evs.len() as u64 - 1).len(), 1);
}

#[test]
fn respects_dependencies_and_parallel_limit() {
    let d = Dir::new("deps");
    let mut e = engine(&d.0, 2);
    e.submit(task("a", &[], 0)).unwrap();
    e.submit(task("b", &[], 0)).unwrap();
    e.submit(task("c", &["a"], 0)).unwrap();
    e.tick();
    assert!(matches!(state(&e, "c"), TaskState::Pending));
    e.run_until_idle(Duration::from_secs(20));
    for id in ["a", "b", "c"] {
        assert_eq!(state(&e, id), TaskState::Done, "{id}");
    }
}

#[test]
fn failed_task_retries_then_fails() {
    let d = Dir::new("retry");
    let mut e = engine(&d.0, 1);
    e.submit(with_env(task("f", &[], 1), &[("MODE", "fail")])).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "f"), TaskState::Failed { .. }));
    let t = e.tasks().into_iter().find(|t| t.id == "f").unwrap();
    assert_eq!(t.attempts, 1);
}

#[test]
fn argv_and_programs_override_are_used() {
    let d = Dir::new("argv");
    let argv = d.0.join("argv.txt");
    let mut e = engine(&d.0, 1);
    let argv_s = argv.to_string_lossy().into_owned();
    e.submit(with_env(task("x", &[], 0), &[("ARGV_OUT", &argv_s)])).unwrap();
    e.run_until_idle(Duration::from_secs(20));
    let args = fs::read_to_string(&argv).unwrap();
    assert!(args.lines().any(|l| l == "--output-format"), "{args}");
    assert_eq!(state(&e, "x"), TaskState::Done);
}

#[test]
fn cancel_kills_running_task() {
    let d = Dir::new("cancel");
    let pid = d.0.join("pid.txt");
    let pid_s = pid.to_string_lossy().into_owned();
    let mut e = engine(&d.0, 1);
    e.submit(with_env(task("s", &[], 0), &[("MODE", "sleep"), ("SLEEP_SECS", "30"), ("PID_OUT", &pid_s)])).unwrap();
    e.tick();
    assert!(wait_for(&mut e, 10, |e| matches!(state(e, "s"), TaskState::Running { .. })));
    e.cancel("s").unwrap();
    assert_eq!(state(&e, "s"), TaskState::Cancelled);
    assert!(wait_for(&mut e, 10, has_exit));
    assert_eq!(state(&e, "s"), TaskState::Cancelled);
}

#[test]
fn held_tool_call_needs_approval_then_runs() {
    let d = Dir::new("approve");
    let mut e = engine(&d.0, 1);
    e.submit(with_env(task("t", &[], 0), &[("MODE", "tool"), ("SLEEP_SECS", "30")])).unwrap();
    e.tick();
    assert!(wait_for(&mut e, 10, |e| matches!(state(e, "t"), TaskState::NeedsApproval { .. })));
    assert!(wait_for(&mut e, 10, has_exit));
    e.approve("t").unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(state(&e, "t"), TaskState::Done);
}

#[test]
fn approvals_survive_reopen() {
    let d = Dir::new("reopen");
    {
        let mut e = engine(&d.0, 1);
        e.submit(with_env(task("r", &[], 0), &[("MODE", "tool"), ("SLEEP_SECS", "30")])).unwrap();
        e.tick();
        assert!(wait_for(&mut e, 10, |e| matches!(state(e, "r"), TaskState::NeedsApproval { .. })));
        assert!(wait_for(&mut e, 10, has_exit));
        e.approve("r").unwrap();
        e.run_until_idle(Duration::from_secs(20));
        assert_eq!(state(&e, "r"), TaskState::Done);
    }
    let saved = fs::read_to_string(d.0.join("approvals.json")).unwrap();
    assert!(saved.contains("\"r\""), "{saved}");
    let e = Engine::open(&d.0, 1).unwrap();
    assert_eq!(state(&e, "r"), TaskState::Done);
}

#[test]
fn events_are_replayed_after_reopen() {
    let d = Dir::new("replay");
    let last;
    {
        let mut e = engine(&d.0, 1);
        e.submit(task("p", &[], 0)).unwrap();
        e.run_until_idle(Duration::from_secs(20));
        last = e.events_since(0).last().unwrap().seq;
    }
    let e = Engine::open(&d.0, 1).unwrap();
    assert_eq!(e.events_since(0).last().unwrap().seq, last);
    assert!(e.events_since(last).is_empty());
}

#[test]
fn same_session_key_runs_one_at_a_time_and_resumes() {
    let d = Dir::new("resume");
    let argv = d.0.join("argv.txt");
    let argv_s = argv.to_string_lossy().into_owned();
    let mut e = engine(&d.0, 4);
    for id in ["s1", "s2"] {
        let mut t = with_env(task(id, &[], 0), &[("ARGV_OUT", &argv_s), ("MODE", "sleep"), ("SLEEP_SECS", "0")]);
        t.session_key = Some("sess".into());
        e.submit(t).unwrap();
    }
    e.tick();
    let mut both = false;
    let end = Instant::now() + Duration::from_secs(20);
    while Instant::now() < end && e.tasks().iter().any(|t| !matches!(t.state, TaskState::Done | TaskState::Failed { .. })) {
        if e.tasks().iter().filter(|t| matches!(t.state, TaskState::Running { .. })).count() > 1 {
            both = true;
        }
        e.tick();
        e.pump(Duration::from_millis(50));
    }
    assert!(!both, "two runs of one session were Running at once");
    assert_eq!(state(&e, "s1"), TaskState::Done);
    assert_eq!(state(&e, "s2"), TaskState::Done);
    let args = fs::read_to_string(&argv).unwrap();
    assert!(args.lines().any(|l| l == "--resume"), "{args}");
    assert!(args.lines().any(|l| l == "fake-session-1"), "{args}");
}

#[test]
fn parallel_cap_is_reached_and_not_exceeded() {
    let d = Dir::new("cap");
    let mut e = engine(&d.0, 4);
    for i in 0..8 {
        e.submit(with_env(task(&format!("p{i}"), &[], 0), &[("MODE", "sleep"), ("SLEEP_SECS", "0.3")])).unwrap();
    }
    let mut max = 0;
    let end = Instant::now() + Duration::from_secs(20);
    while Instant::now() < end && e.tasks().iter().any(|t| !matches!(t.state, TaskState::Done | TaskState::Failed { .. })) {
        e.tick();
        max = max.max(e.tasks().iter().filter(|t| matches!(t.state, TaskState::Running { .. })).count());
        e.pump(Duration::from_millis(20));
    }
    assert_eq!(max, 4);
    assert!(e.tasks().iter().all(|t| t.state == TaskState::Done));
}

#[test]
fn gated_prompt_needs_approval_and_never_runs() {
    let d = Dir::new("gate");
    let marker = d.0.join("marker");
    let marker_s = marker.to_string_lossy().into_owned();
    let mut e = engine(&d.0, 1);
    let mut t = with_env(task("g", &[], 0), &[("MARKER", &marker_s)]);
    t.prompt = "publish the package to npm".into();
    e.submit(t).unwrap();
    e.run_until_idle(Duration::from_secs(1));
    assert!(matches!(state(&e, "g"), TaskState::NeedsApproval { .. }));
    assert!(!marker.exists());
}

#[test]
fn running_task_is_recovered_after_crash() {
    let d = Dir::new("crash");
    let pid = d.0.join("pid.txt");
    let pid_s = pid.to_string_lossy().into_owned();
    {
        let mut e = engine(&d.0, 1);
        e.submit(with_env(task("c", &[], 0), &[("MODE", "sleep"), ("SLEEP_SECS", "2"), ("PID_OUT", &pid_s)])).unwrap();
        e.tick();
        assert!(wait_for(&mut e, 10, |e| matches!(state(e, "c"), TaskState::Running { .. }) && pid.exists()));
    }
    let child = fs::read_to_string(&pid).unwrap();
    std::process::Command::new("kill").args(["-9", child.trim()]).status().unwrap();
    let mut e = engine(&d.0, 1);
    assert_eq!(state(&e, "c"), TaskState::Ready);
    e.run_until_idle(Duration::from_secs(20));
    assert_eq!(state(&e, "c"), TaskState::Done);
}
