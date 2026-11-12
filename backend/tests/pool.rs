use suffice::pool::{Pool, PoolMsg};
use suffice::types::Cmd;
use std::collections::BTreeMap;
use std::sync::mpsc::{channel, Receiver};
use std::thread;
use std::time::{Duration, Instant};

fn cmd(program: &str, args: &[&str], stdin: Option<&str>) -> Cmd {
    Cmd {
        program: program.to_string(),
        args: args.iter().map(|a| a.to_string()).collect(),
        cwd: "/".into(),
        env: BTreeMap::new(),
        stdin: stdin.map(|s| s.to_string()),
    }
}

fn next(rx: &Receiver<PoolMsg>) -> PoolMsg {
    rx.recv_timeout(Duration::from_secs(10)).expect("pool message within 10 s")
}

/// Collect messages until `n` runs have sent Exited.
fn until_exited(rx: &Receiver<PoolMsg>, n: usize) -> Vec<PoolMsg> {
    let mut all = Vec::new();
    let mut done = 0;
    while done < n {
        let m = next(rx);
        if matches!(m, PoolMsg::Exited { .. }) {
            done += 1;
        }
        all.push(m);
    }
    all
}

fn lines_of(msgs: &[PoolMsg], run: &str) -> Vec<String> {
    msgs.iter()
        .filter_map(|m| match m {
            PoolMsg::Stdout { run: r, line } if r == run => Some(line.clone()),
            _ => None,
        })
        .collect()
}

fn exit_of(msgs: &[PoolMsg], run: &str) -> PoolMsg {
    msgs.iter()
        .find(|m| matches!(m, PoolMsg::Exited { run: r, .. } if r == run))
        .cloned()
        .expect("Exited for run")
}

#[test]
fn echo_lines_in_order_then_exit_zero() {
    let (tx, rx) = channel();
    let pool = Pool::new(4, tx);
    assert!(pool.try_start("e", cmd("/bin/sh", &["-c", "echo one; echo two"], None), 0));
    let msgs = until_exited(&rx, 1);
    assert_eq!(lines_of(&msgs, "e"), vec!["one", "two"]);
    assert_eq!(
        exit_of(&msgs, "e"),
        PoolMsg::Exited { run: "e".into(), code: Some(0), timed_out: false, killed: false }
    );
    assert!(matches!(msgs.last(), Some(PoolMsg::Exited { .. })), "Exited must be last");
}

#[test]
fn stdin_is_delivered() {
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    assert!(pool.try_start("c", cmd("/bin/cat", &[], Some("hello\nworld\n")), 0));
    let msgs = until_exited(&rx, 1);
    assert_eq!(lines_of(&msgs, "c"), vec!["hello", "world"]);
}

#[test]
fn stderr_lines_tagged_stderr() {
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    assert!(pool.try_start("s", cmd("/bin/sh", &["-c", "echo oops >&2"], None), 0));
    let msgs = until_exited(&rx, 1);
    assert!(msgs.contains(&PoolMsg::Stderr { run: "s".into(), line: "oops".into() }));
    assert!(lines_of(&msgs, "s").is_empty());
}

#[test]
fn cap_of_two_frees_slot_on_exit() {
    let (tx, rx) = channel();
    let pool = Pool::new(2, tx);
    assert!(pool.try_start("a", cmd("/bin/sleep", &["1"], None), 0));
    assert!(pool.try_start("b", cmd("/bin/sleep", &["30"], None), 0));
    assert_eq!(pool.running(), 2);
    assert!(!pool.try_start("c", cmd("/bin/sleep", &["30"], None), 0));
    // a exits after 1 s
    until_exited(&rx, 1);
    assert_eq!(pool.running(), 1);
    assert!(pool.try_start("c", cmd("/bin/sleep", &["30"], None), 0));
    pool.kill("b");
    pool.kill("c");
    until_exited(&rx, 2);
    assert_eq!(pool.running(), 0);
}

#[test]
fn timeout_kills_and_reports_timed_out() {
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    let start = Instant::now();
    assert!(pool.try_start("t", cmd("/bin/sleep", &["30"], None), 1));
    let msgs = until_exited(&rx, 1);
    assert!(start.elapsed() < Duration::from_secs(4), "timeout took {:?}", start.elapsed());
    assert!(matches!(
        exit_of(&msgs, "t"),
        PoolMsg::Exited { timed_out: true, killed: false, .. }
    ));
}

/// True while `pid` still exists (kill -0 succeeds). Bounded wait for zombies to be reaped.
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
        thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn kill_takes_down_whole_process_group() {
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    assert!(pool.try_start(
        "k",
        cmd("/bin/sh", &["-c", "sleep 30 & echo $!; sleep 30"], None),
        0
    ));
    // first stdout line is the grandchild's pid
    let child_pid = loop {
        match next(&rx) {
            PoolMsg::Stdout { run, line } if run == "k" => break line,
            _ => {}
        }
    };
    pool.kill("k");
    let msgs = until_exited(&rx, 1);
    assert!(matches!(
        exit_of(&msgs, "k"),
        PoolMsg::Exited { killed: true, timed_out: false, .. }
    ));
    assert!(!alive(&child_pid), "grandchild {child_pid} still alive");
}

#[test]
fn missing_program_is_spawn_failed() {
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    assert!(pool.try_start("m", cmd("/nonexistent/suffice-no-such-program", &[], None), 0));
    match next(&rx) {
        PoolMsg::SpawnFailed { run, .. } => assert_eq!(run, "m"),
        other => panic!("expected SpawnFailed, got {other:?}"),
    }
    assert_eq!(pool.running(), 0, "failed spawn must not consume a slot");
}

#[test]
fn twenty_parallel_runs_keep_their_own_lines() {
    let (tx, rx) = channel();
    let pool = Pool::new(20, tx);
    for i in 0..20 {
        let script = format!("echo r{i}-a; echo r{i}-b");
        assert!(pool.try_start(&format!("r{i}"), cmd("/bin/sh", &["-c", &script], None), 0));
    }
    let msgs = until_exited(&rx, 20);
    for i in 0..20 {
        let run = format!("r{i}");
        let mut lines = lines_of(&msgs, &run);
        lines.sort();
        assert_eq!(lines, vec![format!("{run}-a"), format!("{run}-b")]);
        assert_eq!(exit_of(&msgs, &run), PoolMsg::Exited { run: run.clone(), code: Some(0), timed_out: false, killed: false });
    }
    for m in &msgs {
        if let PoolMsg::Stdout { run, line } | PoolMsg::Stderr { run, line } = m {
            assert!(line.starts_with(&format!("{run}-")), "{run} got foreign line {line}");
        }
    }
}

#[test]
fn nonzero_exit_code_passes_through() {
    let (tx, rx) = channel();
    let pool = Pool::new(1, tx);
    assert!(pool.try_start("x", cmd("/bin/sh", &["-c", "exit 3"], None), 0));
    let msgs = until_exited(&rx, 1);
    assert_eq!(
        exit_of(&msgs, "x"),
        PoolMsg::Exited { run: "x".into(), code: Some(3), timed_out: false, killed: false }
    );
}
