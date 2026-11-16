//! The session host: single-threaded poll(2) loop over the listener, a SIGCHLD self-pipe,
//! every pty master and every client connection. It never reads or sets credentials;
//! children inherit the host's environment unchanged.
//!
//! Flow control: a writer client (OPEN flag 2) is not read while its session's input queue
//! holds IN_CAP bytes, so its blocking write stalls and no input is dropped. A client whose
//! outgoing queue passes OUT_CAP is not reading and is dropped; a stream/attach client can
//! simply re-attach and gets the ring replay again.
use crate::proto::*;
use crate::sys::{self, PollFd, POLLERR, POLLHUP, POLLIN, POLLOUT};
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::{DirBuilderExt, FileTypeExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::io::AsRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};
use std::time::{Duration, Instant};

const RING: usize = 256 * 1024;
const OUT_CAP: usize = 8 << 20; // a client with more than this queued is dropped
const IN_CAP: usize = 4 << 20;
const READ_BUDGET: usize = 256 * 1024; // bytes read per client per poll turn
const COMPACT_AT: usize = 1 << 20;
const ACCEPT_PAUSE: Duration = Duration::from_millis(100);
const SHUTDOWN_FLUSH: Duration = Duration::from_millis(500);

// debug counters, reported by STATS
static RBUF_HWM: AtomicUsize = AtomicUsize::new(0);
static WBUF_HWM: AtomicUsize = AtomicUsize::new(0);
static DROPPED_SLOW: AtomicUsize = AtomicUsize::new(0);
static DROPPED_PROTO: AtomicUsize = AtomicUsize::new(0);

struct Session {
    pid: i32,
    master: i32, // -1 once closed
    cols: u16,
    rows: u16,
    cwd: String,
    cmd: Vec<String>,
    ring: VecDeque<u8>,
    inbuf: VecDeque<u8>,
    dropped: bool, // queued input was discarded because the session ended
    exit: Option<i32>,
    kill_req: bool,
}
struct Conn {
    s: UnixStream,
    rbuf: Vec<u8>,
    roff: usize,
    wbuf: Vec<u8>,
    woff: usize,
    sub: Option<(u32, u8)>,
    closing: bool,
    dead: bool,
    eof: bool,  // peer half-closed: no more requests; a writer is ACKed once its input is delivered
    lost: bool, // an INPUT frame arrived for a session that could not take it
}
impl Conn {
    fn pending(&self) -> usize {
        self.wbuf.len() - self.woff
    }
}
enum Src {
    Listen,
    Wake,
    Master(u32),
    Conn(u64),
}
struct Host {
    sessions: BTreeMap<u32, Session>,
    conns: HashMap<u64, Conn>,
    next_sid: u32,
    next_cid: u64,
    stop: bool,
}

fn push(c: &mut Conn, t: u8, p: &[u8]) {
    if c.dead {
        return;
    }
    c.wbuf.extend_from_slice(&encode(t, p));
    WBUF_HWM.fetch_max(c.pending(), Relaxed);
    if c.pending() > OUT_CAP {
        c.dead = true;
        c.wbuf = Vec::new();
        c.woff = 0;
        DROPPED_SLOW.fetch_add(1, Relaxed);
    }
}

/// Nonblocking write of as much of the queue as the socket takes.
fn flush(c: &mut Conn) {
    while c.pending() > 0 {
        match c.s.write(&c.wbuf[c.woff..]) {
            Ok(n) => c.woff += n,
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => break,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(_) => {
                c.dead = true;
                break;
            }
        }
    }
    if c.pending() == 0 {
        c.wbuf.clear();
        c.woff = 0;
    } else if c.woff >= COMPACT_AT {
        c.wbuf.drain(..c.woff);
        c.woff = 0;
    }
}

