//! Direct libc FFI (no crates). Constants that differ per OS are cfg-gated.
use std::ffi::CStr;
use std::io;
use std::os::raw::{c_char, c_int, c_ulong, c_void};
use std::sync::atomic::{AtomicI32, Ordering};

#[cfg(target_os = "macos")]
mod k {
    use std::os::raw::{c_int, c_ulong};
    pub const TIOCSWINSZ: c_ulong = 0x8008_7467;
    pub const TIOCGWINSZ: c_ulong = 0x4008_7468;
    pub const TIOCSCTTY: c_ulong = 0x2000_7461;
    pub const O_NONBLOCK: c_int = 0x4;
    pub const O_NOCTTY: c_int = 0x2_0000;
    pub const SIGCHLD: c_int = 20;
    pub type Nfds = std::os::raw::c_uint;
}
#[cfg(not(target_os = "macos"))]
mod k {
    use std::os::raw::{c_int, c_ulong};
    pub const TIOCSWINSZ: c_ulong = 0x5414;
    pub const TIOCGWINSZ: c_ulong = 0x5413;
    pub const TIOCSCTTY: c_ulong = 0x540E;
    pub const O_NONBLOCK: c_int = 0x800;
    pub const O_NOCTTY: c_int = 0x100;
    pub const SIGCHLD: c_int = 17;
    pub type Nfds = std::os::raw::c_ulong;
}
pub use k::SIGCHLD;
pub const SIGWINCH: c_int = 28;
pub const SIGKILL: c_int = 9;
pub const POLLIN: i16 = 1;
pub const POLLOUT: i16 = 4;
pub const POLLERR: i16 = 8;
pub const POLLHUP: i16 = 0x10;
const O_RDWR: c_int = 2;
const F_GETFL: c_int = 3;
const F_SETFL: c_int = 4;
const F_SETFD: c_int = 2;
const FD_CLOEXEC: c_int = 1;

