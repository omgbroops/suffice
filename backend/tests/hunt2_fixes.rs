use suffice::browser::Browser;
use suffice::json::Value;
use suffice::orchestrator::{rate_limit_text, Engine};
use suffice::types::{Access, AgentKind, Task, TaskState};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const CHROME: &str = "/Users/abhayg/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell";

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Dir {
        let p = std::env::temp_dir().join(format!("suffice-hunt2-test-{}-{}", name, std::process::id()));
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

fn task(id: &str, session: Option<&str>) -> Task {
    Task {
        id: id.into(),
        agent: AgentKind::Claude,
        prompt: "p".into(),
        cwd: std::env::temp_dir(),
        session_key: session.map(String::from),
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

fn state(e: &Engine, id: &str) -> TaskState {
    e.tasks().into_iter().find(|t| t.id == id).unwrap().state
}

#[test]
fn spawn_failure_after_cancel_frees_session_so_retry_runs() {
    let d = Dir::new("spawnfail");
    let mut e = Engine::open(&d.0, 2).unwrap();
    e.set_program("claude", "/nonexistent/suffice-no-such-program");
    e.submit(task("t1", Some("s"))).unwrap();
    e.tick();
    e.cancel("t1").unwrap();
    e.pump(Duration::from_secs(5));
    assert!(e.sessions().iter().all(|s| s.busy_task.is_none()), "session still busy after spawn failure");
    e.set_program("claude", fixture());
    e.retry("t1").unwrap();
    e.run_until_idle(Duration::from_secs(20));
    assert!(matches!(state(&e, "t1"), TaskState::Done), "retry did not run: {:?}", state(&e, "t1"));
    assert!(e.sessions().iter().all(|s| s.busy_task.is_none()));
}

#[test]
fn rate_limiter_identifiers_are_not_rate_limits() {
    for s in ["src/rate_limiter.rs:12 panicked", "RateLimiterConfig"] {
        assert!(!rate_limit_text(s), "{s}");
    }
    for s in ["rate_limit_error", "RateLimitError", "RateLimitExceeded", "Rate limited", "rate limits exceeded", "429 Too Many Requests"] {
        assert!(rate_limit_text(s), "{s}");
    }
}

#[test]
fn navigate_to_closed_port_returns_error() {
    let mut b = Browser::launch(Path::new(CHROME)).expect("launch");
    let err = b.navigate("http://127.0.0.1:1/").unwrap_err();
    assert!(!err.is_empty(), "empty error");
}

#[test]
fn click_next_cannot_be_redirected_to_buy() {
    let html = r#"<button id=next style="position:absolute;left:10px;top:10px;width:120px;height:40px">Next</button>
<script>
new MutationObserver(() => {
  const next = document.getElementById('next');
  if (!next || !next.hasAttribute('data-suffice-gate') || document.getElementById('buy')) return;
  const buy = document.createElement('button');
  buy.id = 'buy';
  buy.textContent = 'Buy now';
  buy.setAttribute('onclick', 'window.bought=1');
  buy.style.cssText = 'position:absolute;left:10px;top:10px;width:120px;height:40px;z-index:5';
  buy.setAttribute('data-suffice-gate', next.getAttribute('data-suffice-gate'));
  next.removeAttribute('data-suffice-gate');
  document.body.appendChild(buy);
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-suffice-gate'] });
</script>"#;
    let dir = std::env::temp_dir().join(format!("suffice-hunt2-redirect-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("index.html");
    fs::write(&path, html).unwrap();
    let mut b = Browser::launch(Path::new(CHROME)).expect("launch");
    b.navigate(&format!("file://{}", path.display())).expect("navigate");
    assert!(b.click("#next").is_err(), "click on Next should be refused");
    assert_eq!(b.evaluate("typeof window.bought").unwrap(), Value::str("undefined"));
    drop(b);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn click_refuses_when_element_is_covered_after_check() {
    let html = r#"<button id=next style="position:absolute;left:10px;top:10px;width:120px;height:40px">Next</button><div onclick="window.bought=1" style="position:absolute;left:10px;top:10px;width:120px;height:40px;z-index:2">Cover</div>"#;
    let dir = std::env::temp_dir().join(format!("suffice-hunt2-browser-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("index.html");
    fs::write(&path, html).unwrap();
    let mut b = Browser::launch(Path::new(CHROME)).expect("launch");
    b.navigate(&format!("file://{}", path.display())).expect("navigate");
    let err = b.click("#next").unwrap_err();
    assert!(err.contains("click target changed"), "got {err}");
    assert_eq!(b.evaluate("window.bought||0").unwrap(), Value::num(0.0));
    assert_eq!(b.evaluate("document.querySelectorAll('[data-suffice-gate]').length").unwrap(), Value::num(0.0));
    drop(b);
    fs::remove_dir_all(dir).unwrap();
}
