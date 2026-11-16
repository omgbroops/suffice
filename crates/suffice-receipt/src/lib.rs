//! Append already-serialized receipt bytes through one retained directory
//! capability. Flush is an ordering barrier; this writer makes no fsync promise.
use cap_fs_ext::{DirExt, FollowSymlinks, MetadataExt, OpenOptionsFollowExt, OpenOptionsSyncExt};
use cap_std::fs::{Dir, DirBuilder, File, Metadata, OpenOptions};
use std::{
    io::{self, Write},
    path::{Path, PathBuf},
};

pub const MAX_PAGE_BYTES: usize = 1024 * 1024;

type Identity = (u64, u64);
fn identity(m: &Metadata) -> Identity {
    (m.dev(), m.ino())
}
fn changed(reason: &str) -> io::Error {
    io::Error::other(reason)
}

fn receipt_name(name: &str) -> bool {
    let Some((time, uuid)) = name.strip_suffix(".jsonl").and_then(|n| n.split_once('-')) else {
        return false;
    };
    !time.is_empty()
        && time.len() <= 16
        && time.bytes().all(|b| b.is_ascii_digit())
        && uuid.len() == 36
        && uuid.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            14 => b == b'4',
            19 => matches!(b, b'8' | b'9' | b'a' | b'b'),
            _ => b.is_ascii_digit() || (b'a'..=b'f').contains(&b),
        })
}

struct OpenFile {
    handle: File,
    id: Identity,
    length: u64,
}

pub struct Receipt {
    home_path: PathBuf,
    home: Dir,
    events: Dir,
    home_id: Identity,
    events_id: Identity,
    name: String,
    file: Option<OpenFile>,
    incomplete: bool,
    fault: Option<String>,
}

