use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
use suffice_session::{ReadError, ReadLimits, SessionStore};

static NEXT: AtomicU64 = AtomicU64::new(0);
const SESSION: &str = concat!(
    "{\"type\":\"session\",\"id\":\"fixture\",\"timestamp\":\"2020-01-01T00:00:00.000Z\"}\n",
    "{\"type\":\"message\",\"id\":\"m\",\"parentId\":null,\"message\":{\"role\":\"user\",\"content\":\"inside\",\"timestamp\":1}}\n"
);
struct Fixture {
    base: PathBuf,
    root: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!(
            "suffice-confined-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let root = base.join("sessions");
        fs::create_dir_all(root.join("group")).unwrap();
        fs::write(root.join("group/file.jsonl"), SESSION).unwrap();
        Self { base, root }
    }
    fn store(&self, limits: ReadLimits) -> SessionStore {
        SessionStore::open(&self.root, limits).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.base).unwrap();
    }
}

#[test]
fn discovery_and_strict_reads_preserve_original_bytes() {
    let fixture = Fixture::new();
    let file = fixture.root.join("group/file.jsonl");
    let before = fs::read(&file).unwrap();
    let store = fixture.store(ReadLimits::default());
    let discovery = store.discover().unwrap();
    assert!(discovery.skipped.is_empty());
    assert_eq!(discovery.sessions.len(), 1);
    assert_eq!(
        discovery.sessions[0].relative_path,
        PathBuf::from("group/file.jsonl")
    );
    assert_eq!(discovery.sessions[0].summary["firstMessage"], "inside");
    assert_eq!(
        store
            .read(&discovery.sessions[0].relative_path)
            .unwrap()
            .len(),
        2
    );
    assert_eq!(fs::read(file).unwrap(), before);
}

#[test]
fn rejects_absolute_parent_and_non_session_paths() {
    let fixture = Fixture::new();
    let store = fixture.store(ReadLimits::default());
    for path in [
        fixture.root.join("group/file.jsonl"),
        PathBuf::from("../outside.jsonl"),
        PathBuf::from("group/../file.jsonl"),
        PathBuf::from("group/nested/file.jsonl"),
        PathBuf::from("group/file.txt"),
    ] {
        assert!(
            matches!(store.read(&path), Err(ReadError::InvalidPath)),
            "{}",
            path.display()
        );
    }
}

#[test]
fn exact_byte_boundary_and_crash_tail_recovery() {
    let fixture = Fixture::new();
    let path = fixture.root.join("group/file.jsonl");
    fs::write(&path, "{}\n").unwrap();
    let store = fixture.store(ReadLimits {
        max_file_bytes: 3,
        ..ReadLimits::default()
    });
    assert_eq!(
        store
            .read(std::path::Path::new("group/file.jsonl"))
            .unwrap(),
        vec![serde_json::json!({})]
    );
    fs::write(&path, "{}\n{\"partial\"").unwrap();
    let store = fixture.store(ReadLimits::default());
    assert_eq!(
        store
            .read(std::path::Path::new("group/file.jsonl"))
            .unwrap()
            .len(),
        1
    );
    fs::write(&path, "{}\nBAD\n").unwrap();
    assert!(matches!(
        store.read(std::path::Path::new("group/file.jsonl")),
        Err(ReadError::InvalidJson(2))
    ));
}

#[test]
fn line_size_and_count_are_enforced_before_unbounded_accumulation() {
    let fixture = Fixture::new();
    fs::write(fixture.root.join("group/file.jsonl"), "{}\n{}\n").unwrap();
    let store = fixture.store(ReadLimits {
        max_lines: 1,
        ..ReadLimits::default()
    });
    assert!(matches!(
        store.read(std::path::Path::new("group/file.jsonl")),
        Err(ReadError::Limit("line count"))
    ));
    let store = fixture.store(ReadLimits {
        max_line_bytes: 2,
        ..ReadLimits::default()
    });
    assert!(matches!(
        store.read(std::path::Path::new("group/file.jsonl")),
        Err(ReadError::Limit("line bytes"))
    ));
    fs::write(fixture.root.join("group/file.jsonl"), b"{}\n\xff").unwrap();
    assert!(matches!(
        fixture
            .store(ReadLimits::default())
            .read(std::path::Path::new("group/file.jsonl")),
        Err(ReadError::InvalidUtf8(2))
    ));
}

