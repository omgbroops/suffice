//! One owner per canonical profile. The kernel lock, rather than a PID file,
//! determines ownership. A second launch can only ask that owner to activate.
use serde_json::{Value, json};
use std::{
    fs::{File, OpenOptions},
    io::{self, BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

pub struct Instance {
    _lock: File,
    endpoint: PathBuf,
    address: SocketAddr,
    stopped: Arc<AtomicBool>,
    server: Option<JoinHandle<()>>,
}

fn private_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    options
}

fn activate(endpoint: &Path) -> io::Result<()> {
    let mut data = Vec::new();
    let file = private_options().open(endpoint)?;
    private_regular(&file)?;
    file.take(4097).read_to_end(&mut data)?;
    if data.len() > 4096 {
        return Err(io::Error::other("invalid instance endpoint"));
    }
    let value: Value = serde_json::from_slice(&data)?;
    let port = value["port"]
        .as_u64()
        .filter(|p| *p > 0 && *p <= u16::MAX as u64)
        .ok_or_else(|| io::Error::other("invalid instance port"))? as u16;
    let token = value["token"]
        .as_str()
        .filter(|s| s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit()))
        .ok_or_else(|| io::Error::other("invalid instance token"))?;
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut socket = TcpStream::connect_timeout(&address, Duration::from_millis(200))?;
    socket.set_read_timeout(Some(Duration::from_millis(200)))?;
    socket.set_write_timeout(Some(Duration::from_millis(200)))?;
    socket.write_all(format!("{token} activate\n").as_bytes())?;
    let mut reply = [0; 3];
    socket.read_exact(&mut reply)?;
    if &reply != b"ok\n" {
        return Err(io::Error::other("instance did not acknowledge activation"));
    }
    Ok(())
}

/// `None` means an existing instance acknowledged activation; no bridge should
/// be started. An abandoned lock/endpoint is recovered without PID guessing.
pub fn claim(
    profile: &Path,
    on_activate: impl Fn() -> bool + Send + 'static,
) -> io::Result<Option<Instance>> {
    let lock = private_options()
        .create(true)
        .truncate(false)
        .open(profile.join("instance.lock"))?;
    private_regular(&lock)?;
    let endpoint = profile.join("instance.json");
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        match lock.try_lock() {
            Ok(()) => break,
            Err(std::fs::TryLockError::WouldBlock) => {
                if activate(&endpoint).is_ok() {
                    return Ok(None);
                }
                if Instant::now() >= deadline {
                    return Err(io::Error::other(
                        "profile is locked but its owner is not responding",
                    ));
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(std::fs::TryLockError::Error(error)) => return Err(error),
        }
    }
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    let address = listener.local_addr()?;
    let mut random = [0u8; 32];
    getrandom::fill(&mut random).map_err(|e| io::Error::other(e.to_string()))?;
    let token: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let mut temporary_random = [0u8; 16];
    getrandom::fill(&mut temporary_random).map_err(|e| io::Error::other(e.to_string()))?;
    let temporary_nonce: String = temporary_random
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let temporary = profile.join(format!("instance-{temporary_nonce}.tmp"));
    let mut receipt = private_options().create_new(true).open(&temporary)?;
    receipt.write_all(
        serde_json::to_string(&json!({"port":address.port(),"token":token}))?.as_bytes(),
    )?;
    receipt.sync_all()?;
    drop(receipt);
    match std::fs::remove_file(&endpoint) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    std::fs::rename(&temporary, &endpoint)?;
    let stopped = Arc::new(AtomicBool::new(false));
    let flag = stopped.clone();
    let server = std::thread::Builder::new()
        .name("profile-activation".into())
        .spawn(move || {
            for socket in listener.incoming() {
                if flag.load(Ordering::Acquire) {
                    break;
                }
                let Ok(mut socket) = socket else {
                    break;
                };
                let _ = socket.set_read_timeout(Some(Duration::from_millis(200)));
                let _ = socket.set_write_timeout(Some(Duration::from_millis(200)));
                let mut request = String::new();
                if BufReader::new((&mut socket).take(128))
                    .read_line(&mut request)
                    .is_ok()
                    && request == format!("{token} activate\n")
                    && on_activate()
                {
                    let _ = socket.write_all(b"ok\n");
                }
            }
        })?;
    Ok(Some(Instance {
        _lock: lock,
        endpoint,
        address,
        stopped,
        server: Some(server),
    }))
}

impl Drop for Instance {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        let _ = TcpStream::connect_timeout(&self.address, Duration::from_millis(200));
        if let Some(server) = self.server.take() {
            let _ = server.join();
        }
        let _ = std::fs::remove_file(&self.endpoint);
    }
}

fn private_regular(file: &File) -> io::Result<()> {
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(io::Error::other("instance receipt must be a regular file"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        if metadata.permissions().mode() & 0o077 != 0
            || metadata.uid() != unsafe { libc::geteuid() }
        {
            return Err(io::Error::other(
                "instance receipt must be private and owned by the current user",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profile_ownership_activation_recovery_and_token_validation() {
        let mut bytes = [0u8; 12];
        getrandom::fill(&mut bytes).unwrap();
        let directory = std::env::temp_dir().join(format!(
            "suffice-instance-{}",
            bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
        ));
        std::fs::create_dir(&directory).unwrap();
        let (send, receive) = std::sync::mpsc::channel();
        let first = claim(&directory, move || send.send(()).is_ok())
            .unwrap()
            .unwrap();
        let mut invalid = TcpStream::connect(first.address).unwrap();
        invalid.write_all(b"invalid activate\n").unwrap();
        invalid.shutdown(std::net::Shutdown::Write).unwrap();
        let mut response = String::new();
        invalid.read_to_string(&mut response).unwrap();
        assert!(response.is_empty());
        assert!(receive.try_recv().is_err());
        assert!(
            claim(&directory, || panic!("second launch became primary"))
                .unwrap()
                .is_none()
        );
        receive.recv_timeout(Duration::from_secs(1)).unwrap();
        drop(first);
        // Stale or corrupted endpoint files never establish ownership.
        std::fs::write(directory.join("instance.json"), b"stale").unwrap();
        let next = claim(&directory, || true).unwrap().unwrap();
        drop(next);
        assert!(!directory.join("instance.json").exists());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
