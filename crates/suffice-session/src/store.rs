use crate::{truthy, SummaryBuilder};
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt, OpenOptionsSyncExt};
use cap_std::fs::{Dir, File, Metadata, OpenOptions};
use serde_json::Value;
use std::{
    fmt,
    io::{self, BufRead, BufReader, Read},
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

/// Input/work budgets, not a guarantee about allocator RSS or filesystem latency.
/// Callers may reduce these defaults; raising a hard cap requires a source change.
#[derive(Clone, Copy, Debug)]
pub struct ReadLimits {
    pub max_file_bytes: u64,
    pub max_total_bytes: u64,
    pub max_line_bytes: u64,
    pub max_lines: usize,
    pub max_directory_entries: usize,
    pub max_sessions: usize,
}
impl Default for ReadLimits {
    fn default() -> Self {
        Self {
            max_file_bytes: 64 * 1024 * 1024,
            max_total_bytes: 256 * 1024 * 1024,
            max_line_bytes: 8 * 1024 * 1024,
            max_lines: 250_000,
            max_directory_entries: 50_000,
            max_sessions: 10_000,
        }
    }
}
impl ReadLimits {
    fn validate(self) -> Result<Self, ReadError> {
        let hard = Self::default();
        if self.max_file_bytes == 0
            || self.max_file_bytes > hard.max_file_bytes
            || self.max_total_bytes == 0
            || self.max_total_bytes > hard.max_total_bytes
            || self.max_line_bytes == 0
            || self.max_line_bytes > hard.max_line_bytes
            || self.max_lines == 0
            || self.max_lines > hard.max_lines
            || self.max_directory_entries == 0
            || self.max_directory_entries > hard.max_directory_entries
            || self.max_sessions == 0
            || self.max_sessions > hard.max_sessions
        {
            return Err(ReadError::Limit("invalid read limits"));
        }
        Ok(self)
    }
}

#[derive(Debug)]
pub enum ReadError {
    Io(io::Error),
    InvalidPath,
    Limit(&'static str),
    InvalidJson(usize),
    InvalidUtf8(usize),
    NotRegularFile,
}
impl fmt::Display for ReadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => e.fmt(f),
            Self::InvalidPath => {
                f.write_str("Session path must be a relative group/file.jsonl path")
            }
            Self::Limit(kind) => write!(f, "Session read limit exceeded: {kind}"),
            Self::InvalidJson(line) => {
                write!(f, "Saved transcript contains invalid JSON at line {line}")
            }
            Self::InvalidUtf8(line) => {
                write!(f, "Saved transcript contains invalid UTF-8 at line {line}")
            }
            Self::NotRegularFile => f.write_str("Session is not a regular non-symlink file"),
        }
    }
}
impl std::error::Error for ReadError {}
impl From<io::Error> for ReadError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

pub struct SessionInfo {
    pub relative_path: PathBuf,
    pub summary: Value,
    pub(crate) opened_metadata: Metadata,
    pub(crate) native_eligible: bool,
    pub(crate) sidebar: Value,
}
pub struct Discovery {
    pub bytes_read: u64,
    pub sessions: Vec<SessionInfo>,
    /// Per-candidate failures are visible; global scan limits fail the operation.
    pub skipped: Vec<String>,
}

/// Retains authority to one explicit directory. Session data is opened relative
/// to directory handles, never by reopening a canonicalized ambient pathname.
/// This controls path traversal; it is not a snapshot or an inode provenance check.
pub struct SessionStore {
    directory: Dir,
    display_root: PathBuf,
    limits: ReadLimits,
}
impl SessionStore {
    pub fn open(root: &Path, limits: ReadLimits) -> Result<Self, ReadError> {
        if !root.is_absolute() {
            return Err(ReadError::InvalidPath);
        }
        let limits = limits.validate()?;
        Ok(Self {
            directory: Dir::open_ambient_dir(root, cap_std::ambient_authority())?,
            display_root: root.to_owned(),
            limits,
        })
    }

