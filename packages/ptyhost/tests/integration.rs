use std::io::{Read, Write};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, Instant};

extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}
const BIN: &str = env!("CARGO_BIN_EXE_sfx-host");
static N: AtomicU32 = AtomicU32::new(0);
const T: Duration = Duration::from_secs(10);

fn alive(pid: i32) -> bool {
    unsafe { kill(pid, 0) == 0 }
}
fn contains(h: &[u8], n: &[u8]) -> bool {
    h.windows(n.len()).any(|w| w == n)
}
fn until(mut f: impl FnMut() -> bool) -> bool {
    let end = Instant::now() + T;
    while Instant::now() < end {
        if f() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    false
}

struct Daemon {
    dir: PathBuf,
    child: Child,
}
impl Daemon {
    fn start() -> Daemon {
        // short path: macOS unix socket paths are limited to ~104 bytes
        let dir = PathBuf::from(format!("/tmp/sfxh-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        std::fs::DirBuilder::new().mode(0o700).create(&dir).unwrap();
        let child = Command::new(BIN).args(["serve", "--dir"]).arg(&dir).spawn().unwrap();
        let d = Daemon { dir, child }; // Drop cleans up even if the wait below panics
        assert!(until(|| d.dir.join("host.sock").exists()), "socket never appeared");
        d
    }
    fn run(&self, args: &[&str]) -> std::process::Output {
        Command::new(BIN).arg(args[0]).arg("--dir").arg(&self.dir).args(&args[1..]).output().unwrap()
    }
    fn new_session(&self, cmd: &[&str]) -> String {
        let mut a = vec!["new", "--cwd", "/tmp", "--"];
        a.extend_from_slice(cmd);
        let o = self.run(&a);
        assert!(o.status.success(), "new failed: {}", String::from_utf8_lossy(&o.stderr));
        String::from_utf8(o.stdout).unwrap().trim().to_string()
    }
    fn send(&self, id: &str, bytes: &[u8]) {
        let mut c = Command::new(BIN).args(["send", "--dir"]).arg(&self.dir).arg(id).stdin(Stdio::piped()).spawn().unwrap();
        c.stdin.take().unwrap().write_all(bytes).unwrap();
        assert!(c.wait().unwrap().success());
    }
    fn list(&self) -> Vec<Vec<String>> {
        let o = self.run(&["list"]);
        String::from_utf8_lossy(&o.stdout).lines().map(|l| l.split('\t').map(String::from).collect()).collect()
    }
    fn stream(&self, id: &str) -> Stream {
        Stream::spawn(Command::new(BIN).args(["stream", "--dir"]).arg(&self.dir).arg(id))
    }
}
impl Drop for Daemon {
    fn drop(&mut self) {
        let _ = self.run(&["shutdown"]);
        if !until(|| matches!(self.child.try_wait(), Ok(Some(_)))) {
            let _ = self.child.kill(); // our own recorded child only
            let _ = self.child.wait();
        }
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

struct Stream {
    child: Child,
    rx: Receiver<Vec<u8>>,
    acc: Vec<u8>,
}
impl Stream {
    fn spawn(c: &mut Command) -> Stream {
        let mut child = c.stdout(Stdio::piped()).stdin(Stdio::piped()).spawn().unwrap();
        let mut out = child.stdout.take().unwrap();
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            let mut b = [0u8; 4096];
            while let Ok(n) = out.read(&mut b) {
                if n == 0 || tx.send(b[..n].to_vec()).is_err() {
                    break;
                }
            }
        });
        Stream { child, rx, acc: vec![] }
    }
    fn wait_for(&mut self, needle: &[u8]) -> bool {
        let end = Instant::now() + T;
        while !contains(&self.acc, needle) {
            let left = end.saturating_duration_since(Instant::now());
            match self.rx.recv_timeout(left) {
                Ok(b) => self.acc.extend(b),
                Err(_) => return false,
            }
        }
        true
    }
}
impl Drop for Stream {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn t1_cat_echoes_sent_bytes() {
    let d = Daemon::start();
    let id = d.new_session(&["/bin/cat"]);
    let mut s = d.stream(&id);
    // cooked tty: control bytes would be echoed as ^X or signal cat, so use printable, UTF-8 and high bytes
    let blob: Vec<u8> = (0x20u8..0x7f).chain(0x80..=0xff).collect();
    let lines: Vec<Vec<u8>> = vec![
        b"a;b".to_vec(),
        b";".to_vec(),
        "h\u{e9}llo \u{65e5}\u{672c}\u{8a9e} \u{1f600} \u{20ac}".as_bytes().to_vec(),
        blob,
    ];
    for l in &lines {
        let mut m = l.clone();
        m.push(b'\n');
        d.send(&id, &m);
    }
    for l in &lines {
        assert!(s.wait_for(l), "missing {:?}", String::from_utf8_lossy(l));
    }
    // raw mode: every byte 1..=255 must pass through unchanged (echo off, cat output)
    let id = d.new_session(&["/bin/sh", "-c", "stty raw -echo -opost; echo READY; exec cat"]);
    let mut s = d.stream(&id);
    assert!(s.wait_for(b"READY"));
    let all: Vec<u8> = (1u8..=255).collect();
    let mut marked = b"<<".to_vec();
    marked.extend(&all);
    marked.extend(b">>");
    d.send(&id, &marked);
    assert!(s.wait_for(&marked), "raw bytes altered");
}

#[test]
fn t2_two_streams_and_late_replay() {
    let d = Daemon::start();
    let id = d.new_session(&["/bin/cat"]);
    let (mut a, mut b) = (d.stream(&id), d.stream(&id));
    d.send(&id, b"shared-token\n");
    assert!(a.wait_for(b"shared-token") && b.wait_for(b"shared-token"));
    let mut late = d.stream(&id);
    assert!(late.wait_for(b"shared-token"), "no ring replay");
}

#[test]
fn t3_resize_visible_to_child() {
    let d = Daemon::start();
    let id = d.new_session(&["/bin/sh"]);
    let o = d.run(&["resize", &id, "100", "30"]);
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let mut s = d.stream(&id);
    d.send(&id, b"stty size\n");
    assert!(s.wait_for(b"30 100"), "got {:?}", String::from_utf8_lossy(&s.acc));
    assert_eq!(d.list()[0][2..4], ["100", "30"]);
}

#[test]
fn t4_exit_code_and_reaped() {
    let d = Daemon::start();
    let id = d.new_session(&["/bin/sh", "-c", "exit 7"]);
    assert!(until(|| d.list().iter().any(|r| r[0] == id && r[4] == "0")));
    let row = d.list().into_iter().find(|r| r[0] == id).unwrap();
    assert_eq!(row[5], "7");
    assert!(row[7].contains("exit 7"));
    let pid: i32 = row[1].parse().unwrap();
    assert!(!alive(pid), "zombie: pid {pid} still exists");
    // stream of a dead session: replay, then it ends by itself
    let mut s = d.stream(&id);
    assert!(until(|| s.child.try_wait().unwrap().is_some()));
}

#[test]
fn t5_kill_terminates_process_group() {
    let d = Daemon::start();
    let id = d.new_session(&["/bin/sh", "-c", "sleep 1000 & echo \"CH=$!:END\"; wait"]);
    let mut s = d.stream(&id);
    assert!(s.wait_for(b":END"));
    let t = String::from_utf8_lossy(&s.acc).to_string();
    let child: i32 = t.split("CH=").nth(1).unwrap().split(':').next().unwrap().parse().unwrap();
    assert!(alive(child));
    assert!(d.run(&["kill", &id]).status.success());
    assert!(until(|| !alive(child)), "grandchild {child} survived kill");
    assert!(until(|| d.list().iter().all(|r| r[0] != id)), "session not removed");
    assert!(!d.run(&["kill", &id]).status.success(), "second kill must fail");
}

#[test]
fn t6_permissions() {
    let d = Daemon::start();
    let m = |p: &PathBuf| std::fs::metadata(p).unwrap().mode() & 0o777;
    assert_eq!(m(&d.dir.join("host.sock")), 0o600);
    assert_eq!(m(&d.dir), 0o700);
    let bad = PathBuf::from(format!("/tmp/sfxh-bad-{}", std::process::id()));
    std::fs::DirBuilder::new().mode(0o755).create(&bad).unwrap();
    std::fs::set_permissions(&bad, std::fs::Permissions::from_mode(0o755)).unwrap();
    let o = Command::new(BIN).args(["serve", "--dir"]).arg(&bad).output().unwrap();
    let sock = bad.join("host.sock").exists();
    let _ = std::fs::remove_dir_all(&bad);
    assert!(!o.status.success() && !sock, "must refuse 0755 dir");
}

#[test]
fn t7_attach_under_pty_and_detach() {
    let d = Daemon::start();
    let id = d.new_session(&["/bin/cat"]);
    d.send(&id, b"ready-mark\n"); // lands in the ring: seeing it via attach proves the replay path
    let mut cmd = Command::new("script");
    #[cfg(target_os = "macos")]
    cmd.args(["-q", "/dev/null", BIN, "attach", "--dir"]).arg(&d.dir).arg(&id);
    #[cfg(not(target_os = "macos"))]
    cmd.args(["-q", "-c"]).arg(format!("{BIN} attach --dir {} {id}", d.dir.display())).arg("/dev/null");
    let mut a = Stream::spawn(&mut cmd);
    assert!(a.wait_for(b"ready-mark"), "no replay through attach");
    let mut w = d.stream(&id);
    a.child.stdin.as_mut().unwrap().write_all(b"attach-line-7\n").unwrap();
    assert!(w.wait_for(b"attach-line-7"), "typed line never reached the session");
    a.child.stdin.as_mut().unwrap().write_all(&[0x1c, b'd']).unwrap();
    assert!(until(|| a.child.try_wait().unwrap().is_some()), "attach did not exit on detach chord");
    let row = d.list().into_iter().find(|r| r[0] == id).unwrap();
    assert_eq!(row[4], "1", "session died on detach");
}