#[derive(Debug, PartialEq)]
enum AcceptAct {
    Retry,
    Done,
    Pause,
}
/// What to do after accept() failed. EMFILE/ENFILE/ENOBUFS (and anything unexpected) leave the
/// connection in the backlog, so the listener stays readable: pause polling it instead of spinning.
fn accept_action(e: &io::Error) -> AcceptAct {
    match e.kind() {
        io::ErrorKind::Interrupted | io::ErrorKind::ConnectionAborted => AcceptAct::Retry,
        io::ErrorKind::WouldBlock => AcceptAct::Done,
        _ => AcceptAct::Pause,
    }
}

fn prepare_dir(dir: &Path) -> Result<(), String> {
    match fs::symlink_metadata(dir) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            DirBuilder::new().recursive(true).mode(0o700).create(dir).map_err(|e| e.to_string())?;
        }
        Err(e) => return Err(format!("{}: {e}", dir.display())),
        Ok(_) => {}
    }
    let m = fs::symlink_metadata(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    if m.file_type().is_symlink() || !m.is_dir() {
        return Err(format!("{}: not a real directory (symlinks are refused)", dir.display()));
    }
    if m.uid() != sys::getuid_() {
        return Err(format!("{}: owned by uid {}, not by us", dir.display(), m.uid()));
    }
    if m.mode() & 0o077 != 0 {
        return Err(format!("{}: mode {:o} is group/world accessible; chmod 700 it", dir.display(), m.mode() & 0o777));
    }
    Ok(())
}

/// Removes a leftover socket only if it is a socket of ours that nobody listens on.
fn clear_stale_socket(sock: &Path) -> Result<(), String> {
    let m = match fs::symlink_metadata(sock) {
        Ok(m) => m,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("{}: {e}", sock.display())),
    };
    if !m.file_type().is_socket() || m.uid() != sys::getuid_() {
        return Err(format!("{} exists and is not a socket owned by us; refusing to remove it", sock.display()));
    }
    match UnixStream::connect(sock) {
        Ok(_) => Err("a host is already running in this dir".into()),
        Err(e) if e.kind() == io::ErrorKind::ConnectionRefused => fs::remove_file(sock).map_err(|e| e.to_string()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("cannot probe {}: {e}; not removing it", sock.display())),
    }
}

