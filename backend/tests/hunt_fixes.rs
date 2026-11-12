use suffice::pool::{Pool, PoolMsg};
use suffice::types::Cmd;
use std::collections::BTreeMap;
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

fn cmd(program: &str, args: &[&str]) -> Cmd {
    Cmd {
        program: program.to_string(),
        args: args.iter().map(|a| a.to_string()).collect(),
        cwd: "/".into(),
        env: BTreeMap::new(),
        stdin: None,
    }
}

/// True while `pid` still exists (kill -0 succeeds), bounded wait for reaping.
fn alive(pid: &str) -> bool {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let ok = std::process::Command::new("/bin/kill")
            .args(["-0", pid])
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            return false;
        }
        if Instant::now() >= deadline {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn leader_exit_does_not_wait_for_background_grandchild() {
    let pid_file = std::env::temp_dir().join(format!("hunt-grandchild-{}.pid", std::process::id()));
    let _ = std::fs::remove_file(&pid_file);
    let script = format!("(sleep 30 & echo $! > {}); echo hi", pid_file.display());
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    let start = Instant::now();
    assert!(pool.try_start("g", cmd("/bin/sh", &["-c", &script]), 0));
    let deadline = start + Duration::from_secs(3);
    let mut exited = false;
    while Instant::now() < deadline {
        match rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(PoolMsg::Exited { run, .. }) if run == "g" => {
                exited = true;
                break;
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    assert!(exited, "Exited for run g not delivered within 3 s");
    let grandchild = std::fs::read_to_string(&pid_file).expect("grandchild pid file");
    let _ = std::fs::remove_file(&pid_file);
    assert!(!alive(grandchild.trim()), "background grandchild {} outlived its run", grandchild.trim());
}

fn fixture_claude() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_claude.sh")
}

#[test]
fn trigger_fire_is_not_resubmitted_after_crash_before_save() {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;
    use suffice::json::Value;
    use suffice::orchestrator::Engine;
    use suffice::triggers::When;

    let dir = std::env::temp_dir().join(format!("hunt-trig-replay-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let template = Value::Obj(vec![
        ("agent".into(), Value::str("claude")),
        ("prompt".into(), Value::str("hi")),
        ("cwd".into(), Value::str(&std::env::temp_dir().to_string_lossy())),
    ]);
    let clock = Arc::new(AtomicU64::new(0));
    let open = || {
        let mut e = Engine::open(&dir, 2).unwrap();
        e.set_program("claude", fixture_claude());
        let c = clock.clone();
        e.set_clock(move || c.load(Ordering::SeqCst));
        e
    };

    let mut e = open();
    e.add_trigger("ev", When::Every { secs: 1 }, template).unwrap();
    let pre_fire = std::fs::read(dir.join("triggers.json")).unwrap();
    clock.store(1000, Ordering::SeqCst);
    e.tick();
    assert_eq!(e.tasks().iter().filter(|t| t.id.starts_with("ev-")).count(), 1);
    drop(e);

    // crash after queue.submit, before save_triggers: triggers.json still has the pre-fire state
    std::fs::write(dir.join("triggers.json"), &pre_fire).unwrap();
    let mut e = open();
    e.tick();
    let fired: Vec<String> = e.tasks().iter().map(|t| t.id.clone()).filter(|id| id.starts_with("ev-")).collect();
    let _ = std::fs::remove_dir_all(&dir);
    assert_eq!(fired, vec!["ev-1".to_string()], "trigger fire was resubmitted after crash");
}

/// Writes at most `budget` bytes into `buf`, then fails: a torn write.
struct Torn {
    buf: Vec<u8>,
    budget: usize,
}

impl std::io::Write for Torn {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        if self.budget == 0 {
            return Err(std::io::Error::other("disk full"));
        }
        let n = data.len().min(self.budget);
        self.buf.extend_from_slice(&data[..n]);
        self.budget -= n;
        Ok(n)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn torn_append_is_rolled_back_to_pre_write_length() {
    let mut f = Torn { buf: b"old\n".to_vec(), budget: 3 };
    let len = f.buf.len() as u64;
    let res = suffice::queue::write_or_rollback(&mut f, len, b"{\"new\":1}\n", |_| Ok(()), |w, n| {
        w.buf.truncate(n as usize);
        Ok(())
    });
    assert!(res.is_err(), "torn write must surface as an error");
    assert_eq!(f.buf, b"old\n".to_vec(), "torn tail left in file");
}

#[test]
fn duplicate_object_keys_are_rejected() {
    assert!(suffice::json::parse(r#"{"a":1,"a":2}"#).is_err());
    assert!(suffice::json::parse(r#"{"x":{"a":1,"a":2}}"#).is_err());
    assert!(suffice::json::parse(r#"[{"a":1},{"a":2}]"#).is_ok());
    assert!(suffice::json::parse(r#"{"a":1,"b":2}"#).is_ok());
}

#[test]
fn gate_hook_rejects_duplicate_command_keys() {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let mut child = Command::new(env!("CARGO_BIN_EXE_suffice-backend"))
        .arg("gate-hook")
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .expect("spawn gate-hook");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(br#"{"tool_name":"Bash","tool_input":{"command":"ls","command":"curl -X POST x"}}"#)
        .expect("write stdin");
    let out = child.wait_with_output().expect("wait");
    assert_eq!(out.status.code(), Some(2), "{}", String::from_utf8_lossy(&out.stderr));
}