    pub(crate) fn open_source(&self, relative: &Path) -> Result<(File, Metadata), ReadError> {
        let mut components = relative.components();
        let (Some(Component::Normal(group)), Some(Component::Normal(file)), None) =
            (components.next(), components.next(), components.next())
        else {
            return Err(ReadError::InvalidPath);
        };
        if relative.extension().is_none_or(|ext| ext != "jsonl") {
            return Err(ReadError::InvalidPath);
        }
        // Reject '..' and symlinks at both data path components, including swaps
        // between catalog discovery and a later selection. cap-std also confines
        // resolution to each retained directory capability.
        let group = self.directory.open_dir_nofollow(Path::new(group))?;
        let path = Path::new(file);
        let metadata = group.symlink_metadata(path)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(ReadError::NotRegularFile);
        }
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No).nonblock(true);
        let file = group.open_with(path, &options)?;
        let metadata = file.metadata()?;
        if !metadata.is_file() {
            return Err(ReadError::NotRegularFile);
        }
        Ok((file, metadata))
    }

    pub(crate) fn open_session(&self, relative: &Path) -> Result<(File, Metadata), ReadError> {
        let (file, metadata) = self.open_source(relative)?;
        if metadata.len() > self.limits.max_file_bytes {
            return Err(ReadError::Limit("file bytes"));
        }
        Ok((file, metadata))
    }

    /// Strict transcript parsing with the existing crash-tail recovery rule.
    /// Input is bounded while reading, including when a file grows after stat.
    pub fn read(&self, relative: &Path) -> Result<Vec<Value>, ReadError> {
        let (mut file, _) = self.open_session(relative)?;
        let mut entries = Vec::new();
        let mut total = 0;
        scan(&mut file, self.limits, &mut total, true, |entry| {
            entries.push(entry)
        })?;
        Ok(entries)
    }

    pub(crate) fn root_metadata(&self) -> Result<Metadata, ReadError> {
        Ok(self.directory.dir_metadata()?)
    }

    pub(crate) fn read_snapshot(
        &self,
        relative: &Path,
    ) -> Result<(Vec<Value>, Metadata, Metadata, bool), ReadError> {
        let (mut file, before) = self.open_session(relative)?;
        let mut entries = Vec::new();
        let mut total = 0;
        let complete = scan(&mut file, self.limits, &mut total, true, |entry| {
            entries.push(entry)
        })?;
        let after = file.metadata()?;
        Ok((entries, before, after, complete))
    }

    pub fn discover(&self) -> Result<Discovery, ReadError> {
        self.discover_inner(false)
    }

    pub(crate) fn discover_for_bridge(&self) -> Result<Discovery, ReadError> {
        self.discover_inner(true)
    }

    fn discover_inner(&self, compatibility: bool) -> Result<Discovery, ReadError> {
        let mut result = Discovery {
            bytes_read: 0,
            sessions: Vec::new(),
            skipped: Vec::new(),
        };
        let mut scanned = 0;
        let mut candidates = 0;
        let mut total = 0;
        // Capture opened-handle mtimes once. Sorting must not restat ambient paths.
        let mut sessions = Vec::new();
        for group in self.directory.entries()? {
            count_entry(&mut scanned, self.limits.max_directory_entries)?;
            let group = group?;
            if !group.file_type()?.is_dir() {
                continue;
            }
            let name = group.file_name();
            if name.to_str().is_none() {
                result
                    .skipped
                    .push("non-UTF8 group name unsupported".into());
                continue;
            }
            let directory = match self.directory.open_dir_nofollow(Path::new(&name)) {
                Ok(directory) => directory,
                Err(error) => {
                    result
                        .skipped
                        .push(format!("{}: {error}", name.to_string_lossy()));
                    continue;
                }
            };
            for file in directory.entries()? {
                count_entry(&mut scanned, self.limits.max_directory_entries)?;
                let file = file?;
                let relative = PathBuf::from(&name).join(file.file_name());
                if relative.to_str().is_none() {
                    result
                        .skipped
                        .push("non-UTF8 session name unsupported".into());
                    continue;
                }
                if relative.extension().is_none_or(|ext| ext != "jsonl") {
                    continue;
                }
                candidates += 1;
                if candidates > self.limits.max_sessions {
                    return Err(ReadError::Limit("session count"));
                }
                let mut summary = None;
                let mut saw_header = false;
                let mut qualifier = crate::persistent::Qualifier::new();
                let outcome = self
                    .open_source(&relative)
                    .and_then(|(mut file, metadata)| {
                        // Metadata can reject a large candidate before decoding any of it.
                        let mut tail = SidebarTail::new(metadata.len());
                        let scan = if metadata.len() > self.limits.max_file_bytes {
                            Err(ReadError::Limit("file bytes"))
                        } else if metadata.len() > self.limits.max_total_bytes.saturating_sub(total)
                        {
                            Err(ReadError::Limit("total bytes"))
                        } else {
                            scan_with_tail(
                                &mut file,
                                self.limits,
                                &mut total,
                                false,
                                Some(&mut tail),
                                |entry| {
                                    qualifier.push(&entry);
                                    if !truthy(&entry) {
                                        return;
                                    }
                                    if !saw_header {
                                        saw_header = true;
                                        summary = SummaryBuilder::new(entry);
                                    } else if let Some(summary) = &mut summary {
                                        summary.push(entry);
                                    }
                                },
                            )
                        };
                        let complete = match scan {
                            Err(ReadError::Limit(_)) if compatibility => false,
                            other => other?,
                        };

                        let after = file.metadata()?;
                        use cap_fs_ext::MetadataExt;
                        if metadata.dev() != after.dev()
                            || metadata.ino() != after.ino()
                            || metadata.len() != after.len()
                            || metadata.modified().ok() != after.modified().ok()
                        {
                            return Err(ReadError::Io(io::Error::other(
                                "session changed during discovery",
                            )));
                        }
                        let metadata = after;
                        let modified = modified(&metadata);
                        let sort_time = metadata.modified().ok().map(|time| time.into_std());
                        Ok((
                            summary.take().and_then(|summary| {
                                summary.finish(&self.display_root.join(&relative), modified)
                            }),
                            sort_time,
                            metadata,
                            complete && qualifier.eligible(),
                            tail.metadata(),
                        ))
                    });
                match outcome {
                    Ok((Some(summary), modified, metadata, native_eligible, sidebar)) => sessions
                        .push((
                            SessionInfo {
                                relative_path: relative,
                                summary,
                                opened_metadata: metadata,
                                native_eligible,
                                sidebar,
                            },
                            modified,
                        )),
                    // The streaming adapter applies Pi's original parsing rules to
                    // sources outside this bounded native decoder. Grant only a
                    // verified regular file, and never retry a confinement error.
                    Ok((None, _, metadata, _, _)) if compatibility => {
                        let path = self.display_root.join(&relative);
                        sessions.push((
                            SessionInfo {
                                relative_path: relative,
                                summary: serde_json::json!({"path":path}),
                                opened_metadata: metadata,
                                native_eligible: false,
                                sidebar: Value::Null,
                            },
                            None,
                        ));
                    }
                    Ok((None, _, _, _, _)) => result
                        .skipped
                        .push(format!("{}: invalid session summary", relative.display())),
                    Err(ReadError::Limit("total bytes")) => {
                        return Err(ReadError::Limit("total bytes"))
                    }
                    Err(error) => result
                        .skipped
                        .push(format!("{}: {error}", relative.display())),
                }
            }
        }
        // Matches legacy ASCII tie behavior. Locale-dependent ordering is still
        // an explicit Pi compatibility gap, not hidden behind a confinement claim.
        sessions.sort_by(|(a, ma), (b, mb)| {
            mb.cmp(ma).then_with(|| {
                b.relative_path
                    .file_name()
                    .cmp(&a.relative_path.file_name())
            })
        });
        sessions.sort_by_key(|(session, _)| {
            std::cmp::Reverse(session.summary["modified"].as_i64().unwrap_or(0))
        });
        result.bytes_read = total;
        result.sessions = sessions.into_iter().map(|(session, _)| session).collect();
        Ok(result)
    }
}