impl Receipt {
    pub fn validate_location(home_path: &Path, name: &str) -> io::Result<()> {
        if !home_path.is_absolute() || !receipt_name(name) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Invalid receipt home or filename",
            ));
        }
        Ok(())
    }

    pub fn has_terminal_fault(&self) -> bool {
        self.fault.is_some()
    }

    /// The host supplies its existing, trusted home and a generated leaf name.
    /// New events directories/receipts use 0700/0600 subject to process umask.
    pub fn open(home_path: &Path, name: &str) -> io::Result<Self> {
        Self::validate_location(home_path, name)?;
        let home = Dir::open_ambient_dir(home_path, cap_std::ambient_authority())?;
        let options = DirBuilder::new();
        #[cfg(unix)]
        let options = {
            use cap_std::fs::DirBuilderExt;
            let mut o = options;
            o.mode(0o700);
            o
        };
        if let Err(e) = home.create_dir_with("events", &options) {
            if e.kind() != io::ErrorKind::AlreadyExists {
                return Err(e);
            }
        }
        let events = home.open_dir_nofollow("events")?;
        Ok(Self {
            home_path: home_path.to_owned(),
            home_id: identity(&home.dir_metadata()?),
            events_id: identity(&events.dir_metadata()?),
            home,
            events,
            name: name.into(),
            file: None,
            incomplete: false,
            fault: None,
        })
    }

    fn verify_names(&self) -> io::Result<()> {
        let live = Dir::open_ambient_dir(&self.home_path, cap_std::ambient_authority())?;
        if identity(&live.dir_metadata()?) != self.home_id
            || identity(&self.home.open_dir_nofollow("events")?.dir_metadata()?) != self.events_id
        {
            return Err(changed("Receipt directory identity changed"));
        }
        if let Some(file) = &self.file {
            // Get both identities from opened files (including Windows). The
            // pathname descriptor is only used for inspection, never for writing.
            // Do not open a known FIFO, device or socket for inspection. A
            // swap after this stat still faces nonblocking, no-follow open
            // and the regular-file/identity checks on the actual handle.
            let candidate = self.events.symlink_metadata(&self.name)?;
            if !candidate.is_file() || candidate.file_type().is_symlink() {
                return Err(changed("Receipt path is no longer a regular file"));
            }
            let mut inspect = OpenOptions::new();
            inspect.read(true).follow(FollowSymlinks::No).nonblock(true);
            let current = self.events.open_with(&self.name, &inspect)?.metadata()?;
            let retained = file.handle.metadata()?;
            if [&current, &retained].iter().any(|m| {
                !m.is_file() || m.nlink() != 1 || identity(m) != file.id || m.len() != file.length
            }) {
                return Err(changed("Receipt file identity or length changed"));
            }
        }
        Ok(())
    }

    fn terminal(&mut self, e: io::Error) -> io::Error {
        self.fault.get_or_insert_with(|| e.to_string());
        self.file = None;
        e
    }

    fn verify(&mut self) -> io::Result<()> {
        if let Some(reason) = &self.fault {
            return Err(changed(reason));
        }
        self.verify_names().map_err(|e| self.terminal(e))
    }

    fn create_file(&mut self) -> io::Result<()> {
        let mut opts = OpenOptions::new();
        opts.append(true)
            .create_new(true)
            .follow(FollowSymlinks::No)
            .nonblock(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let handle = match self.events.open_with(&self.name, &opts) {
            Ok(handle) => handle,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => return Err(self.terminal(e)),
            Err(e) => return Err(e),
        };
        let m = handle.metadata().map_err(|e| self.terminal(e))?;
        self.file = Some(OpenFile {
            handle,
            id: identity(&m),
            length: 0,
        });
        self.verify()
    }

    pub fn append(&mut self, page: &[u8], final_page: bool) -> io::Result<()> {
        self.append_with(page, final_page, |f, bytes| f.write(bytes))
    }

    fn append_with(
        &mut self,
        page: &[u8],
        final_page: bool,
        mut write: impl FnMut(&mut File, &[u8]) -> io::Result<usize>,
    ) -> io::Result<()> {
        if page.is_empty() || page.len() > MAX_PAGE_BYTES {
            let error = io::Error::new(io::ErrorKind::InvalidInput, "Invalid receipt page size");
            return Err(if self.incomplete {
                self.terminal(error)
            } else {
                error
            });
        }
        self.verify()?;
        if self.file.is_none() {
            self.create_file()?;
        }
        let mut sent = 0;
        while sent < page.len() {
            let file = self.file.as_mut().expect("created receipt");
            let result = write(&mut file.handle, &page[sent..]);
            match result {
                Ok(n) if n > 0 && n <= page.len() - sent => {
                    sent += n;
                    file.length += n as u64;
                }
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                other => {
                    let e = other.err().unwrap_or_else(|| {
                        io::Error::new(io::ErrorKind::WriteZero, "Incomplete receipt write")
                    });
                    if sent > 0 || self.incomplete {
                        return Err(self.terminal(e));
                    }
                    self.verify()?;
                    return Err(e);
                }
            }
        }
        self.incomplete = !final_page;
        self.verify()
    }

    pub fn flush(&mut self) -> io::Result<()> {
        self.verify()
    }

    pub fn close(mut self) -> io::Result<()> {
        self.flush()?;
        if self.incomplete {
            return Err(changed("Receipt closed during an incomplete record"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicUsize, Ordering},
    };
    const NAME: &str = "1234-01234567-89ab-4def-8123-456789abcdef.jsonl";
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "suffice-receipt-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn open(&self) -> Receipt {
            Receipt::open(&self.0, NAME).unwrap()
        }
        fn path(&self) -> PathBuf {
            self.0.join("events").join(NAME)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn lazy_creation_opaque_pages_and_barriers() {
        let f = Fixture::new();
        let mut writer = f.open();
        writer.flush().unwrap();
        assert!(!f.path().exists());
        let bytes = b"opaque; not JSON\n";
        writer.append(&bytes[..3], false).unwrap();
        writer.append(&bytes[3..], true).unwrap();
        writer.close().unwrap();
        assert_eq!(fs::read(f.path()).unwrap(), bytes);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(f.path()).unwrap().permissions().mode() & 0o077,
                0
            );
            assert_eq!(
                fs::metadata(f.0.join("events"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o077,
                0
            );
        }
    }

    #[test]
    fn clean_write_failure_allows_a_later_record_without_replay() {
        let f = Fixture::new();
        let mut writer = f.open();
        let failure = writer.append_with(b"never-written\n", true, |_, _| {
            Err(changed("injected no space"))
        });
        assert!(failure.is_err());
        writer.append(b"next\n", true).unwrap();
        writer.close().unwrap();
        assert_eq!(fs::read(f.path()).unwrap(), b"next\n");
    }

    #[test]
    fn torn_page_and_interrupted_multichunk_record_latch_the_original_failure() {
        for earlier_page in [true, false] {
            let f = Fixture::new();
            let mut writer = f.open();
            let mut write_prefix = !earlier_page;
            if earlier_page {
                writer.append(b"old", false).unwrap();
            }
            let failure = writer
                .append_with(b"old remainder\n", true, |file, bytes| {
                    if write_prefix {
                        write_prefix = false;
                        file.write(&bytes[..3])
                    } else {
                        Err(changed("synthetic disk full"))
                    }
                })
                .unwrap_err();
            assert_eq!(
                writer.append(b"new\n", true).unwrap_err().to_string(),
                failure.to_string()
            );
            assert!(writer.flush().is_err());
            assert!(writer.close().is_err());
            assert_eq!(fs::read(f.path()).unwrap(), b"old");
        }
    }

    #[test]
    fn incomplete_record_never_reports_successful_close() {
        let f = Fixture::new();
        let mut writer = f.open();
        writer.append(b"torn", false).unwrap();
        assert!(writer.close().is_err());
        assert_eq!(fs::read(f.path()).unwrap(), b"torn");
    }

    #[test]
    fn collisions_and_bad_names_never_open_a_foreign_file_for_write() {
        let f = Fixture::new();
        for name in [
            "../alias.jsonl",
            "existing.jsonl",
            "123-01234567-89ab-4def-8123-456789abcdef.jsonl/extra",
        ] {
            assert!(Receipt::open(&f.0, name).is_err());
        }
        let mut writer = f.open();
        fs::write(f.path(), b"outside").unwrap();
        assert!(writer.append(b"event\n", true).is_err());
        fs::remove_file(f.path()).unwrap();
        assert!(writer.append(b"retry\n", true).is_err());
        assert!(!f.path().exists());
    }

    #[cfg(unix)]
    #[test]
    fn file_and_directory_replacements_revoke_even_when_the_original_returns() {
        use std::os::unix::fs::symlink;
        for target in ["file", "events", "home"] {
            let f = Fixture::new();
            let outsider = Fixture::new();
            let mut writer = f.open();
            writer.append(b"first\n", true).unwrap();
            let path = match target {
                "file" => f.path(),
                "events" => f.0.join("events"),
                _ => f.0.clone(),
            };
            let prior = path.with_extension("original");
            fs::rename(&path, &prior).unwrap();
            symlink(&outsider.0, &path).unwrap();
            assert!(writer.append(b"replaced\n", true).is_err());
            fs::remove_file(&path).unwrap();
            fs::rename(prior, &path).unwrap();
            assert!(writer.append(b"replayed\n", true).is_err());
            assert_eq!(fs::read(f.path()).unwrap(), b"first\n");
            assert_eq!(fs::read_dir(&outsider.0).unwrap().count(), 0);
        }
    }

    #[cfg(unix)]
    #[test]
    fn special_entry_is_rejected_before_inspection_open() {
        let fixture = Fixture::new();
        let mut writer = fixture.open();
        writer.append(b"original\n", true).unwrap();
        let original = fixture.0.join("original");
        fs::rename(fixture.path(), &original).unwrap();
        assert!(std::process::Command::new("mkfifo")
            .arg(fixture.path())
            .status()
            .unwrap()
            .success());
        let error = writer.flush().unwrap_err();
        assert_eq!(
            error.to_string(),
            "Receipt path is no longer a regular file"
        );
        assert!(writer.has_terminal_fault());
        assert_eq!(fs::read(original).unwrap(), b"original\n");
    }

    #[cfg(unix)]
    #[test]
    fn external_hardlink_or_truncation_stops_subsequent_writes() {
        for linked in [true, false] {
            let f = Fixture::new();
            let mut w = f.open();
            w.append(b"first\n", true).unwrap();
            if linked {
                fs::hard_link(f.path(), f.0.join("alias")).unwrap();
            } else {
                fs::write(f.path(), b"short").unwrap();
            }
            assert!(w.append(b"blocked\n", true).is_err());
            assert!(w.close().is_err());
            assert_eq!(
                fs::read(f.path()).unwrap(),
                if linked {
                    b"first\n".as_slice()
                } else {
                    b"short"
                }
            );
        }
    }
}
