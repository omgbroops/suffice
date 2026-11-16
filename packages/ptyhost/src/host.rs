//! The session host: single-threaded poll(2) loop over the listener, a SIGCHLD self-pipe,
//! every pty master and every client connection. It never reads or sets credentials;
//! children inherit the host's environment unchanged.
use crate::proto::*;
use crate::sys::{self, PollFd, POLLERR, POLLHUP, POLLIN, POLLOUT};
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::io::AsRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};

const RING: usize = 256 * 1024;
const OUT_CAP: usize = 8 << 20; // slow client is dropped beyond this
const IN_CAP: usize = 4 << 20;

struct Session {
    pid: i32,
    master: i32, // -1 once closed
    cols: u16,
    rows: u16,
    cwd: String,
    cmd: Vec<String>,
    ring: VecDeque<u8>,
    inbuf: Vec<u8>,
    exit: Option<i32>,
    kill_req: bool,
}
struct Conn {
    s: UnixStream,
    rbuf: Vec<u8>,
    wbuf: Vec<u8>,
    sub: Option<(u32, u8)>,
    closing: bool,
    dead: bool,
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
    c.wbuf.extend_from_slice(&encode(t, p));
    if c.wbuf.len() > OUT_CAP {
        c.dead = true;
    }
}

pub fn serve(dir: &Path) -> Result<(), String> {
    let e = |x: io::Error| x.to_string();
    if dir.exists() {
        let m = fs::metadata(dir).map_err(e)?;
        if m.mode() & 0o077 != 0 {
            return Err(format!("{}: mode {:o} is group/world accessible; chmod 700 it", dir.display(), m.mode() & 0o777));
        }
    } else {
        DirBuilder::new().recursive(true).mode(0o700).create(dir).map_err(e)?;
    }
    let sock = dir.join("host.sock");
    if UnixStream::connect(&sock).is_ok() {
        return Err("a host is already running in this dir".into());
    }
    let _ = fs::remove_file(&sock);
    let listener = UnixListener::bind(&sock).map_err(e)?;
    fs::set_permissions(&sock, fs::Permissions::from_mode(0o600)).map_err(e)?; // dir is 0700, so no window
    listener.set_nonblocking(true).map_err(e)?;
    let wake = sys::wake_pipe(sys::SIGCHLD).map_err(e)?;
    let _ = fs::write(dir.join("host.pid"), format!("{}\n", std::process::id()));

    let mut h = Host { sessions: BTreeMap::new(), conns: HashMap::new(), next_sid: 1, next_cid: 1, stop: false };
    while !h.stop {
        let mut pf = vec![
            PollFd { fd: listener.as_raw_fd(), events: POLLIN, revents: 0 },
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
            let ev = POLLIN | if c.wbuf.is_empty() { 0 } else { POLLOUT };
            pf.push(PollFd { fd: c.s.as_raw_fd(), events: ev, revents: 0 });
            src.push(Src::Conn(*cid));
        }
        sys::poll_fds(&mut pf).map_err(e)?;
        for (i, s) in src.iter().enumerate() {
            let re = pf[i].revents;
            if re == 0 {
                continue;
            }
            match *s {
                Src::Listen => loop {
                    match listener.accept() {
                        Ok((st, _)) => {
                            if st.set_nonblocking(true).is_ok() {
                                let id = h.next_cid;
                                h.next_cid += 1;
                                h.conns.insert(id, Conn { s: st, rbuf: vec![], wbuf: vec![], sub: None, closing: false, dead: false });
                            }
                        }
                        Err(_) => break,
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
        h.conns.retain(|_, c| !(c.dead || (c.closing && c.wbuf.is_empty())));
    }
    for c in h.conns.values_mut() {
        let _ = c.s.set_nonblocking(false);
        let _ = c.s.write_all(&c.wbuf);
    }
    for s in h.sessions.values() {
        if s.exit.is_none() {
            sys::kill_group(s.pid);
        }
    }
    let _ = fs::remove_file(&sock);
    let _ = fs::remove_file(dir.join("host.pid"));
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
        if re & POLLOUT != 0 && !s.inbuf.is_empty() {
            if let Ok(n) = sys::write_fd(s.master, &s.inbuf) {
                s.inbuf.drain(..n);
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
            if re & POLLOUT != 0 {
                while !c.wbuf.is_empty() {
                    match c.s.write(&c.wbuf) {
                        Ok(n) => { c.wbuf.drain(..n); }
                        Err(e) if e.kind() == io::ErrorKind::WouldBlock => break,
                        Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                        Err(_) => { c.dead = true; break; }
                    }
                }
            }
            if re & (POLLIN | POLLHUP | POLLERR) != 0 {
                let mut buf = vec![0u8; 65536];
                loop {
                    match c.s.read(&mut buf) {
                        Ok(0) => { c.dead = true; break; }
                        Ok(n) => c.rbuf.extend_from_slice(&buf[..n]),
                        Err(e) if e.kind() == io::ErrorKind::WouldBlock => break,
                        Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                        Err(_) => { c.dead = true; break; }
                    }
                }
                loop {
                    match parse(&c.rbuf) {
                        Ok(Some((t, p, n))) => { c.rbuf.drain(..n); frames.push((t, p)); }
                        Ok(None) => break,
                        Err(()) => { c.dead = true; c.rbuf.clear(); break; }
                    }
                }
            }
        }
        for (t, p) in frames {
            self.handle(cid, t, &p);
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
                if f & 2 == 0 || s.exit.is_some() {
                    return;
                }
                if t == INPUT {
                    if s.inbuf.len() + p.len() <= IN_CAP {
                        s.inbuf.extend_from_slice(p);
                    }
                } else if p.len() == 4 && s.master >= 0 {
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
            pid, master, cols, rows, cwd, cmd: argv, ring: VecDeque::new(), inbuf: vec![], exit: None, kill_req: false,
        });
        Ok(sid)
    }
}
