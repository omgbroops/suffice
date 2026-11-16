use crate::proto::*;
use crate::sys::{self, PollFd, POLLIN};
use std::io::{self, Read, Write};
use std::net::Shutdown;
use std::os::unix::io::AsRawFd;
use std::os::unix::net::UnixStream;
use std::path::Path;

fn connect(dir: &Path) -> Result<UnixStream, String> {
    UnixStream::connect(dir.join("host.sock")).map_err(|e| format!("cannot connect to host in {}: {e}", dir.display()))
}
fn id_bytes(id: &str) -> Result<[u8; 4], String> {
    id.parse::<u32>().map(|n| n.to_be_bytes()).map_err(|_| format!("bad session id {id:?}"))
}
fn open(dir: &Path, id: &str, flags: u8) -> Result<UnixStream, String> {
    let mut s = connect(dir)?;
    let mut p = id_bytes(id)?.to_vec();
    p.push(flags);
    write_frame(&mut s, OPEN, &p).map_err(|e| e.to_string())?;
    Ok(s)
}
/// One request, one reply (OK text or ERR).
fn call(dir: &Path, t: u8, p: &[u8]) -> Result<Vec<u8>, String> {
    let mut s = connect(dir)?;
    write_frame(&mut s, t, p).map_err(|e| e.to_string())?;
    match read_frame(&mut s).map_err(|e| e.to_string())? {
        Some((OK, b)) => Ok(b),
        Some((ERR, b)) => Err(String::from_utf8_lossy(&b).into()),
        _ => Err("host closed the connection without a reply".into()),
    }
}
/// Half-close, then wait for the host's ACK: every INPUT byte is in the pty. ERR/EXIT/EOF = failure.
fn finish(mut s: UnixStream) -> Result<(), String> {
    let _ = s.shutdown(Shutdown::Write);
    loop {
        match read_frame(&mut s).map_err(|e| e.to_string())? {
            Some((ACK, _)) => return Ok(()),
            Some((ERR, b)) => return Err(String::from_utf8_lossy(&b).into()),
            Some((EXIT, _)) => return Err("session exited before input was delivered".into()),
            Some(_) => {}
            None => return Err("host closed the connection without acknowledging".into()),
        }
    }
}

pub fn new(dir: &Path, cwd: &str, cols: u16, rows: u16, cmd: &[String]) -> Result<(), String> {
    let cwd = std::fs::canonicalize(cwd).map_err(|e| format!("cwd {cwd}: {e}"))?;
    let mut p = Vec::new();
    p.extend_from_slice(&cols.to_be_bytes());
    p.extend_from_slice(&rows.to_be_bytes());
    p.extend_from_slice(cwd.to_string_lossy().as_bytes());
    for a in cmd {
        p.push(0);
        p.extend_from_slice(a.as_bytes());
    }
    println!("{}", String::from_utf8_lossy(&call(dir, NEW, &p)?));
    Ok(())
}
pub fn list(dir: &Path) -> Result<(), String> {
    print!("{}", String::from_utf8_lossy(&call(dir, LIST, &[])?));
    Ok(())
}
pub fn stats(dir: &Path) -> Result<(), String> {
    print!("{}", String::from_utf8_lossy(&call(dir, STATS, &[])?));
    Ok(())
}
pub fn simple(dir: &Path, t: u8, id: Option<&str>) -> Result<(), String> {
    let p = match id { Some(i) => id_bytes(i)?.to_vec(), None => vec![] };
    call(dir, t, &p).map(|_| ())
}
pub fn resize(dir: &Path, id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let mut s = open(dir, id, 2)?;
    let mut p = cols.to_be_bytes().to_vec();
    p.extend_from_slice(&rows.to_be_bytes());
    let _ = write_frame(&mut s, WINSZ, &p);
    finish(s)
}
pub fn send(dir: &Path, id: &str) -> Result<(), String> {
    let mut s = open(dir, id, 2)?;
    let mut buf = vec![0u8; 32768];
    let mut stdin = io::stdin().lock();
    loop {
        match stdin.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if write_frame(&mut s, INPUT, &buf[..n]).is_err() {
                    break; // host replied ERR and closed; finish() reports it
                }
            }
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    finish(s)
}

/// Copies OUTPUT frames to stdout until EXIT/EOF. Returns the session exit code if seen.
fn pump_out(s: &mut UnixStream) -> Result<Option<i32>, String> {
    let mut out = io::stdout().lock();
    loop {
        match read_frame(s).map_err(|e| e.to_string())? {
            Some((OUTPUT, b)) => {
                if out.write_all(&b).and_then(|_| out.flush()).is_err() {
                    return Ok(None); // reader went away
                }
            }
            Some((EXIT, b)) if b.len() == 4 => return Ok(Some(i32::from_be_bytes([b[0], b[1], b[2], b[3]]))),
            Some((ERR, b)) => return Err(String::from_utf8_lossy(&b).into()),
            Some(_) => {}
            None => return Ok(None),
        }
    }
}
pub fn stream(dir: &Path, id: &str) -> Result<(), String> {
    let mut s = open(dir, id, 1)?;
    pump_out(&mut s).map(|_| ())
}

struct RawGuard(Option<sys::Termios>);
impl Drop for RawGuard {
    fn drop(&mut self) {
        if let Some(t) = &self.0 {
            sys::restore(0, t);
        }
    }
}

