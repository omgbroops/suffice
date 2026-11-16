//! macOS supplies process sessions and process-identity-bound signals. A separate
//! guardian owns one liveness pipe to the host. Each managed session retains an
//! anchor in a separate process group so its SID cannot be recycled during cleanup.
use std::{
    collections::HashMap,
    env, fs,
    io::{self, BufRead, Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd, OwnedFd},
        unix::{
            fs::PermissionsExt,
            net::{UnixListener, UnixStream},
            process::CommandExt,
        },
    },
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};
const GUARD: &str = "--suffice-process-guardian";
const ANCHOR: &str = "--suffice-session-anchor";
const EXEC: &str = "--suffice-owned-exec";
const SOCKET: &str = "SUFFICE_OWNED_SOCKET";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Identity {
    pid: i32,
    sec: u64,
    usec: u64,
}
fn info(pid: i32) -> Option<libc::proc_bsdinfo> {
    // SAFETY: fixed-size kernel output buffer. Short/missing results are rejected.
    let mut b = unsafe { std::mem::zeroed::<libc::proc_bsdinfo>() };
    let size = size_of_val(&b) as i32;
    let n = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDTBSDINFO,
            0,
            (&mut b as *mut libc::proc_bsdinfo).cast(),
            size,
        )
    };
    (n == size && b.pbi_uid == unsafe { libc::geteuid() } && b.pbi_status != 5).then_some(b)
}
fn identity(pid: i32) -> Option<Identity> {
    let b = info(pid)?;
    Some(Identity {
        pid,
        sec: b.pbi_start_tvsec,
        usec: b.pbi_start_tvusec,
    })
}
fn sid(pid: i32) -> i32 {
    unsafe { libc::getsid(pid) }
}