fn count_entry(count: &mut usize, limit: usize) -> Result<(), ReadError> {
    *count += 1;
    if *count > limit {
        return Err(ReadError::Limit("directory entries"));
    }
    Ok(())
}
pub(crate) fn modified(metadata: &Metadata) -> Option<i64> {
    metadata
        .modified()
        .ok()
        .and_then(|t| match t.into_std().duration_since(UNIX_EPOCH) {
            Ok(duration) => i64::try_from(duration.as_millis()).ok(),
            Err(error) => i64::try_from(error.duration().as_millis())
                .ok()?
                .checked_neg(),
        })
}

/// Charge actual underlying reads, including BufReader read-ahead discarded when
/// a candidate later fails a line/parse budget. Otherwise many rejected files
/// could consume unaccounted input across a catalog scan.
struct BudgetReader<'a> {
    file: &'a mut File,
    total: &'a mut u64,
    file_bytes: u64,
    limits: ReadLimits,
    exceeded: Option<&'static str>,
}
impl Read for BudgetReader<'_> {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        if bytes.is_empty() || self.exceeded.is_some() {
            return Ok(0);
        }
        let aggregate_left = self.limits.max_total_bytes.saturating_sub(*self.total);
        if aggregate_left == 0 {
            // Resolve exact EOF from this descriptor without consuming a byte
            // beyond the aggregate allowance, even if it grew after discovery.
            if self.file.metadata()?.len() > self.file_bytes {
                self.exceeded = Some("total bytes");
            }
            return Ok(0);
        }
        let file_left = self.limits.max_file_bytes.saturating_sub(self.file_bytes);
        let length = bytes
            .len()
            .min((file_left + 1).min(aggregate_left) as usize);
        let read = self.file.read(&mut bytes[..length])?;
        self.file_bytes += read as u64;
        *self.total += read as u64;
        self.exceeded = if *self.total > self.limits.max_total_bytes {
            Some("total bytes")
        } else if self.file_bytes > self.limits.max_file_bytes {
            Some("file bytes")
        } else {
            None
        };
        Ok(read)
    }
}

