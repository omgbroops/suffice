//! Process pool: spawns Cmds, streams their stdout/stderr lines, enforces a concurrency cap and
//! per-run timeouts, kills by pid (whole process group). Knows nothing about agents or tasks
//! beyond an opaque run id.
use crate::types::Cmd;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}

#[derive(Debug, Clone, PartialEq)]
pub enum PoolMsg {
    Started { run: String, pid: u32 },
    Stdout { run: String, line: String },
    Stderr { run: String, line: String },
    /// Always the last message for a run. `timed_out`/`killed` say why it ended early.
    Exited { run: String, code: Option<i32>, timed_out: bool, killed: bool },
    SpawnFailed { run: String, error: String },
}

struct Run {
    pgid: i32,
    killed: Arc<AtomicBool>,
}

struct Inner {
    max: usize,
    out: Sender<PoolMsg>,
    runs: HashMap<String, Run>,
}

pub struct Pool {
    inner: Arc<Mutex<Inner>>,
}

/// SIGTERM the group now, SIGKILL it 3 s later (no-op if the group is already gone).
fn terminate(pgid: i32) {
    unsafe { kill(-pgid, 15) };
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(3));
        unsafe { kill(-pgid, 9) };
    });
}

fn read_lines<R: Read + Send + 'static>(r: R, out: Sender<PoolMsg>, run: String, stderr: bool) -> JoinHandle<()> {
    thread::spawn(move || {
        for line in BufReader::new(r).split(b'\n') {
            let Ok(bytes) = line else { break };
            let text = String::from_utf8_lossy(&bytes).trim_end_matches('\r').to_string();
            let msg = if stderr {
                PoolMsg::Stderr { run: run.clone(), line: text }
            } else {
                PoolMsg::Stdout { run: run.clone(), line: text }
            };
            let _ = out.send(msg);
        }
    })
}

impl Pool {
    /// `max` concurrent runs; every message for every run goes to `out`.
    pub fn new(max: usize, out: Sender<PoolMsg>) -> Pool {
        Pool { inner: Arc::new(Mutex::new(Inner { max, out, runs: HashMap::new() })) }
    }
    /// Start `cmd` now if a slot is free; returns false (and does nothing) when full.
    /// A spawn failure reports SpawnFailed and returns true: the slot is not consumed.
    pub fn try_start(&self, run: &str, cmd: Cmd, timeout_secs: u64) -> bool {
        let mut g = self.inner.lock().unwrap();
        if g.runs.len() >= g.max || g.runs.contains_key(run) {
            return false;
        }
        let out = g.out.clone();
        let mut c = Command::new(&cmd.program);
        c.args(&cmd.args)
            .current_dir(&cmd.cwd)
            .envs(&cmd.env)
            .stdin(if cmd.stdin.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .process_group(0);
        let mut child = match c.spawn() {
            Ok(child) => child,
            Err(e) => {
                let _ = out.send(PoolMsg::SpawnFailed { run: run.to_string(), error: e.to_string() });
                return true;
            }
        };
        let pid = child.id();
        let pgid = pid as i32;
        let killed = Arc::new(AtomicBool::new(false));
        g.runs.insert(run.to_string(), Run { pgid, killed: killed.clone() });
        let _ = out.send(PoolMsg::Started { run: run.to_string(), pid });
        if let (Some(mut stdin), Some(input)) = (child.stdin.take(), cmd.stdin) {
            // own thread: a large input must not block the caller while the child is not reading
            thread::spawn(move || {
                let _ = stdin.write_all(input.as_bytes());
            });
        }
        let mut readers = Vec::new();
        if let Some(o) = child.stdout.take() {
            readers.push(read_lines(o, out.clone(), run.to_string(), false));
        }
        if let Some(e) = child.stderr.take() {
            readers.push(read_lines(e, out.clone(), run.to_string(), true));
        }
        let inner = self.inner.clone();
        let name = run.to_string();
        let start = Instant::now();
        let timeout = Duration::from_secs(timeout_secs);
        thread::spawn(move || {
            let mut timed_out = false;
            let code = loop {
                match child.try_wait() {
                    Ok(Some(st)) => break st.code(),
                    Err(_) => break None,
                    Ok(None) => {
                        if timeout_secs > 0 && !timed_out && start.elapsed() >= timeout {
                            timed_out = true;
                            terminate(pgid);
                        }
                        thread::sleep(Duration::from_millis(50));
                    }
                }
            };
            // free the slot as soon as the leader is gone; grandchildren may still hold the pipes
            {
                let mut g = inner.lock().unwrap();
                if g.runs.get(&name).map_or(false, |r| r.pgid == pgid) {
                    g.runs.remove(&name);
                }
            }
            for r in readers {
                let _ = r.join();
            }
            let _ = out.send(PoolMsg::Exited {
                run: name,
                code,
                timed_out,
                killed: killed.load(Ordering::SeqCst),
            });
        });
        true
    }
    pub fn running(&self) -> usize {
        self.inner.lock().unwrap().runs.len()
    }
    /// SIGTERM the run's process group, SIGKILL after 3 s. No-op for unknown runs.
    pub fn kill(&self, run: &str) {
        let g = self.inner.lock().unwrap();
        if let Some(r) = g.runs.get(run) {
            r.killed.store(true, Ordering::SeqCst);
            terminate(r.pgid);
        }
    }
}