/// Ctrl-\ then d detaches; Ctrl-\ Ctrl-\ sends one literal Ctrl-\; Ctrl-\ x sends both bytes
/// (also when x arrives in a later read, since `pending` carries over).
/// Returns true on detach. Bytes after the `d` are discarded only because we are detaching.
fn filter_input(pending: &mut bool, data: &[u8], out: &mut Vec<u8>) -> bool {
    for &b in data {
        if *pending {
            *pending = false;
            match b {
                b'd' => return true,
                0x1c => out.push(0x1c),
                _ => out.extend_from_slice(&[0x1c, b]),
            }
        } else if b == 0x1c {
            *pending = true;
        } else {
            out.push(b);
        }
    }
    false
}

/// On stdin EOF a lone pending Ctrl-\ is real input: forward it.
fn flush_pending(pending: &mut bool, out: &mut Vec<u8>) {
    if std::mem::take(pending) {
        out.push(0x1c);
    }
}

pub fn attach(dir: &Path, id: &str) -> Result<(), String> {
    let tty = sys::is_tty(0);
    let wake = sys::wake_pipe(sys::SIGWINCH).map_err(|e| e.to_string())?;
    sys::catch_term();
    let mut s = connect(dir)?;
    // raw mode before OPEN: once the replay arrives the terminal is already raw
    let _guard = RawGuard(if tty { Some(sys::make_raw(0).map_err(|e| e.to_string())?) } else { None });
    let mut p = id_bytes(id)?.to_vec();
    p.push(3);
    write_frame(&mut s, OPEN, &p).map_err(|e| e.to_string())?;
    let send_size = |s: &mut UnixStream| {
        if let Some((c, r)) = sys::get_winsize(0) {
            let mut p = c.to_be_bytes().to_vec();
            p.extend_from_slice(&r.to_be_bytes());
            let _ = write_frame(s, WINSZ, &p);
        }
    };
    send_size(&mut s);
    let (mut pending, mut buf) = (false, vec![0u8; 8192]);
    let mut inbuf: Vec<u8> = Vec::new();
    let result: Result<String, String> = 'outer: loop {
        let mut pf = [
            PollFd { fd: 0, events: POLLIN, revents: 0 },
            PollFd { fd: s.as_raw_fd(), events: POLLIN, revents: 0 },
            PollFd { fd: wake, events: POLLIN, revents: 0 },
        ];
        if let Err(e) = sys::poll_fds(&mut pf) {
            break Err(e.to_string());
        }
        if pf[2].revents != 0 {
            sys::drain(wake);
            if sys::term_signal() != 0 {
                break Ok("terminated".into());
            }
            send_size(&mut s);
        }
        if pf[0].revents != 0 {
            match sys::read_fd(0, &mut buf) {
                Ok(0) => {
                    inbuf.clear();
                    flush_pending(&mut pending, &mut inbuf);
                    if !inbuf.is_empty() {
                        let _ = write_frame(&mut s, INPUT, &inbuf);
                    }
                    break Ok("stdin closed".into());
                }
                Ok(n) => {
                    inbuf.clear();
                    let detach = filter_input(&mut pending, &buf[..n], &mut inbuf);
                    if !inbuf.is_empty() && write_frame(&mut s, INPUT, &inbuf).is_err() {
                        break Err("host connection lost".into());
                    }
                    if detach {
                        break Ok("detached".into());
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                Err(e) => break Err(e.to_string()),
            }
        }
        if pf[1].revents != 0 {
            match read_frame(&mut s) {
                Ok(Some((OUTPUT, b))) => {
                    if sys::write_all_fd(1, &b).is_err() {
                        break 'outer Err("stdout closed".into());
                    }
                }
                Ok(Some((EXIT, b))) if b.len() == 4 => {
                    break Ok(format!("session exited with code {}", i32::from_be_bytes([b[0], b[1], b[2], b[3]])))
                }
                Ok(Some((ERR, b))) => break Err(String::from_utf8_lossy(&b).into()),
                Ok(Some(_)) => {}
                Ok(None) => break Ok("host closed the connection".into()),
                Err(e) => break Err(e.to_string()),
            }
        }
    };
    drop(_guard);
    match result {
        Ok(m) => {
            eprintln!("\r\n[{m}]");
            let sig = sys::term_signal();
            if sig != 0 {
                std::process::exit(128 + sig);
            }
            Ok(())
        }
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn run(chunks: &[&[u8]]) -> (Vec<u8>, bool, bool) {
        let (mut p, mut out) = (false, vec![]);
        for c in chunks {
            if filter_input(&mut p, c, &mut out) {
                return (out, true, p);
            }
        }
        (out, false, p)
    }
    #[test]
    fn chord_cases() {
        assert_eq!(run(&[b"adz"]), (b"a".to_vec(), true, false));
        assert_eq!(run(&[b""]), (vec![0x1c], false, false));
        assert_eq!(run(&[b"x"]), (vec![0x1c, b'x'], false, false));
        assert_eq!(run(&[b""]), (vec![], false, true));
        let (mut p, mut o) = (true, vec![]);
        flush_pending(&mut p, &mut o);
        assert_eq!((o, p), (vec![0x1c], false));
    }
    #[test]
    fn chord_splits_match_unsplit() {
        let inputs: [&[u8]; 5] = [b"adz", b"xq", b"d", b"ab", b"dd"];
        for inp in inputs {
            let whole = run(&[inp]);
            for i in 0..=inp.len() {
                assert_eq!(run(&[&inp[..i], &inp[i..]]), whole, "split {i} of {inp:?}");
                for j in i..=inp.len() {
                    assert_eq!(run(&[&inp[..i], &inp[i..j], &inp[j..]]), whole, "splits {i},{j} of {inp:?}");
                }
            }
        }
    }
}