pub fn serve(dir: &Path) -> Result<(), String> {
    let e = |x: io::Error| x.to_string();
    prepare_dir(dir)?;
    let _lock = OpenOptions::new()
        .write(true)
        .create(true)
        .mode(0o600)
        .custom_flags(sys::O_NOFOLLOW)
        .open(dir.join("host.lock"))
        .map_err(e)?;
    sys::lock_exclusive(&_lock).map_err(|_| "a host is already running in this dir".to_string())?;
    let sock = dir.join("host.sock");
    clear_stale_socket(&sock)?;
    let old = sys::set_umask(0o077);
    let bound = UnixListener::bind(&sock);
    sys::set_umask(old);
    let listener = bound.map_err(e)?;
    fs::set_permissions(&sock, fs::Permissions::from_mode(0o600)).map_err(e)?;
    listener.set_nonblocking(true).map_err(e)?;
    let wake = sys::wake_pipe(sys::SIGCHLD).map_err(e)?;
    let _ = fs::write(dir.join("host.pid"), format!("{}\n", std::process::id()));

    let mut h = Host { sessions: BTreeMap::new(), conns: HashMap::new(), next_sid: 1, next_cid: 1, stop: false };
    let mut pause_until: Option<Instant> = None;
    let mut burst_logged = false;
    while !h.stop {
        if matches!(pause_until, Some(t) if Instant::now() >= t) {
            pause_until = None;
        }
        let lfd = if pause_until.is_some() { -1 } else { listener.as_raw_fd() };
        let mut pf = vec![
            PollFd { fd: lfd, events: POLLIN, revents: 0 },
            PollFd { fd: wake, events: POLLIN, revents: 0 },
        ];
        let mut src = vec![Src::Listen, Src::Wake];
        for (sid, s) in &h.sessions {
            if s.master >= 0 {
                let ev = POLLIN | if s.inbuf.is_empty() { 0 } else { POLLOUT };
                pf.push(PollFd { fd: s.master, events: ev, revents: 0 });
                src.push(Src::Master(*sid));
            }
        }
        for (cid, c) in &h.conns {
            let full = matches!(c.sub, Some((sid, f)) if f & 2 != 0 && h.sessions.get(&sid).is_some_and(|s| s.inbuf.len() >= IN_CAP));
            let mut ev = 0;
            if !c.eof && !full {
                ev |= POLLIN;
            }
            if c.pending() > 0 {
                ev |= POLLOUT;
            }
            // nothing wanted: fd -1 so a hangup is not reported in a busy loop
            pf.push(PollFd { fd: if ev == 0 { -1 } else { c.s.as_raw_fd() }, events: ev, revents: 0 });
            src.push(Src::Conn(*cid));
        }
        let ms = match pause_until {
            Some(t) => t.saturating_duration_since(Instant::now()).as_millis() as i32 + 1,
            None => -1,
        };
        sys::poll_fds_timeout(&mut pf, ms).map_err(e)?;
        for (i, s) in src.iter().enumerate() {
            let re = pf[i].revents;
            if re == 0 {
                continue;
            }
            match *s {
                Src::Listen => loop {
                    match listener.accept() {
                        Ok((st, _)) => {
                            burst_logged = false;
                            if st.set_nonblocking(true).is_ok() {
                                let id = h.next_cid;
                                h.next_cid += 1;
                                h.conns.insert(id, Conn {
                                    s: st, rbuf: vec![], roff: 0, wbuf: vec![], woff: 0, sub: None,
                                    closing: false, dead: false, eof: false, lost: false,
                                });
                            }
                        }
                        Err(err) => match accept_action(&err) {
                            AcceptAct::Retry => {}
                            AcceptAct::Done => {
                                burst_logged = false;
                                break;
                            }
                            AcceptAct::Pause => {
                                if !burst_logged {
                                    eprintln!("sfx-host: accept failed: {err}; pausing accepts for {} ms", ACCEPT_PAUSE.as_millis());
                                    burst_logged = true;
                                }
                                pause_until = Some(Instant::now() + ACCEPT_PAUSE);
                                break;
                            }
                        },
                    }
                },
                Src::Wake => {
                    sys::drain(wake);
                    while let Some((pid, code)) = sys::reap() {
                        h.on_exit(pid, code);
                    }
                }
                Src::Master(sid) => h.master_io(sid, re),
                Src::Conn(cid) => h.conn_io(cid, re),
            }
        }
        h.settle();
        h.conns.retain(|_, c| !(c.dead || (c.closing && c.pending() == 0)));
    }
    // Stop first: kill children, remove the socket; then give queued output a short, nonblocking chance.
    for s in h.sessions.values() {
        if s.exit.is_none() {
            sys::kill_group(s.pid);
        }
    }
    let _ = fs::remove_file(&sock);
    let _ = fs::remove_file(dir.join("host.pid"));
    let end = Instant::now() + SHUTDOWN_FLUSH;
    loop {
        let ids: Vec<u64> = h.conns.iter().filter(|(_, c)| !c.dead && c.pending() > 0).map(|(i, _)| *i).collect();
        let left = end.saturating_duration_since(Instant::now());
        if ids.is_empty() || left.is_zero() {
            break;
        }
        let mut pf: Vec<PollFd> = ids.iter().map(|i| PollFd { fd: h.conns[i].s.as_raw_fd(), events: POLLOUT, revents: 0 }).collect();
        if sys::poll_fds_timeout(&mut pf, left.as_millis() as i32 + 1).is_err() {
            break;
        }
        for (i, id) in ids.iter().enumerate() {
            if pf[i].revents != 0 {
                flush(h.conns.get_mut(id).unwrap());
            }
        }
    }
    Ok(())
}

impl Host {
    fn emit(&mut self, sid: u32, data: &[u8]) {
        if let Some(s) = self.sessions.get_mut(&sid) {
            s.ring.extend(data);
            let extra = s.ring.len().saturating_sub(RING);
            s.ring.drain(..extra);
        }
        for c in self.conns.values_mut() {
            if matches!(c.sub, Some((i, f)) if i == sid && f & 1 != 0) {
                push(c, OUTPUT, data);
            }
        }
    }