// Match the desktop sidebar's byte-based tail, including dropping the first
// newline-terminated fragment when the original file exceeds the window.
struct SidebarTail {
    skip: Option<u64>,
    valid: bool,
    seen: std::collections::HashSet<String>,
    history: Vec<Value>,
    last: Value,
}
impl SidebarTail {
    const LIMIT: usize = 512 * 1024;
    fn new(size: u64) -> Self {
        let skip = size.saturating_sub(Self::LIMIT as u64);
        Self {
            skip: (skip > 0).then_some(skip),
            valid: true,
            seen: Default::default(),
            history: Vec::new(),
            last: serde_json::json!({"status":"idle"}),
        }
    }

    fn includes_line(&mut self, line: &[u8]) -> bool {
        let Some(skip) = self.skip else {
            return self.valid;
        };
        if skip >= line.len() as u64 {
            self.skip = Some(skip - line.len() as u64);
            return false;
        }
        self.skip = None;
        if !line.ends_with(b"\n") {
            // No newline after the cutoff: JS slice(indexOf('\n') + 1) starts
            // at zero, so even a suffix of an otherwise invalid line may parse.
            let suffix = &line[skip as usize..];
            if suffix.len() <= Self::LIMIT {
                let text = String::from_utf8_lossy(suffix);
                if let Ok(entry) = crate::parse_js_json(text.as_bytes()) {
                    self.push(&entry);
                }
            }
        }
        false
    }

    fn push(&mut self, entry: &Value) {
        if entry.is_null() || (entry["type"] == "message" && entry["message"].is_null()) {
            // The desktop helper catches the property-access error for the whole tail.
            self.valid = false;
            return;
        }
        let msg = &entry["message"];
        if entry["type"] != "message" || msg["role"] != "assistant" {
            return;
        }
        let provider = &msg["provider"];
        if truthy(provider)
            && (provider.is_object()
                || provider.is_array()
                || self.seen.insert(provider.to_string()))
        {
            self.history.push(provider.clone());
        }
        let failed = matches!(
            msg["stopReason"].as_str(),
            Some("error" | "aborted" | "length")
        );
        self.last = serde_json::json!({"status":if failed { "failed" } else { "done" }});
        for (field, key) in [
            ("provider", "provider"),
            ("model", "model"),
            ("error", "errorMessage"),
        ] {
            if let Some(value) = msg.get(key) {
                self.last[field] = value.clone();
            }
        }
    }

    fn metadata(mut self) -> Value {
        if !self.valid {
            return serde_json::json!({});
        }
        self.last["providerHistory"] = Value::Array(self.history);
        self.last
    }
}

fn scan(
    file: &mut File,
    limits: ReadLimits,
    total: &mut u64,
    strict: bool,
    record: impl FnMut(Value),
) -> Result<bool, ReadError> {
    scan_with_tail(file, limits, total, strict, None, record)
}