#[test]
fn sparse_oversized_files_are_reported_without_reading_them() {
    let fixture = Fixture::new();
    fs::File::create(fixture.root.join("group/large.jsonl"))
        .unwrap()
        .set_len(65 * 1024 * 1024)
        .unwrap();
    let discovery = fixture.store(ReadLimits::default()).discover().unwrap();
    assert_eq!(discovery.sessions.len(), 1);
    assert_eq!(discovery.skipped.len(), 1);
    assert!(discovery.skipped[0].contains("file bytes"));
}

#[test]
fn global_scan_budgets_fail_instead_of_returning_a_partial_catalog() {
    let fixture = Fixture::new();
    fs::write(fixture.root.join("group/second.jsonl"), SESSION).unwrap();
    for (limits, expected) in [
        (
            ReadLimits {
                max_sessions: 1,
                ..ReadLimits::default()
            },
            "session count",
        ),
        (
            ReadLimits {
                max_directory_entries: 1,
                ..ReadLimits::default()
            },
            "directory entries",
        ),
        (
            ReadLimits {
                max_total_bytes: SESSION.len() as u64,
                ..ReadLimits::default()
            },
            "total bytes",
        ),
    ] {
        assert!(
            matches!(fixture.store(limits).discover(), Err(ReadError::Limit(kind)) if kind == expected)
        );
    }
}

#[test]
fn retained_root_cannot_be_redirected_by_replacing_its_path() {
    let fixture = Fixture::new();
    let store = fixture.store(ReadLimits::default());
    // An ambient canonicalize-then-reopen implementation reads the replacement.
    if let Err(error) = fs::rename(&fixture.root, fixture.base.join("moved")) {
        // Windows directory capabilities may prevent rename while held, which
        // also prevents redirecting authority to a replacement path.
        #[cfg(windows)]
        {
            assert!(matches!(error.raw_os_error(), Some(5 | 32 | 33)));
            assert_eq!(
                store
                    .read(std::path::Path::new("group/file.jsonl"))
                    .unwrap()[1]["message"]["content"],
                "inside"
            );
            return;
        }
        #[cfg(not(windows))]
        panic!("fixture rename failed: {error}");
    }
    fs::create_dir_all(fixture.root.join("group")).unwrap();
    fs::write(
        fixture.root.join("group/file.jsonl"),
        SESSION.replace("inside", "replacement"),
    )
    .unwrap();
    let entries = store
        .read(std::path::Path::new("group/file.jsonl"))
        .unwrap();
    assert_eq!(entries[1]["message"]["content"], "inside");
    assert_eq!(
        store.discover().unwrap().sessions[0].summary["firstMessage"],
        "inside"
    );
}

#[cfg(unix)]
#[test]
fn group_and_file_symlinks_cannot_redirect_a_saved_selection() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let store = fixture.store(ReadLimits::default());
    let selected = store.discover().unwrap().sessions.remove(0).relative_path;
    let outside = fixture.base.join("outside.jsonl");
    fs::write(&outside, SESSION.replace("inside", "outside")).unwrap();
    fs::remove_file(fixture.root.join(&selected)).unwrap();
    symlink(&outside, fixture.root.join(&selected)).unwrap();
    assert!(store.read(&selected).is_err());
    let listing = store.discover().unwrap();
    assert!(listing.sessions.is_empty());
    assert_eq!(listing.skipped.len(), 1);
    fs::remove_file(fixture.root.join(&selected)).unwrap();
    fs::remove_dir(fixture.root.join("group")).unwrap();
    symlink(&fixture.base, fixture.root.join("group")).unwrap();
    assert!(store
        .read(std::path::Path::new("group/outside.jsonl"))
        .is_err());
    assert_eq!(
        fs::read_to_string(outside).unwrap(),
        SESSION.replace("inside", "outside")
    );
}

#[cfg(unix)]
#[test]
fn special_files_are_skipped_without_blocking_for_a_writer() {
    let fixture = Fixture::new();
    let fifo = fixture.root.join("group/pipe.jsonl");
    assert!(std::process::Command::new("mkfifo")
        .arg(&fifo)
        .status()
        .unwrap()
        .success());
    let result = fixture.store(ReadLimits::default()).discover().unwrap();
    assert_eq!(result.sessions.len(), 1);
    assert!(result.skipped[0].contains("regular"));
}

#[test]
fn callers_cannot_disable_hard_caps() {
    let fixture = Fixture::new();
    for limits in [
        ReadLimits {
            max_line_bytes: 0,
            ..ReadLimits::default()
        },
        ReadLimits {
            max_file_bytes: u64::MAX,
            ..ReadLimits::default()
        },
    ] {
        assert!(matches!(
            SessionStore::open(&fixture.root, limits),
            Err(ReadError::Limit("invalid read limits"))
        ));
    }
}
