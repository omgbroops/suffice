use suffice::session::Sessions;
use suffice::types::AgentKind;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

struct Dir(PathBuf);
impl Dir {
    fn new() -> Dir {
        let p = std::env::temp_dir().join(format!("suffice-test-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
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

#[test]
fn claim_release_cycle() {
    let d = Dir::new();
    let mut s = Sessions::open(&d.0).unwrap();
    assert!(s.claim("k", &AgentKind::Claude, "t1"));
    assert!(!s.claim("k", &AgentKind::Claude, "t2"));
    s.release("k", "t1");
    assert!(s.claim("k", &AgentKind::Claude, "t2"));
}

#[test]
fn different_agent_kind_rejected() {
    let d = Dir::new();
    let mut s = Sessions::open(&d.0).unwrap();
    assert!(s.claim("k", &AgentKind::Claude, "t1"));
    s.release("k", "t1");
    assert!(!s.claim("k", &AgentKind::Codex, "t2"));
}

#[test]
fn native_id_persists_across_reopen() {
    let d = Dir::new();
    {
        let mut s = Sessions::open(&d.0).unwrap();
        assert!(s.claim("k", &AgentKind::Claude, "t1"));
        s.set_native("k", "native-1");
        s.release("k", "t1");
    }
    let s = Sessions::open(&d.0).unwrap();
    let got = s.get("k").unwrap();
    assert_eq!(got.native_id.as_deref(), Some("native-1"));
    assert_eq!(got.agent, AgentKind::Claude);
}

#[test]
fn busy_not_persisted() {
    let d = Dir::new();
    {
        let mut s = Sessions::open(&d.0).unwrap();
        assert!(s.claim("k", &AgentKind::Claude, "t1"));
    }
    let mut s = Sessions::open(&d.0).unwrap();
    assert_eq!(s.get("k").unwrap().busy_task, None);
    assert!(s.claim("k", &AgentKind::Claude, "t2"));
}