    fn master_io(&mut self, sid: u32, re: i16) {
        let Some(s) = self.sessions.get_mut(&sid) else { return };
        if re & POLLOUT != 0 {
            while !s.inbuf.is_empty() {
                match sys::write_fd(s.master, s.inbuf.as_slices().0) {
                    Ok(n) if n > 0 => {
                        s.inbuf.drain(..n);
                    }
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                    _ => break, // EAGAIN: pty full, poll again
                }
            }
        }
        if re & (POLLIN | POLLHUP | POLLERR) != 0 {
            let mut buf = vec![0u8; 65536];
            match sys::read_fd(s.master, &mut buf) {
                Ok(n) if n > 0 => self.emit(sid, &buf[..n]),
                Err(e) if matches!(e.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) => {}
                _ => {
                    // EOF/EIO: slave side closed. Stop polling; exit is finalized by SIGCHLD.
                    sys::close_fd(s.master);
                    s.master = -1;
                    s.dropped |= !s.inbuf.is_empty();
                    s.inbuf.clear();
                }
            }
        }
    }

    fn on_exit(&mut self, pid: i32, code: i32) {
        let Some(sid) = self.sessions.iter().find(|(_, s)| s.pid == pid).map(|(i, _)| *i) else { return };
        // drain output the child wrote just before exiting
        loop {
            let m = self.sessions[&sid].master;
            if m < 0 {
                break;
            }
            let mut buf = vec![0u8; 65536];
            match sys::read_fd(m, &mut buf) {
                Ok(n) if n > 0 => self.emit(sid, &buf[..n]),
                _ => break,
            }
        }
        let s = self.sessions.get_mut(&sid).unwrap();
        if s.master >= 0 {
            sys::close_fd(s.master);
            s.master = -1;
        }
        s.exit = Some(code);
        s.dropped |= !s.inbuf.is_empty();
        s.inbuf.clear();
        let remove = s.kill_req;
        for c in self.conns.values_mut() {
            if matches!(c.sub, Some((i, f)) if i == sid && f & 1 != 0) {
                push(c, EXIT, &code.to_be_bytes());
                c.closing = true;
            }
        }
        if remove {
            self.sessions.remove(&sid);
        }
    }

    fn conn_io(&mut self, cid: u64, re: i16) {
        let mut frames = vec![];
        {
            let Some(c) = self.conns.get_mut(&cid) else { return };
            if c.dead {
                return;
            }
            if re & POLLOUT != 0 {
                flush(c);
            }
            if re & (POLLIN | POLLHUP | POLLERR) != 0 && !c.eof && !c.dead {
                let mut buf = [0u8; 65536];
                let mut got = 0;
                while got < READ_BUDGET {
                    match c.s.read(&mut buf) {
                        Ok(0) => {
                            c.eof = true;
                            break;
                        }
                        Ok(n) => {
                            got += n;
                            c.rbuf.extend_from_slice(&buf[..n]);
                            RBUF_HWM.fetch_max(c.rbuf.len() - c.roff, Relaxed);
                            loop {
                                match parse(&c.rbuf[c.roff..]) {
                                    Ok(Some((t, p, used))) => {
                                        c.roff += used;
                                        frames.push((t, p));
                                    }
                                    Ok(None) => break,
                                    Err(()) => {
                                        c.dead = true;
                                        DROPPED_PROTO.fetch_add(1, Relaxed);
                                        c.rbuf = Vec::new();
                                        c.roff = 0;
                                        break;
                                    }
                                }
                            }
                            if c.dead {
                                break;
                            }
                        }
                        Err(e) if e.kind() == io::ErrorKind::WouldBlock => break,
                        Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                        Err(_) => {
                            c.dead = true;
                            break;
                        }
                    }
                }
                if c.roff > 0 {
                    c.rbuf.drain(..c.roff); // compact once per turn
                    c.roff = 0;
                }
            }
        }
        for (t, p) in frames {
            if self.conns.get(&cid).is_none_or(|c| c.dead) {
                break;
            }
            self.handle(cid, t, &p);
        }
    }