#[repr(C)]
pub struct PollFd {
    pub fd: c_int,
    pub events: i16,
    pub revents: i16,
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
struct Winsize {
    row: u16,
    col: u16,
    x: u16,
    y: u16,
}
/// Opaque, over-sized, 8-aligned buffer: only ever passed to tcgetattr/cfmakeraw/tcsetattr
/// (real struct termios is 72 bytes on macOS, 60 on Linux), so no layout is assumed.
#[repr(C, align(8))]
pub struct Termios([u8; 256]);

extern "C" {
    fn posix_openpt(flags: c_int) -> c_int;
    fn grantpt(fd: c_int) -> c_int;
    fn unlockpt(fd: c_int) -> c_int;
    fn ptsname(fd: c_int) -> *mut c_char;
    fn ioctl(fd: c_int, req: c_ulong, ...) -> c_int;
    fn fcntl(fd: c_int, cmd: c_int, ...) -> c_int;
    fn setsid() -> c_int;
    fn kill(pid: c_int, sig: c_int) -> c_int;
    fn waitpid(pid: c_int, status: *mut c_int, opts: c_int) -> c_int;
    fn poll(fds: *mut PollFd, n: k::Nfds, timeout: c_int) -> c_int;
    fn pipe(fds: *mut c_int) -> c_int;
    fn read(fd: c_int, buf: *mut c_void, n: usize) -> isize;
    fn write(fd: c_int, buf: *const c_void, n: usize) -> isize;
    fn close(fd: c_int) -> c_int;
    fn signal(sig: c_int, handler: usize) -> usize;
    fn isatty(fd: c_int) -> c_int;
    fn tcgetattr(fd: c_int, t: *mut Termios) -> c_int;
    fn tcsetattr(fd: c_int, act: c_int, t: *const Termios) -> c_int;
    fn cfmakeraw(t: *mut Termios);
}

fn cvt(r: c_int) -> io::Result<c_int> {
    if r < 0 { Err(io::Error::last_os_error()) } else { Ok(r) }
}

/// Returns (master fd, slave path). Master is close-on-exec.
pub fn open_pty() -> io::Result<(i32, String)> {
    unsafe {
        let m = cvt(posix_openpt(O_RDWR | k::O_NOCTTY))?;
        let r = (|| {
            cvt(fcntl(m, F_SETFD, FD_CLOEXEC))?;
            cvt(grantpt(m))?;
            cvt(unlockpt(m))?;
            let p = ptsname(m);
            if p.is_null() {
                return Err(io::Error::last_os_error());
            }
            Ok(CStr::from_ptr(p).to_string_lossy().into_owned())
        })();
        match r {
            Ok(s) => Ok((m, s)),
            Err(e) => {
                close(m);
                Err(e)
            }
        }
    }
}
pub const O_NOCTTY: i32 = k::O_NOCTTY;

pub fn set_winsize(fd: i32, cols: u16, rows: u16) -> io::Result<()> {
    let w = Winsize { row: rows, col: cols, x: 0, y: 0 };
    unsafe { cvt(ioctl(fd, k::TIOCSWINSZ, &w as *const Winsize)).map(|_| ()) }
}
/// (cols, rows) of a terminal fd.
pub fn get_winsize(fd: i32) -> Option<(u16, u16)> {
    let mut w = Winsize::default();
    let r = unsafe { ioctl(fd, k::TIOCGWINSZ, &mut w as *mut Winsize) };
    if r == 0 && w.col > 0 && w.row > 0 { Some((w.col, w.row)) } else { None }
}
pub fn set_nonblocking(fd: i32) -> io::Result<()> {
    unsafe {
        let f = cvt(fcntl(fd, F_GETFL))?;
        cvt(fcntl(fd, F_SETFL, f | k::O_NONBLOCK)).map(|_| ())
    }
}
/// For Command::pre_exec in the child: new session + controlling tty on fd 0. Async-signal-safe.
pub fn child_setup() -> io::Result<()> {
    unsafe {
        cvt(setsid())?;
        cvt(ioctl(0, k::TIOCSCTTY, 0 as c_int)).map(|_| ())
    }
}
pub fn kill_group(pid: i32) {
    unsafe { kill(-pid, SIGKILL) };
}
/// Reaps one exited child: Some((pid, exit code or 128+signal)); None when none are ready.
pub fn reap() -> Option<(i32, i32)> {
    let mut st: c_int = 0;
    let p = unsafe { waitpid(-1, &mut st, 1) };
    if p <= 0 {
        return None;
    }
    let sig = st & 0x7f;
    Some((p, if sig == 0 { (st >> 8) & 0xff } else { 128 + sig }))
}
pub fn poll_fds(fds: &mut [PollFd]) -> io::Result<usize> {
    let r = unsafe { poll(fds.as_mut_ptr(), fds.len() as k::Nfds, -1) };
    if r < 0 {
        let e = io::Error::last_os_error();
        if e.kind() == io::ErrorKind::Interrupted { return Ok(0); }
        return Err(e);
    }
    Ok(r as usize)
}
pub fn read_fd(fd: i32, buf: &mut [u8]) -> io::Result<usize> {
    let r = unsafe { read(fd, buf.as_mut_ptr() as *mut c_void, buf.len()) };
    if r < 0 { Err(io::Error::last_os_error()) } else { Ok(r as usize) }
}
pub fn write_fd(fd: i32, buf: &[u8]) -> io::Result<usize> {
    let r = unsafe { write(fd, buf.as_ptr() as *const c_void, buf.len()) };
    if r < 0 { Err(io::Error::last_os_error()) } else { Ok(r as usize) }
}
pub fn write_all_fd(fd: i32, mut b: &[u8]) -> io::Result<()> {
    while !b.is_empty() {
        match write_fd(fd, b) {
            Ok(n) => b = &b[n..],
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
    Ok(())
}
pub fn close_fd(fd: i32) {
    unsafe { close(fd) };
}

static WAKE: AtomicI32 = AtomicI32::new(-1);
extern "C" fn on_signal(_: c_int) {
    let fd = WAKE.load(Ordering::Relaxed);
    if fd >= 0 {
        let _ = write_fd(fd, b"x");
    }
}
/// Self-pipe: `sig` writes a byte to the returned read end (nonblocking). One per process.
pub fn wake_pipe(sig: c_int) -> io::Result<i32> {
    let mut p = [0 as c_int; 2];
    unsafe {
        cvt(pipe(p.as_mut_ptr()))?;
        for fd in p {
            set_nonblocking(fd)?;
            cvt(fcntl(fd, F_SETFD, FD_CLOEXEC))?;
        }
        WAKE.store(p[1], Ordering::Relaxed);
        signal(sig, on_signal as *const () as usize);
    }
    Ok(p[0])
}
pub fn drain(fd: i32) {
    let mut b = [0u8; 64];
    while matches!(read_fd(fd, &mut b), Ok(n) if n > 0) {}
}

pub fn is_tty(fd: i32) -> bool {
    unsafe { isatty(fd) == 1 }
}
/// Puts fd into raw mode; returns the saved state for `restore`.
pub fn make_raw(fd: i32) -> io::Result<Termios> {
    let mut saved = Termios([0; 256]);
    let mut raw = Termios([0; 256]);
    unsafe {
        cvt(tcgetattr(fd, &mut saved))?;
        cvt(tcgetattr(fd, &mut raw))?;
        cfmakeraw(&mut raw);
        cvt(tcsetattr(fd, 1, &raw))?; // TCSADRAIN: keep pending input
    }
    Ok(saved)
}
pub fn restore(fd: i32, t: &Termios) {
    unsafe { tcsetattr(fd, 1, t) };
}