#[link(name = "proc")]
unsafe extern "C" {
    fn proc_signal_with_audittoken(token: *mut [u32; 8], signal: i32) -> i32;
}
unsafe extern "C" {
    static mach_task_self_: u32;
    fn task_name_for_pid(task: u32, pid: i32, port: *mut u32) -> i32;
    fn task_info(task: u32, flavor: i32, info: *mut u32, count: *mut u32) -> i32;
    fn mach_port_deallocate(task: u32, name: u32) -> i32;
}
fn kill_member(expected: Identity, session: i32) -> io::Result<()> {
    // Bind the signal to the Mach audit token (PID + pidversion). Revalidate
    // start time and session *after* obtaining the token to close PID-reuse races.
    let mut task = 0;
    let mut token = [0u32; 8];
    let mut count = 8;
    unsafe {
        let own = mach_task_self_;
        if task_name_for_pid(own, expected.pid, &mut task) != 0 {
            if identity(expected.pid) != Some(expected) {
                return Ok(());
            }
            return Err(io::Error::other(
                "cannot acquire process identity for cleanup",
            ));
        }
        let result = task_info(task, 15, token.as_mut_ptr(), &mut count); // TASK_AUDIT_TOKEN
        mach_port_deallocate(own, task);
        if result != 0 || count != 8 {
            return Err(io::Error::other("cannot obtain process audit token"));
        }
        if identity(expected.pid) != Some(expected) || sid(expected.pid) != session {
            return Ok(());
        }
        let code = proc_signal_with_audittoken(&mut token, libc::SIGKILL);
        if code != 0 && code != libc::ESRCH {
            return Err(io::Error::from_raw_os_error(code));
        }
    }
    Ok(())
}
fn pids() -> io::Result<Vec<i32>> {
    let mut capacity = 256;
    loop {
        let mut pids = vec![0i32; capacity];
        let size = (capacity * size_of::<i32>()) as i32;
        let n = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), size) };
        if n <= 0 {
            return Err(io::Error::last_os_error());
        }
        if (n as usize) < capacity {
            pids.truncate(n as usize);
            return Ok(pids);
        }
        capacity *= 2;
        if capacity > 1_048_576 {
            return Err(io::Error::other("process table exceeds system limit"));
        }
    }
}
fn peer_pid(stream: &UnixStream) -> io::Result<i32> {
    let mut pid = 0i32;
    let mut len = size_of_val(&pid) as libc::socklen_t;
    let result = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_LOCAL,
            libc::LOCAL_PEERPID,
            (&mut pid as *mut i32).cast(),
            &mut len,
        )
    };
    if result == 0 && len == 4 && pid > 1 {
        Ok(pid)
    } else {
        Err(io::Error::last_os_error())
    }
}
// kqueue sleeps until the host pipe closes, a connection arrives or a
// registered process exits. An idle app needs no periodic guardian wakeups.
struct Events(OwnedFd);
impl Events {
    fn new() -> io::Result<Self> {
        let fd = unsafe { libc::kqueue() };
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(unsafe { OwnedFd::from_raw_fd(fd) }))
    }
    fn watch(&self, ident: usize, filter: i16) -> io::Result<()> {
        let process = filter == libc::EVFILT_PROC;
        let change = libc::kevent {
            ident,
            filter,
            flags: libc::EV_ADD | if process { libc::EV_ONESHOT } else { 0 },
            fflags: if process { libc::NOTE_EXIT } else { 0 },
            data: 0,
            udata: std::ptr::null_mut(),
        };
        let n = unsafe {
            libc::kevent(
                self.0.as_raw_fd(),
                &change,
                1,
                std::ptr::null_mut(),
                0,
                std::ptr::null(),
            )
        };
        if n < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
    fn next(&self, timeout: Option<Duration>) -> io::Result<Option<(usize, i16)>> {
        let ts = timeout.map(|t| libc::timespec {
            tv_sec: t.as_secs() as _,
            tv_nsec: t.subsec_nanos().into(),
        });
        let mut event = unsafe { std::mem::zeroed::<libc::kevent>() };
        loop {
            let n = unsafe {
                libc::kevent(
                    self.0.as_raw_fd(),
                    std::ptr::null(),
                    0,
                    &mut event,
                    1,
                    ts.as_ref().map_or(std::ptr::null(), |timeout| timeout),
                )
            };
            if n > 0 {
                return Ok(Some((event.ident, event.filter)));
            }
            if n == 0 {
                return Ok(None);
            }
            let e = io::Error::last_os_error();
            if e.kind() != io::ErrorKind::Interrupted {
                return Err(e);
            }
        }
    }
}
struct Session {
    leader: Identity,
    anchor: Identity,
    channel: UnixStream,
    empty_scans: u8,
}
fn enroll(
    mut channel: UnixStream,
    root: Identity,
    events: &Events,
    sessions: &mut HashMap<i32, Session>,
) -> io::Result<()> {
    // The kernel identifies the connecting anchor. Its parent is the gated exec
    // wrapper, already a session leader. Only an existing owned session may spawn one.
    let anchor = identity(peer_pid(&channel)?).ok_or_else(|| io::Error::other("missing anchor"))?;
    let leader = identity(
        info(anchor.pid)
            .ok_or_else(|| io::Error::other("anchor exited"))?
            .pbi_ppid as i32,
    )
    .ok_or_else(|| io::Error::other("missing session leader"))?;
    let parent = info(leader.pid)
        .ok_or_else(|| io::Error::other("leader exited"))?
        .pbi_ppid as i32;
    let authorized = leader == root
        || sessions
            .get(&sid(parent))
            .is_some_and(|s| identity(s.anchor.pid) == Some(s.anchor));
    if !authorized
        || sid(leader.pid) != leader.pid
        || sid(anchor.pid) != leader.pid
        || sessions.contains_key(&leader.pid)
    {
        return Err(io::Error::other("unrecognized process session"));
    }
    events.watch(leader.pid as usize, libc::EVFILT_PROC)?;
    channel.write_all(b"Y")?;
    sessions.insert(
        leader.pid,
        Session {
            leader,
            anchor,
            channel,
            empty_scans: 0,
        },
    );
    Ok(())
}
fn signal_snapshot(
    members: &[(Identity, i32)],
    mut signal: impl FnMut(Identity, i32) -> io::Result<()>,
) -> io::Result<()> {
    let mut failures = Vec::new();
    for &(id, sid) in members {
        if let Err(e) = signal(id, sid) {
            failures.push(format!("pid {} (session {}): {}", id.pid, sid, e));
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(io::Error::other(failures.join(", ")))
    }
}
fn sweep(sessions: &mut HashMap<i32, Session>, stopping: bool) -> io::Result<()> {
    if !stopping
        && sessions
            .values()
            .all(|s| identity(s.leader.pid) == Some(s.leader))
    {
        return Ok(());
    }
    let mut occupied = std::collections::HashSet::new();
    let mut members = Vec::new();
    for pid in pids()? {
        let session = sid(pid);
        let Some(record) = sessions.get(&session) else {
            continue;
        };
        if pid == record.anchor.pid {
            continue;
        }
        let Some(id) = identity(pid) else { continue };
        // An anchor death during normal operation is unusual (e.g. explicit
        // external kill). An independently surviving original leader also pins SID.
        if identity(record.anchor.pid) != Some(record.anchor)
            && identity(record.leader.pid) != Some(record.leader)
        {
            continue;
        }
        occupied.insert(session);
        if stopping {
            members.push((id, session));
        }
    }
    sessions.retain(|session, record| {
        if occupied.contains(session) {
            record.empty_scans = 0;
            true
        } else if record.empty_scans == 0 {
            record.empty_scans = 1;
            true
        } else {
            let _ = record.channel.shutdown(std::net::Shutdown::Both);
            false
        }
    });
    signal_snapshot(&members, kill_member)
}
struct RemoveDirectory(PathBuf);
impl Drop for RemoveDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_file(self.0.join("s"));
        let _ = fs::remove_dir(&self.0);
    }
}
fn guardian(socket: &Path) -> io::Result<()> {
    let listener = UnixListener::bind(socket)?;
    let _dir = RemoveDirectory(
        socket
            .parent()
            .ok_or_else(|| io::Error::other("socket parent missing"))?
            .to_owned(),
    );
    listener.set_nonblocking(true)?;
    io::stdout().write_all(b"Y")?;
    io::stdout().flush()?;
    let mut line = String::new();
    io::stdin().lock().read_line(&mut line)?;
    let pid = line
        .trim()
        .parse()
        .map_err(|_| io::Error::other("host exited before bridge startup"))?;
    let root = identity(pid).ok_or_else(|| io::Error::other("bridge exited before startup"))?;
    let events = Events::new()?;
    events.watch(listener.as_raw_fd() as usize, libc::EVFILT_READ)?;
    events.watch(0, libc::EVFILT_READ)?;
    events.watch(pid as usize, libc::EVFILT_PROC)?;
    let mut sessions = HashMap::new();
    let mut rescan = false;
    loop {
        let wake = match events.next(rescan.then_some(Duration::from_millis(300))) {
            Ok(event) => event,
            Err(e) => {
                eprintln!("guardian event wait: {e}");
                break;
            }
        };
        match wake {
            Some((0, libc::EVFILT_READ)) => break,
            Some((id, libc::EVFILT_PROC)) if id == pid as usize => break,
            Some((_, libc::EVFILT_READ)) => match listener.accept() {
                Ok((channel, _)) => {
                    if let Err(e) = enroll(channel, root, &events, &mut sessions) {
                        eprintln!("guardian registration: {e}");
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    eprintln!("guardian listener: {e}");
                    break;
                }
            },
            _ => {
                if let Err(e) = sweep(&mut sessions, false) {
                    eprintln!("guardian process scan: {e}");
                }
                rescan = sessions
                    .values()
                    .any(|s| identity(s.leader.pid) != Some(s.leader));
            }
        }
    }
    drop(listener);
    // No new exec wrapper will proceed after the endpoint closes. Rescan for
    // children forked between snapshot and termination while their SID is pinned.
    let deadline = Instant::now() + Duration::from_secs(5);
    while !sessions.is_empty() {
        if let Err(e) = sweep(&mut sessions, true) {
            eprintln!("guardian cleanup: {e}")
        }
        if Instant::now() > deadline {
            return Err(io::Error::other(format!(
                "owned sessions did not terminate: {:?}",
                sessions.keys().collect::<Vec<_>>()
            )));
        }
        thread::sleep(Duration::from_millis(10));
    }
    Ok(())
}
fn anchor() -> io::Result<()> {
    let mut channel = UnixStream::connect(
        env::var_os(SOCKET).ok_or_else(|| io::Error::other("guardian socket missing"))?,
    )?;
    channel.set_read_timeout(Some(Duration::from_secs(5)))?;
    ready(&mut channel)?;
    io::stdout().write_all(b"Y")?;
    io::stdout().flush()?;
    channel.set_read_timeout(None)?;
    let _ = channel.read(&mut [0]);
    Ok(())
}
fn ready(input: &mut impl Read) -> io::Result<()> {
    let mut reply = [0];
    input.read_exact(&mut reply)?;
    if reply == *b"Y" {
        Ok(())
    } else {
        Err(io::Error::other("guardian rejected registration"))
    }
}
fn owned_exec() -> io::Result<()> {
    let mut args = env::args_os().skip(2);
    let file = args
        .next()
        .ok_or_else(|| io::Error::other("missing owned executable"))?;
    let arg0 = args
        .next()
        .ok_or_else(|| io::Error::other("missing argv[0]"))?;
    let mut anchor = Command::new(env::current_exe()?)
        .arg(ANCHOR)
        .process_group(0)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .spawn()?;
    if let Err(e) = ready(&mut anchor.stdout.take().unwrap()) {
        let _ = anchor.kill();
        let _ = anchor.wait();
        return Err(e);
    }
    Err(Command::new(file).arg0(arg0).args(args).exec())
}
pub fn helper_mode() -> io::Result<bool> {
    match env::args_os().nth(1).as_deref().and_then(|s| s.to_str()) {
        Some(GUARD) => guardian(&PathBuf::from(
            env::args_os()
                .nth(2)
                .ok_or_else(|| io::Error::other("missing guardian socket"))?,
        ))?,
        Some(ANCHOR) => anchor()?,
        Some(EXEC) => owned_exec()?,
        _ => return Ok(false),
    }
    Ok(true)
}
pub struct ProcessTree {
    guardian: Child,
}
pub fn spawn_macos(command: Command, root: &Path) -> io::Result<(Child, ProcessTree)> {
    let temp = tempfile::Builder::new()
        .prefix("suffice-guard-")
        .permissions(fs::Permissions::from_mode(0o700))
        .tempdir_in("/tmp")?;
    let socket = temp.path().join("s");
    let executable = env::current_exe()?;
    let guardian = Command::new(&executable)
        .process_group(0)
        .args([std::ffi::OsStr::new(GUARD), socket.as_os_str()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;
    let mut tree = ProcessTree { guardian };
    ready(&mut tree.guardian.stdout.take().unwrap())?;
    let _ = temp.keep(); // The guardian cleans the directory even after host SIGKILL.
    let mut child = Command::new(&executable);
    child
        .arg(EXEC)
        .arg(command.get_program())
        .arg(command.get_program())
        .args(command.get_args());
    for (key, value) in command.get_envs() {
        if let Some(value) = value {
            child.env(key, value);
        } else {
            child.env_remove(key);
        }
    }
    if let Some(cwd) = command.get_current_dir() {
        child.current_dir(cwd);
    }
    let hook = root.join("apps/desktop-rust/owned-process-hook.cjs");
    let hook = hook
        .to_str()
        .ok_or_else(|| io::Error::other("non-UTF8 Node preload path"))?;
    let node_options = env::var("NODE_OPTIONS").unwrap_or_default();
    child
        .env(
            "NODE_OPTIONS",
            format!(
                "--require \"{}\" {}",
                hook.replace('\\', "\\\\").replace('"', "\\\""),
                node_options
            ),
        )
        .env(SOCKET, &socket)
        .env("SUFFICE_OWNED_EXEC", &executable)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    // setsid runs in the child between fork and exec, before any Node preload.
    unsafe {
        child.pre_exec(|| {
            if libc::setsid() < 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(())
            }
        });
    }
    let mut child = child.spawn()?;
    if let Err(e) = writeln!(tree.guardian.stdin.as_mut().unwrap(), "{}", child.id()) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(e);
    }
    Ok((child, tree))
}
impl ProcessTree {
    pub fn close(&mut self) {
        drop(self.guardian.stdin.take());
        match self.guardian.wait() {
            Ok(status) if !status.success() => eprintln!("process guardian exited with {status}"),
            Err(e) => eprintln!("process guardian wait failed: {e}"),
            _ => {}
        }
    }
    pub fn resume(&self, _: &Child) -> io::Result<()> {
        Ok(())
    }
    pub fn monitor(&self, _: &Child, on_exit: impl FnOnce() + Send + 'static) -> io::Result<()> {
        let events = Events::new()?;
        events.watch(self.guardian.id() as usize, libc::EVFILT_PROC)?;
        thread::Builder::new()
            .name("guardian-monitor".into())
            .spawn(move || {
                let _ = events.next(None);
                on_exit();
            })?;
        Ok(())
    }
}
impl Drop for ProcessTree {
    fn drop(&mut self) {
        if self.guardian.stdin.is_some() {
            self.close();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_denied_signal_does_not_starve_later_snapshot_members() {
        let ids = [1, 2, 3].map(|pid| {
            (
                Identity {
                    pid,
                    sec: 0,
                    usec: 0,
                },
                1,
            )
        });
        let mut attempts = Vec::new();
        let error = signal_snapshot(&ids, |id, _| {
            attempts.push(id.pid);
            if id.pid != 2 {
                Err(io::Error::other("denied"))
            } else {
                Ok(())
            }
        })
        .unwrap_err();
        assert_eq!(attempts, [1, 2, 3]);
        assert!(error.to_string().contains("pid 1"));
        assert!(error.to_string().contains("pid 3"));
    }
    #[test]
    fn stale_identity_and_wrong_session_do_not_signal_a_live_process() {
        let mut child = Command::new("/bin/sleep").arg("10").spawn().unwrap();
        let current = identity(child.id() as i32).unwrap();
        let session = sid(current.pid);
        let stale = Identity {
            usec: current.usec.wrapping_add(1),
            ..current
        };
        kill_member(stale, session).unwrap();
        kill_member(current, session.wrapping_add(1)).unwrap();
        assert_eq!(child.try_wait().unwrap(), None);
        child.kill().unwrap();
        child.wait().unwrap();
    }
}