fn scan_with_tail(
    file: &mut File,
    limits: ReadLimits,
    total: &mut u64,
    strict: bool,
    mut tail: Option<&mut SidebarTail>,
    mut record: impl FnMut(Value),
) -> Result<bool, ReadError> {
    let mut complete = true;
    // One extra byte distinguishes an exact-boundary EOF from an oversized input.
    let mut reader = BufReader::new(BudgetReader {
        file,
        total,
        file_bytes: 0,
        limits,
        exceeded: None,
    });
    let mut line = Vec::new();
    let mut number = 0;
    loop {
        line.clear();
        let read = (&mut reader)
            .take(limits.max_line_bytes + 1)
            .read_until(b'\n', &mut line)?;
        if let Some(limit) = reader.get_ref().exceeded {
            return Err(ReadError::Limit(limit));
        }
        if read == 0 {
            return Ok(complete);
        }
        if read as u64 > limits.max_line_bytes {
            return Err(ReadError::Limit("line bytes"));
        }
        number += 1;
        if number > limits.max_lines {
            return Err(ReadError::Limit("line count"));
        }
        let sidebar = tail.as_deref_mut().filter(|tail| tail.valid);
        let sidebar = sidebar.and_then(|tail| tail.includes_line(&line).then_some(tail));
        if std::str::from_utf8(&line).is_err() {
            complete = false;
        }
        let text = if strict {
            std::str::from_utf8(&line)
                .map_err(|_| ReadError::InvalidUtf8(number))?
                .into()
        } else {
            String::from_utf8_lossy(&line)
        };
        if text.trim().is_empty() {
            continue;
        }
        match crate::parse_js_json(text.as_bytes()) {
            Ok(value) => {
                if let Some(sidebar) = sidebar {
                    sidebar.push(&value);
                }
                record(value);
            }
            Err(_) if strict && line.ends_with(b"\n") => {
                return Err(ReadError::InvalidJson(number))
            }
            // read_until only returns a non-newline record at EOF. Artificial
            // byte/line truncation has already failed the budget checks above.
            Err(_) => {
                complete = false;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn rejected_candidates_charge_buffered_read_ahead_to_the_total() {
        let path = std::env::temp_dir().join(format!(
            "suffice-read-ahead-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = "{}\n".repeat(100);
        std::fs::write(&path, &source).unwrap();
        let mut file = File::from_std(std::fs::File::open(&path).unwrap());
        let mut total = 0;
        let result = scan(
            &mut file,
            ReadLimits {
                max_lines: 1,
                ..ReadLimits::default()
            },
            &mut total,
            true,
            |_| {},
        );
        assert!(matches!(result, Err(ReadError::Limit("line count"))));
        assert_eq!(
            total,
            source.len() as u64,
            "prefetched bytes remain charged even though the second line rejects this candidate"
        );
        drop(file);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn aggregate_limit_charges_no_extra_sentinel_when_a_file_grows() {
        let path =
            std::env::temp_dir().join(format!("suffice-aggregate-growth-{}", std::process::id()));
        std::fs::write(&path, "{}\n").unwrap();
        let mut file = File::from_std(std::fs::File::open(&path).unwrap());
        let mut total = 0;
        let result = scan(
            &mut file,
            ReadLimits {
                max_total_bytes: 3,
                ..ReadLimits::default()
            },
            &mut total,
            true,
            |_| {
                std::fs::OpenOptions::new()
                    .append(true)
                    .open(&path)
                    .unwrap()
                    .write_all(b"{}\n")
                    .unwrap();
            },
        );
        assert!(matches!(result, Err(ReadError::Limit("total bytes"))));
        assert_eq!(total, 3);
        drop(file);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn file_growth_after_metadata_still_stops_at_the_stream_budget() {
        let root = std::env::temp_dir().join(format!(
            "suffice-growth-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("group")).unwrap();
        let path = root.join("group/file.jsonl");
        std::fs::write(&path, "{}\n").unwrap();
        let limits = ReadLimits {
            max_file_bytes: 3,
            ..ReadLimits::default()
        };
        let store = SessionStore::open(&root, limits).unwrap();
        let (mut file, metadata) = store.open_session(Path::new("group/file.jsonl")).unwrap();
        assert_eq!(metadata.len(), 3);
        let mut appended = false;
        let mut total = 0;
        let result = scan(&mut file, limits, &mut total, true, |_| {
            if !appended {
                std::fs::OpenOptions::new()
                    .append(true)
                    .open(&path)
                    .unwrap()
                    .write_all(b"{}\n")
                    .unwrap();
                appended = true;
            }
        });
        assert!(matches!(result, Err(ReadError::Limit("file bytes"))));
        assert!(
            total <= 4,
            "at most one sentinel byte crosses the input budget"
        );
        drop(file);
        drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }
}
