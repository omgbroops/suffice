use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};
use suffice::json::{parse, Value};
use suffice::orchestrator::Engine;
use suffice::pool::{Pool, PoolMsg};
use suffice::triggers::When;
use suffice::types::Cmd;

fn tmp(name: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("suffice-hunt5-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).unwrap();
    p
}

fn sh(script: &str) -> Cmd {
    Cmd {
        program: "sh".into(),
        args: vec!["-c".into(), script.into()],
        cwd: "/".into(),
        env: BTreeMap::new(),
        stdin: None,
    }
}

#[test]
fn every_secs_above_ten_years_is_rejected() {
    let dir = tmp("every-large");
    let mut e = Engine::open(&dir, 1).unwrap();
    let err = e.add_trigger("big", When::Every { secs: 9_000_000_000_000 }, Value::Null).unwrap_err();
    assert_eq!(err, "every too large");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn unreadable_next_due_is_recomputed_not_fired_at_once() {
    let dir = tmp("next-due");
    let body = r#"[{"id":"ev","when":{"kind":"every","secs":1},"template":null,"enabled":true,
        "fires":0,"last_fire_ms":null,"next_due_ms":9100000000000000,"done_seen":[],"created_ms":0,"failures":0}]"#;
    fs::write(dir.join("triggers.json"), body).unwrap();
    let mut e = Engine::open(&dir, 1).unwrap();
    e.set_clock(|| 1000);
    e.tick();
    let t = &e.triggers()[0];
    // a fire attempt (even one that fails to parse) bumps failures or fires
    assert_eq!((t.fires, t.failures), (0, 0), "trigger fired on load");
    assert!(t.last_fire_ms.is_none());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn huge_line_is_capped_and_following_line_still_arrives() {
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    assert!(pool.try_start("big", sh("head -c 3000000 /dev/zero | tr '\\0' a; echo; echo next"), 0));
    let mut lines = vec![];
    loop {
        match rx.recv_timeout(Duration::from_secs(20)).unwrap() {
            PoolMsg::Stdout { line, .. } => lines.push(line),
            PoolMsg::Exited { .. } => break,
            _ => {}
        }
    }
    assert!(lines[0].len() <= (1 << 20) + " …[truncated]".len(), "first line is {} bytes", lines[0].len());
    assert_eq!(lines[1], "next");
}

#[test]
fn daemonized_grandchild_holding_pipe_does_not_block_exit() {
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    let script = r#"perl -e 'use POSIX; my $p = fork; if ($p == 0) { POSIX::setsid(); sleep 30; exit } print "$p\nhi\n"'"#;
    let start = Instant::now();
    assert!(pool.try_start("dae", sh(script), 0));
    let mut gpid: Option<u32> = None;
    loop {
        let left = Duration::from_secs(5).saturating_sub(start.elapsed());
        match rx.recv_timeout(left) {
            Ok(PoolMsg::Stdout { line, .. }) if gpid.is_none() => gpid = line.parse().ok(),
            Ok(PoolMsg::Exited { .. }) => break,
            Ok(_) => {}
            Err(_) => panic!("Exited did not arrive within 5 s"),
        }
    }
    let gpid = gpid.expect("grandchild pid was not printed");
    let _ = Command::new("kill").arg("-9").arg(gpid.to_string()).status();
}

#[test]
fn strict_json_numbers() {
    for bad in ["+1", "01", "1.", ".5", "1e999", "-", "1e", "1e+"] {
        assert!(parse(bad).is_err(), "{bad} should be rejected");
    }
    for good in ["-0", "0.5", "1e3", "-12.5E-2"] {
        assert!(parse(good).is_ok(), "{good} should be accepted");
    }
}
