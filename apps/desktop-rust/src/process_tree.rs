//! Own the bridge and descendants before its host-start gate is released.
use std::{io, process::Child};

#[cfg(windows)]
pub struct ProcessTree(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl ProcessTree {
    pub fn attach(child: &Child) -> io::Result<Self> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        // SAFETY: unnamed non-inheritable owned handle; child handle stays valid
        // throughout assignment. Job info has the exact API size/layout.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(io::Error::last_os_error());
            }
            let owned = Self(job);
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&info) as u32,
            ) == 0
                || AssignProcessToJobObject(job, child.as_raw_handle()) == 0
            {
                return Err(io::Error::last_os_error());
            }
            Ok(owned)
        }
    }
    pub fn close(&mut self) {
        if !self.0.is_null() {
            // SAFETY: this is our handle, closed once. Kernel kills remaining
            // assigned descendants, even when the direct bridge has exited.
            unsafe {
                windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0, 1);
                windows_sys::Win32::Foundation::CloseHandle(self.0);
            }
            self.0 = std::ptr::null_mut();
        }
    }
    pub fn monitor(
        &self,
        child: &Child,
        on_exit: impl FnOnce() + Send + 'static,
    ) -> io::Result<()> {
        use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
        use windows_sys::Win32::{
            Foundation::*,
            System::{JobObjects::*, Threading::*},
        };
        fn duplicate(handle: HANDLE) -> io::Result<OwnedHandle> {
            // SAFETY: duplicate a valid borrowed handle into an independent,
            // non-inheritable OwnedHandle for the monitor thread.
            unsafe {
                let current = GetCurrentProcess();
                let mut copy = std::ptr::null_mut();
                if DuplicateHandle(
                    current,
                    handle,
                    current,
                    &mut copy,
                    0,
                    0,
                    DUPLICATE_SAME_ACCESS,
                ) == 0
                {
                    return Err(io::Error::last_os_error());
                }
                Ok(OwnedHandle::from_raw_handle(copy))
            }
        }
        let process = duplicate(child.as_raw_handle())?;
        let job = duplicate(self.0)?;
        std::thread::Builder::new()
            .name("bridge-exit-monitor".into())
            .spawn(move || {
                // SAFETY: owned handles live throughout wait/termination. This
                // monitor never depends on the renderer, pipe reader or UI loop.
                unsafe {
                    let _ = WaitForSingleObject(process.as_raw_handle(), u32::MAX);
                    TerminateJobObject(job.as_raw_handle(), 1);
                }
                on_exit();
            })?;
        Ok(())
    }
    /// Resume only after job assignment. CREATE_SUSPENDED prevents even Node
    /// preloads from spawning an uncontained child during process startup.
    pub fn resume(&self, child: &Child) -> io::Result<()> {
        use windows_sys::Win32::{
            Foundation::*,
            System::{Diagnostics::ToolHelp::*, Threading::*},
        };
        // SAFETY: snapshot identifies initial thread(s) of our still-suspended
        // owned process. No remote code is injected; documented ResumeThread
        // releases the suspend created by CreateProcess.
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return Err(io::Error::last_os_error());
            }
            let mut entry = THREADENTRY32 {
                dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                ..Default::default()
            };
            let mut next = Thread32First(snapshot, &mut entry);
            let mut result = Err(io::Error::other("suspended child thread not found"));
            while next != 0 {
                if entry.th32OwnerProcessID == child.id() {
                    let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                    if thread.is_null() {
                        result = Err(io::Error::last_os_error());
                        break;
                    }
                    let previous = ResumeThread(thread);
                    let error = io::Error::last_os_error();
                    CloseHandle(thread);
                    result = if previous == u32::MAX {
                        Err(error)
                    } else {
                        Ok(())
                    };
                    break;
                }
                next = Thread32Next(snapshot, &mut entry);
            }
            CloseHandle(snapshot);
            result
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(not(windows))]
pub struct ProcessTree;
#[cfg(not(windows))]
impl ProcessTree {
    pub fn attach(_: &Child) -> io::Result<Self> {
        Err(io::Error::other(
            "process-tree containment is not implemented for this platform",
        ))
    }
    pub fn close(&mut self) {}
    pub fn resume(&self, _: &Child) -> io::Result<()> {
        Err(io::Error::other("unsupported platform"))
    }
    pub fn monitor(&self, _: &Child, _: impl FnOnce() + Send + 'static) -> io::Result<()> {
        Err(io::Error::other("unsupported platform"))
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        os::windows::{io::AsRawHandle, process::CommandExt},
        process::{Command, Stdio},
    };
    #[test]
    fn bridge_exit_terminates_descendant_without_ui_or_pipe_progress() {
        let node = std::env::var("SUFFICE_TEST_NODE").expect("pinned Node required");
        let script = "const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(c.pid);process.stdin.once('data',()=>process.exit(0));setInterval(()=>{},1000)";
        let mut parent = Command::new(node)
            .args(["-e", script])
            .creation_flags(0x08000004)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let tree = ProcessTree::attach(&parent).unwrap();
        let (notify, done) = std::sync::mpsc::channel();
        tree.monitor(&parent, move || {
            let _ = notify.send(());
        })
        .unwrap();
        tree.resume(&parent).unwrap();
        let mut line = String::new();
        BufReader::new(parent.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        let pid: u32 = line.trim().parse().unwrap();
        // SAFETY: keep our descendant's handle before parent exit; signal proves
        // actual termination, independent of PID reuse or UI callbacks.
        unsafe {
            use windows_sys::Win32::{Foundation::CloseHandle, System::Threading::*};
            let descendant = OpenProcess(0x00100000, 0, pid);
            assert!(!descendant.is_null());
            parent.stdin.as_mut().unwrap().write_all(b"exit\n").unwrap();
            done.recv_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            assert_eq!(WaitForSingleObject(descendant, 5000), 0);
            CloseHandle(descendant);
        }
        let _ = parent.wait().unwrap();
    }
    #[test]
    fn closing_job_kills_owned_parent_and_grandchild() {
        let node = std::env::var("SUFFICE_TEST_NODE")
            .expect("SUFFICE_TEST_NODE must name pinned Node for containment tests");
        let script = "const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(c.pid);setInterval(()=>{},1000)";
        let mut parent = Command::new(node)
            .args(["-e", script])
            .creation_flags(0x08000004)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut tree = ProcessTree::attach(&parent).unwrap();
        tree.resume(&parent).unwrap();
        let mut line = String::new();
        BufReader::new(parent.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        let pid: u32 = line.trim().parse().unwrap();
        use windows_sys::Win32::System::{JobObjects::IsProcessInJob, Threading::*};
        // SAFETY: PID came from our gated child; keep handle before terminating
        // the job, avoiding PID reuse in the actual termination assertion.
        unsafe {
            let descendant = OpenProcess(0x00100000 | 0x1000, 0, pid);
            assert!(!descendant.is_null());
            let mut member = 0;
            assert_ne!(IsProcessInJob(descendant, tree.0, &mut member), 0);
            assert_ne!(member, 0);
            tree.close();
            assert_eq!(WaitForSingleObject(parent.as_raw_handle(), 5000), 0);
            assert_eq!(WaitForSingleObject(descendant, 5000), 0);
            windows_sys::Win32::Foundation::CloseHandle(descendant);
        }
        // Windows job teardown may report exit code zero; signaled retained
        // handles above prove both owned processes actually terminated.
        let _ = parent.wait().unwrap();
    }
}