    /// A writer that half-closed is ACKed once the pty has taken all its input, or told ERR if the session ended first.
    fn settle(&mut self) {
        for c in self.conns.values_mut() {
            if !c.eof || c.dead || c.closing {
                continue;
            }
            let Some((sid, f)) = c.sub.filter(|(_, f)| f & 2 != 0) else {
                c.dead = true;
                continue;
            };
            let _ = f;
            match self.sessions.get(&sid) {
                Some(s) if !c.lost && !s.dropped => {
                    if s.inbuf.is_empty() {
                        push(c, ACK, b"");
                        c.closing = true;
                    }
                }
                _ => {
                    push(c, ERR, b"session ended before input was delivered");
                    c.closing = true;
                }
            }
        }
    }

    fn reply(&mut self, cid: u64, t: u8, p: &[u8], close: bool) {
        if let Some(c) = self.conns.get_mut(&cid) {
            push(c, t, p);
            c.closing |= close;
        }
    }

    fn handle(&mut self, cid: u64, t: u8, p: &[u8]) {
        let id = || -> Option<u32> { Some(u32::from_be_bytes(p.get(..4)?.try_into().ok()?)) };
        match t {
            NEW => match self.spawn(p) {
                Ok(sid) => self.reply(cid, OK, sid.to_string().as_bytes(), true),
                Err(m) => self.reply(cid, ERR, m.as_bytes(), true),
            },
            LIST => {
                let mut o = String::new();
                for (sid, s) in &self.sessions {
                    let clean = |x: &str| x.replace(['\t', '\n'], " ");
                    o += &format!(
                        "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
                        sid, s.pid, s.cols, s.rows,
                        s.exit.is_none() as u8,
                        s.exit.map_or("-".to_string(), |c| c.to_string()),
                        clean(&s.cwd), clean(&s.cmd.join(" "))
                    );
                }
                self.reply(cid, OK, o.as_bytes(), true);
            }
            OPEN => {
                let (Some(sid), Some(&flags)) = (id(), p.get(4)) else {
                    return self.reply(cid, ERR, b"bad OPEN", true);
                };
                let Some(s) = self.sessions.get(&sid) else {
                    return self.reply(cid, ERR, b"no such session", true);
                };
                let replay: Vec<u8> = if flags & 1 != 0 { s.ring.iter().copied().collect() } else { vec![] };
                let exit = s.exit;
                let c = self.conns.get_mut(&cid).unwrap();
                c.sub = Some((sid, flags));
                for ch in replay.chunks(32768) {
                    push(c, OUTPUT, ch);
                }
                if flags & 1 != 0 {
                    if let Some(code) = exit {
                        push(c, EXIT, &code.to_be_bytes());
                        c.closing = true;
                    }
                }
            }
            INPUT | WINSZ => {
                let Some((sid, f)) = self.conns.get(&cid).and_then(|c| c.sub) else { return };
                let Some(s) = self.sessions.get_mut(&sid) else { return };
                if f & 2 == 0 {
                    return;
                }
                let alive = s.exit.is_none() && s.master >= 0;
                if t == INPUT {
                    if alive {
                        s.inbuf.extend(p); // never dropped: the poll loop stops reading this client at IN_CAP
                    } else if let Some(c) = self.conns.get_mut(&cid) {
                        c.lost = true;
                    }
                } else if p.len() == 4 && alive {
                    let (cols, rows) = (u16::from_be_bytes([p[0], p[1]]), u16::from_be_bytes([p[2], p[3]]));
                    if sys::set_winsize(s.master, cols, rows).is_ok() {
                        s.cols = cols;
                        s.rows = rows;
                    }
                }
            }
            KILL => {
                let Some(sid) = id() else { return self.reply(cid, ERR, b"bad KILL", true) };
                match self.sessions.get_mut(&sid) {
                    None => self.reply(cid, ERR, b"no such session", true),
                    Some(s) => {
                        if s.exit.is_none() {
                            s.kill_req = true;
                            sys::kill_group(s.pid);
                        } else {
                            self.sessions.remove(&sid);
                        }
                        self.reply(cid, OK, b"", true);
                    }
                }
            }
            STATS => {
                let (mut wb, mut rb) = (0, 0);
                for c in self.conns.values() {
                    wb += c.pending();
                    rb += c.rbuf.len() - c.roff;
                }
                let ib: usize = self.sessions.values().map(|s| s.inbuf.len()).sum();
                let o = format!(
                    "conns={}\nsessions={}\nwbuf_bytes={wb}\nrbuf_bytes={rb}\ninbuf_bytes={ib}\nrbuf_hwm={}\nwbuf_hwm={}\ndropped_slow={}\ndropped_proto={}\n",
                    self.conns.len(), self.sessions.len(),
                    RBUF_HWM.load(Relaxed), WBUF_HWM.load(Relaxed), DROPPED_SLOW.load(Relaxed), DROPPED_PROTO.load(Relaxed)
                );
                self.reply(cid, OK, o.as_bytes(), true);
            }
            SHUTDOWN => {
                self.stop = true;
                self.reply(cid, OK, b"", true);
            }
            _ => self.reply(cid, ERR, b"unknown frame type", true),
        }
    }

