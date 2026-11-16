use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::os::unix::process::CommandExt;
use std::sync::Mutex;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, Instant};

extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
    fn setrlimit(res: i32, lim: *const [u64; 2]) -> i32;
    fn symlink(a: *const std::os::raw::c_char, b: *const std::os::raw::c_char) -> i32;
}
#[cfg(target_os = "macos")]
const RLIMIT_NOFILE: i32 = 8;
#[cfg(not(target_os = "macos"))]
const RLIMIT_NOFILE: i32 = 7;
/// heavy tests (big transfers, floods) run one at a time so timing asserts are not noise
static HEAVY: Mutex<()> = Mutex::new(());
fn heavy() -> std::sync::MutexGuard<'static, ()> {
    HEAVY.lock().unwrap_or_else(|e| e.into_inner())
}
fn fnv(b: &[u8]) -> u64 {
    b.iter().fold(0xcbf29ce484222325u64, |h, &x| (h ^ x as u64).wrapping_mul(0x100000001b3))
}
fn pseudo(n: usize) -> Vec<u8> {
    let mut x = 0x9E3779B97F4A7C15u64;
    (0..n).map(|_| { x ^= x << 13; x ^= x >> 7; x ^= x << 17; (x >> 24) as u8 }).collect()
}
fn frame(t: u8, p: &[u8]) -> Vec<u8> {
    let mut v = vec![t];
    v.extend((p.len() as u32).to_be_bytes());
    v.extend(p);
    v
}
fn stat(d: &Daemon, key: &str) -> u64 {
    let o = d.run(&["stats"]);
    let t = String::from_utf8_lossy(&o.stdout).to_string();
    t.lines().find_map(|l| l.strip_prefix(&format!("{key}="))).unwrap_or_else(|| panic!("no {key} in {t:?} / {}", String::from_utf8_lossy(&o.stderr))).parse().unwrap()
}
fn raw_open(d: &Daemon, id: &str, flags: u8) -> UnixStream {
    let mut c = UnixStream::connect(d.dir.join("host.sock")).unwrap();
    let mut p = id.parse::<u32>().unwrap().to_be_bytes().to_vec();
    p.push(flags);
    c.write_all(&frame(3, &p)).unwrap();
    c
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
        Daemon::start_cfg(None)
    }
    /// `nofile`: RLIMIT_NOFILE for the host; its stderr goes to <dir>/err.log
    fn start_cfg(nofile: Option<u64>) -> Daemon {
        // short path: macOS unix socket paths are limited to ~104 bytes
        let dir = PathBuf::from(format!("/tmp/sfxh-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        std::fs::DirBuilder::new().mode(0o700).create(&dir).unwrap();
        let mut cmd = Command::new(BIN);
        cmd.args(["serve", "--dir"]).arg(&dir);
        if let Some(n) = nofile {
            cmd.stderr(std::fs::File::create(dir.join("err.log")).unwrap());
            unsafe {
                cmd.pre_exec(move || {
                    let l = [n, n];
                    if setrlimit(RLIMIT_NOFILE, &l) != 0 { return Err(std::io::Error::last_os_error()); }
                    Ok(())
                });
            }
        }
        let child = cmd.spawn().unwrap();
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

// ---- review fixes ----

#[test]
fn t8_big_send_is_byte_identical() {
    let _h = heavy();
    let d = Daemon::start();
    let out = d.dir.join("out");
    let id = d.new_session(&["/bin/sh", "-c", &format!("stty raw -echo; echo READY; sleep 1; head -c 20971520 > {}; echo DONE", out.display())]);
    let mut s = d.stream(&id);
    assert!(s.wait_for(b"READY"));
    let data = pseudo(20 << 20);
    let mut c = Command::new(BIN).args(["send", "--dir"]).arg(&d.dir).arg(&id).stdin(Stdio::piped()).spawn().unwrap();
    c.stdin.take().unwrap().write_all(&data).unwrap();
    assert!(c.wait().unwrap().success(), "send failed");
    assert!(s.wait_for(b"DONE"));
    let got = std::fs::read(&out).unwrap();
    assert_eq!((got.len(), fnv(&got)), (data.len(), fnv(&data)), "bytes lost or altered");
}

#[test]
fn t8b_send_to_dead_session_fails() {
    let d = Daemon::start();
    let id = d.new_session(&["/bin/sh", "-c", "exit 0"]);
    assert!(until(|| d.list().iter().any(|r| r[0] == id && r[4] == "0")));
    let mut c = Command::new(BIN).args(["send", "--dir"]).arg(&d.dir).arg(&id).stdin(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap();
    let _ = c.stdin.take().unwrap().write_all(b"hello\n");
    assert!(!c.wait().unwrap().success(), "send to a dead session must fail");
}

#[test]
fn t9_shutdown_with_stuck_reader_is_fast() {
    let _h = heavy();
    let mut d = Daemon::start();
    let id = d.new_session(&["/bin/sh", "-c", "echo $$; while :; do echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx; done"]);
    let c = raw_open(&d, &id, 1); // never read
    c.set_read_timeout(Some(Duration::from_millis(50))).unwrap();
    std::thread::sleep(Duration::from_millis(800));
    let pid: i32 = d.list().iter().find(|r| r[0] == id).unwrap()[1].parse().unwrap();
    let t0 = Instant::now();
    let o = d.run(&["shutdown"]);
    let _ = o;
    assert!(until(|| matches!(d.child.try_wait(), Ok(Some(_)))), "host did not exit");
    assert!(t0.elapsed() < Duration::from_secs(3), "shutdown took {:?}", t0.elapsed());
    assert!(until(|| !alive(pid)), "session child survived");
    assert!(!d.dir.join("host.sock").exists(), "socket left behind");
    drop(c);
}

#[test]
fn t10_flooding_client_does_not_starve_others() {
    let _h = heavy();
    let d = Daemon::start();
    let id = d.new_session(&["/bin/cat"]);
    let echo = d.new_session(&["/bin/cat"]); // other client, other session: tests host fairness, not pty speed
    let mut s = d.stream(&echo);
    let mut f = raw_open(&d, &id, 2);
    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let st = stop.clone();
    let th = std::thread::spawn(move || {
        let one = frame(5, b"a");
        let burst: Vec<u8> = one.iter().cycle().take(one.len() * 20000).cloned().collect();
        while !st.load(Ordering::Relaxed) {
            if f.write_all(&burst).is_err() { break; }
        }
    });
    std::thread::sleep(Duration::from_millis(300));
    let t0 = Instant::now();
    d.send(&echo, b"echo-token-xyz\n");
    let ok = s.wait_for(b"echo-token-xyz");
    let dt = t0.elapsed();
    stop.store(true, Ordering::Relaxed);
    let _ = th.join();
    assert!(ok && dt < Duration::from_secs(1), "echo took {dt:?} (ok={ok})");
}

#[test]
fn t11_oversize_header_dropped_without_buffering() {
    let d = Daemon::start();
    let mut c = UnixStream::connect(d.dir.join("host.sock")).unwrap();
    c.write_all(&[5, 0x7f, 0xff, 0xff, 0xff]).unwrap(); // declares ~2 GiB
    c.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
    let mut b = [0u8; 64];
    let mut closed = false;
    for _ in 0..4 {
        match c.read(&mut b) { Ok(0) | Err(_) => { closed = true; break; } Ok(_) => {} }
    }
    assert!(closed, "client declaring an oversize frame was not dropped");
    assert!(stat(&d, "rbuf_hwm") <= 4096, "host buffered the oversize frame");
    assert!(stat(&d, "dropped_proto") >= 1);
}

#[test]
fn t12_never_reading_stream_is_dropped_and_memory_bounded() {
    let _h = heavy();
    let d = Daemon::start();
    let id = d.new_session(&["/bin/sh", "-c", "while :; do echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx; done"]);
    let c = raw_open(&d, &id, 1); // never read
    assert!(until(|| stat(&d, "dropped_slow") >= 1), "slow client never dropped");
    assert!(stat(&d, "wbuf_hwm") <= (8 << 20) + (128 << 10), "wbuf_hwm {}", stat(&d, "wbuf_hwm"));
    assert!(stat(&d, "wbuf_bytes") <= (8 << 20) + (128 << 10));
    drop(c);
}

#[test]
fn t13_stale_socket_and_lock() {
    // second serve on a live dir fails; first keeps working
    let d = Daemon::start();
    let o = Command::new(BIN).args(["serve", "--dir"]).arg(&d.dir).output().unwrap();
    assert!(!o.status.success(), "second serve must fail");
    assert!(d.run(&["list"]).status.success(), "first host broke");
    drop(d);
    // flock held elsewhere, no socket: refuse
    let dir = PathBuf::from(format!("/tmp/sfxh-lock-{}", std::process::id()));
    std::fs::DirBuilder::new().mode(0o700).create(&dir).unwrap();
    let lock = std::fs::File::create(dir.join("host.lock")).unwrap();
    extern "C" { fn flock(fd: i32, op: i32) -> i32; }
    use std::os::unix::io::AsRawFd;
    assert_eq!(unsafe { flock(lock.as_raw_fd(), 2 | 4) }, 0);
    let o = Command::new(BIN).args(["serve", "--dir"]).arg(&dir).output().unwrap();
    assert!(!o.status.success() && !dir.join("host.sock").exists(), "serve ignored a held lock");
    drop(lock);
    // regular file named host.sock is not deleted
    std::fs::write(dir.join("host.sock"), b"precious").unwrap();
    let o = Command::new(BIN).args(["serve", "--dir"]).arg(&dir).output().unwrap();
    let kept = std::fs::read(dir.join("host.sock")).ok();
    let _ = std::fs::remove_dir_all(&dir);
    assert!(!o.status.success(), "serve must refuse");
    assert_eq!(kept.as_deref(), Some(&b"precious"[..]), "regular file was deleted");
}

#[test]
fn t14_symlinked_state_dir_refused() {
    let real = PathBuf::from(format!("/tmp/sfxh-real-{}", std::process::id()));
    let link = PathBuf::from(format!("/tmp/sfxh-link-{}", std::process::id()));
    std::fs::DirBuilder::new().mode(0o700).create(&real).unwrap();
    let (a, b) = (std::ffi::CString::new(real.to_str().unwrap()).unwrap(), std::ffi::CString::new(link.to_str().unwrap()).unwrap());
    assert_eq!(unsafe { symlink(a.as_ptr(), b.as_ptr()) }, 0);
    let mut child = Command::new(BIN).args(["serve", "--dir"]).arg(&link).stderr(Stdio::null()).spawn().unwrap();
    let ended = until(|| matches!(child.try_wait(), Ok(Some(_))));
    let status = if ended { child.try_wait().unwrap() } else { let _ = child.kill(); let _ = child.wait(); None };
    let sock = real.join("host.sock").exists();
    let _ = std::fs::remove_file(&link);
    let _ = std::fs::remove_dir_all(&real);
    assert!(ended && !status.unwrap().success() && !sock, "symlinked dir was not refused");
}

#[test]
fn t15_accept_exhaustion_does_not_spin() {
    let _h = heavy();
    let d = Daemon::start_cfg(Some(16));
    let pid = d.child.id();
    let cpu = || -> f64 {
        let o = Command::new("ps").args(["-o", "time=", "-p", &pid.to_string()]).output().unwrap();
        let t = String::from_utf8_lossy(&o.stdout).trim().to_string();
        let (m, sec) = t.split_once(':').unwrap_or(("0", "0"));
        m.parse::<f64>().unwrap_or(0.0) * 60.0 + sec.parse::<f64>().unwrap_or(0.0)
    };
    let before = cpu();
    let conns: Vec<_> = (0..40).filter_map(|_| UnixStream::connect(d.dir.join("host.sock")).ok()).collect();
    std::thread::sleep(Duration::from_millis(1500));
    let used = cpu() - before;
    drop(conns);
    assert!(used < 0.5, "host burned {used}s CPU in 1.5 s");
    let log = std::fs::read_to_string(d.dir.join("err.log")).unwrap_or_default();
    let n = log.lines().filter(|l| l.contains("accept failed")).count();
    assert_eq!(n, 1, "expected exactly one accept log line, got {n}: {log:?}");
}

#[test]
fn t16_attach_restores_terminal_on_signals() {
    extern "C" {
        fn openpty(m: *mut i32, s: *mut i32, name: *mut u8, t: *const u8, w: *const u8) -> i32;
        fn tcgetattr(fd: i32, t: *mut [u64; 64]) -> i32;
    }
    #[cfg(target_os = "macos")]
    let lflag = |t: &[u64; 64]| t[3]; // c_lflag at byte offset 24 (u64 slot 3)
    #[cfg(not(target_os = "macos"))]
    let lflag = |t: &[u64; 64]| ((t[1] >> 32) & 0xffff_ffff) as u64; // c_lflag at byte offset 12
    #[cfg(target_os = "macos")]
    const ICANON: u64 = 0x100;
    #[cfg(not(target_os = "macos"))]
    const ICANON: u64 = 0x2;
    const ECHO: u64 = 0x8;
    let d = Daemon::start();
    let id = d.new_session(&["/bin/cat"]);
    for (sig, name) in [(15, "TERM"), (1, "HUP"), (3, "QUIT")] {
        let (mut m, mut sl) = (0i32, 0i32);
        assert_eq!(unsafe { openpty(&mut m, &mut sl, std::ptr::null_mut(), std::ptr::null(), std::ptr::null()) }, 0);
        // drain the master so the child never blocks on output
        let mf = unsafe { <std::fs::File as std::os::unix::io::FromRawFd>::from_raw_fd(m) };
        let mut mr = mf.try_clone().unwrap();
        std::thread::spawn(move || { let mut b = [0u8; 4096]; while matches!(mr.read(&mut b), Ok(n) if n > 0) {} });
        let dup = |fd| unsafe { <Stdio as std::os::unix::io::FromRawFd>::from_raw_fd({ extern "C" { fn dup(f: i32) -> i32; } dup(fd) }) };
        let mut child = Command::new(BIN).args(["attach", "--dir"]).arg(&d.dir).arg(&id)
            .stdin(dup(sl)).stdout(dup(sl)).stderr(dup(sl)).spawn().unwrap();
        let flags = || { let mut t = [0u64; 64]; unsafe { tcgetattr(sl, &mut t) }; lflag(&t) };
        let raw = until(|| flags() & ICANON == 0);
        if !raw { let _ = child.kill(); let _ = child.wait(); panic!("{name}: terminal never went raw"); }
        assert_eq!(unsafe { kill(child.id() as i32, sig) }, 0);
        let mut code = None;
        until(|| { code = child.try_wait().unwrap(); code.is_some() });
        if code.is_none() { let _ = child.kill(); let _ = child.wait(); }
        let f = flags();
        unsafe { extern "C" { fn close(f: i32) -> i32; } close(sl); }
        drop(mf);
        assert_eq!(code.and_then(|c| c.code()), Some(128 + sig), "{name}: exit code");
        assert!(f & ICANON != 0 && f & ECHO != 0, "{name}: terminal left raw (lflag {f:#x})");
    }
}

#[test]
fn t17_child_does_not_inherit_host_fds() {
    let d = Daemon::start();
    let a = d.new_session(&["/bin/cat"]);
    let _held = raw_open(&d, &a, 1); // another client's socket stays open
    let b = d.new_session(&["/bin/sh", "-c", "echo BEGIN; ls -1 /dev/fd; echo END"]);
    let mut s = d.stream(&b);
    assert!(s.wait_for(b"END"), "no output");
    let t = String::from_utf8_lossy(&s.acc).to_string();
    let body = t.split("BEGIN").nth(1).unwrap().split("END").next().unwrap();
    let fds: Vec<u32> = body.split_whitespace().filter_map(|x| x.parse().ok()).collect();
    // allowed: 0,1,2 plus whatever `ls` itself opens, measured here from a plain shell with the same pipe-free stdio
    let base = Command::new("/bin/sh").args(["-c", "ls -1 /dev/fd"]).stdin(Stdio::null()).output().unwrap();
    let max = String::from_utf8_lossy(&base.stdout).split_whitespace().filter_map(|x| x.parse::<u32>().ok()).max().unwrap();
    assert!(!fds.is_empty() && fds.iter().all(|&f| f <= max), "leaked fds: {fds:?} (baseline max {max})");
}