    fn spawn(&mut self, p: &[u8]) -> Result<u32, String> {
        if p.len() < 4 {
            return Err("bad NEW".into());
        }
        let (cols, rows) = (u16::from_be_bytes([p[0], p[1]]), u16::from_be_bytes([p[2], p[3]]));
        let parts: Vec<String> = String::from_utf8_lossy(&p[4..]).split('\0').map(String::from).collect();
        if parts.len() < 2 || parts[1].is_empty() {
            return Err("no command".into());
        }
        let (cwd, argv) = (parts[0].clone(), parts[1..].to_vec());
        let (master, slave_path) = sys::open_pty().map_err(|e| format!("openpty: {e}"))?;
        let r = (|| -> io::Result<i32> {
            let slave: File = OpenOptions::new().read(true).write(true).custom_flags(sys::O_NOCTTY).open(&slave_path)?;
            // macOS: TIOCSWINSZ on a master fails with ENOTTY until the slave is open
            sys::set_winsize(master, cols, rows)?;
            sys::set_nonblocking(master)?;
            let mut cmd = Command::new(&argv[0]);
            cmd.args(&argv[1..]).current_dir(&cwd);
            cmd.stdin(Stdio::from(slave.try_clone()?)).stdout(Stdio::from(slave.try_clone()?)).stderr(Stdio::from(slave));
            unsafe { cmd.pre_exec(sys::child_setup) };
            Ok(cmd.spawn()?.id() as i32) // Child dropped without wait: we reap via waitpid(-1)
        })();
        let pid = match r {
            Ok(p) => p,
            Err(e) => {
                sys::close_fd(master);
                return Err(format!("spawn {}: {e}", argv[0]));
            }
        };
        let sid = self.next_sid;
        self.next_sid += 1;
        self.sessions.insert(sid, Session {
            pid, master, cols, rows, cwd, cmd: argv, ring: VecDeque::new(), inbuf: VecDeque::new(), dropped: false, exit: None, kill_req: false,
        });
        Ok(sid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accept_backoff_decision() {
        let raw = |n| io::Error::from_raw_os_error(n);
        for n in [24, 23, if cfg!(target_os = "macos") { 55 } else { 105 }] {
            assert_eq!(accept_action(&raw(n)), AcceptAct::Pause, "errno {n}");
        }
        assert_eq!(accept_action(&io::Error::from(io::ErrorKind::WouldBlock)), AcceptAct::Done);
        assert_eq!(accept_action(&io::Error::from(io::ErrorKind::ConnectionAborted)), AcceptAct::Retry);
        assert_eq!(accept_action(&io::Error::from(io::ErrorKind::Interrupted)), AcceptAct::Retry);
    }
}
