//! Capability-bound, read-only browsing. Windows ReFS has 128-bit file IDs;
//! cap-fs-ext currently exposes only 64 bits, so this identity check is not a
//! complete ReFS identity guarantee. Resume remains subject to a subsequent
//! pathname-open TOCTOU in Pi.
use crate::{desktop_messages, saved_usage, ReadLimits, SessionStore};
use cap_fs_ext::MetadataExt;
use cap_std::fs::Metadata;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::UNIX_EPOCH,
};

static NEXT: AtomicU64 = AtomicU64::new(1);
fn nonce() -> String {
    format!(
        "{:x}-{:x}-{:x}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct Identity {
    dev: u64,
    ino: u64,
    size: u64,
    modified: Option<(bool, u64, u32)>,
}
impl Identity {
    fn of(m: &Metadata) -> Self {
        Self {
            dev: m.dev(),
            ino: m.ino(),
            size: m.len(),
            modified: m
                .modified()
                .ok()
                .map(|x| match x.into_std().duration_since(UNIX_EPOCH) {
                    Ok(duration) => (false, duration.as_secs(), duration.subsec_nanos()),
                    Err(error) => {
                        let duration = error.duration();
                        (true, duration.as_secs(), duration.subsec_nanos())
                    }
                }),
        }
    }
    fn object(&self) -> (u64, u64) {
        (self.dev, self.ino)
    }
    fn version(&self) -> String {
        format!(
            "{:x}:{:x}:{:x}:{:?}",
            self.dev, self.ino, self.size, self.modified
        )
    }
}
struct Item {
    path: PathBuf,
    identity: Identity,
    eligible: bool,
    resume_qualified: bool,
}
pub struct PersistentReader {
    root: PathBuf,
    store: Option<SessionStore>,
    root_id: Option<(u64, u64)>,
    revision: String,
    items: HashMap<String, Item>,
    closed: bool,
    catalog_limit: u64,
    catalog_remaining: u64,
}
impl PersistentReader {
    pub fn is_closed(&self) -> bool {
        self.closed
    }
    pub fn new(root: PathBuf) -> Result<Self, String> {
        Self::with_catalog_limit(root, ReadLimits::default().max_total_bytes)
    }
    pub fn with_catalog_limit(root: PathBuf, catalog_limit: u64) -> Result<Self, String> {
        if catalog_limit == 0 || catalog_limit > ReadLimits::default().max_total_bytes {
            return Err("invalid catalog byte limit".into());
        }
        if !root.is_absolute() {
            return Err("sessions root must be absolute".into());
        }
        Ok(Self {
            root,
            store: None,
            root_id: None,
            revision: nonce(),
            items: HashMap::new(),
            closed: false,
            catalog_limit,
            catalog_remaining: 0,
        })
    }
    fn revoke(&mut self) {
        self.closed = true;
        self.items.clear();
        self.store = None;
    }
    pub fn close(&mut self) {
        self.revoke();
    }
    pub fn reopen(&mut self) {
        self.revoke();
        self.root_id = None;
        self.closed = false;
        self.revision = nonce();
    }
    pub fn reopen_validated(&mut self) -> Result<(), String> {
        self.revoke();
        self.closed = false;
        self.revision = nonce();
        if let Err(error) = self.check_root() {
            self.revoke();
            return Err(error);
        }
        Ok(())
    }
    fn check_root(&mut self) -> Result<bool, String> {
        if self.closed {
            return Err("reader closed".into());
        }
        let fresh = match SessionStore::open(
            &self.root,
            ReadLimits {
                max_total_bytes: self.catalog_limit,
                ..ReadLimits::default()
            },
        ) {
            Ok(s) => s,
            Err(crate::ReadError::Io(e))
                if e.kind() == std::io::ErrorKind::NotFound && self.root_id.is_none() =>
            {
                return Ok(false)
            }
            Err(e) => {
                self.revoke();
                return Err(format!("root changed: {e}"));
            }
        };
        let id = Identity::of(&fresh.root_metadata().map_err(|e| e.to_string())?).object();
        if let Some(old) = self.root_id {
            if old != id {
                self.revoke();
                return Err("root identity changed".into());
            }
        }
        self.root_id = Some(id);
        if self.store.is_none() {
            self.store = Some(fresh);
        }
        Ok(true)
    }
    fn checked(&mut self, path: &Path, expected: &Identity) -> Result<Identity, String> {
        self.check_root()?;
        let check = (|| {
            let store = self.store.as_ref().ok_or("missing root")?;
            let (_, cap) = store.open_source(path).map_err(|e| e.to_string())?;
            let ambient =
                SessionStore::open(&self.root, ReadLimits::default()).map_err(|e| e.to_string())?;
            if Some(Identity::of(&ambient.root_metadata().map_err(|e| e.to_string())?).object())
                != self.root_id
            {
                return Err("root identity changed".into());
            }
            let (_, current) = ambient.open_source(path).map_err(|e| e.to_string())?;
            let cap = Identity::of(&cap);
            let current = Identity::of(&current);
            if cap.object() != expected.object() || current.object() != expected.object() {
                return Err("file identity changed".to_string());
            }
            if cap != current {
                return Err("file changed during identity check".to_string());
            }
            Ok(current)
        })();
        if check
            .as_ref()
            .is_err_and(|e| !e.contains("during identity check"))
        {
            self.revoke();
        }
        check
    }
    pub fn list(&mut self) -> Result<Value, String> {
        if !self.check_root()? {
            self.items.clear();
            self.revision = nonce();
            return Ok(json!({"revision":self.revision,"sessions":[],"skipped":[],"bytesRead":0}));
        }
        self.items.clear();
        let discovery = self
            .store
            .as_ref()
            .unwrap()
            .discover_for_bridge()
            .map_err(|e| e.to_string())?;
        self.catalog_remaining = self.catalog_limit.saturating_sub(discovery.bytes_read);
        let mut sessions = Vec::new();
        let mut skipped = discovery.skipped;
        for item in discovery.sessions {
            let Some(relative) = item.relative_path.to_str() else {
                skipped.push("non-UTF8 session path unsupported".to_owned());
                continue;
            };
            let relative = relative.to_owned();
            let (file, meta) = match self
                .store
                .as_ref()
                .unwrap()
                .open_source(&item.relative_path)
            {
                Ok(v) => v,
                Err(e) => {
                    skipped.push(format!("{relative}: {e}"));
                    continue;
                }
            };
            drop(file);
            let id = Identity::of(&meta);
            let seen = Identity::of(&item.opened_metadata);
            if id.object() != seen.object() {
                self.revoke();
                return Err("file identity changed since discovery".into());
            }
            if id != seen {
                skipped.push(format!("{relative}: file changed since discovery"));
                continue;
            }
            if self.checked(&item.relative_path, &id)? != id {
                skipped.push(format!("{relative}: file changed since discovery"));
                continue;
            }
            let eligible = item.native_eligible;
            let token = nonce();
            let version = id.version();
            let mut summary = item.summary;
            if let Some(object) = summary.as_object_mut() {
                object.remove("allMessagesText");
                if let Some(Value::String(first)) = object.get_mut("firstMessage") {
                    *first = first.chars().take(90).collect();
                }
            }
            sessions.push(json!({"token":token,"relativePath":relative,"summary":summary,"mtime":crate::store::modified(&meta),"sidebar":item.sidebar,"version":version,"identityToken":format!("{:x}:{:x}",id.dev,id.ino),"byteLength":id.size,"nativeEligible":eligible,"unsupportedReason":if eligible {Value::Null} else {json!("session format not qualified for native projection")}}));
            self.items.insert(
                token,
                Item {
                    path: item.relative_path,
                    identity: id,
                    eligible,
                    resume_qualified: eligible,
                },
            );
        }
        self.check_root()?;
        self.revision = nonce();
        Ok(
            json!({"revision":self.revision,"sessions":sessions,"skipped":skipped,"bytesRead":discovery.bytes_read}),
        )
    }
    fn resolve(&self, request: &Value) -> Result<(PathBuf, Identity, bool), String> {
        if self.closed {
            return Err("reader closed".into());
        }
        if request["revision"].as_str() != Some(&self.revision) {
            return Err("stale revision".into());
        }
        let item = self
            .items
            .get(request["token"].as_str().ok_or("missing token")?)
            .ok_or("unknown token")?;
        Ok((item.path.clone(), item.identity.clone(), item.eligible))
    }
    pub fn read_view(&mut self, request: &Value) -> Result<Value, String> {
        let (path, id, eligible) = self.resolve(request)?;
        let current = self.checked(&path, &id)?;
        let version = current.version();
        if !eligible {
            return Err("unsupported native session view".into());
        }
        if current == id && request["ifVersion"].as_str() == Some(&version) {
            if self.checked(&path, &id)? != current {
                return Err("file changed during cache check".into());
            }
            return Ok(json!({"notModified":true,"version":version,"byteLength":current.size}));
        }
        let snapshot = self.store.as_ref().unwrap().read_snapshot(&path);
        let (entries, before, after, complete) = match snapshot {
            Ok(value) => value,
            Err(
                crate::ReadError::Limit(_)
                | crate::ReadError::InvalidJson(_)
                | crate::ReadError::InvalidUtf8(_),
            ) => {
                if self.checked(&path, &id)? != current {
                    return Err("session changed during read".into());
                }
                return Ok(
                    json!({"compatibility":true,"version":version,"byteLength":current.size}),
                );
            }
            Err(error) => {
                self.checked(&path, &id)?;
                return Err(error.to_string());
            }
        };
        let before = Identity::of(&before);
        let after = Identity::of(&after);
        if before.object() != id.object() || after.object() != id.object() {
            self.revoke();
            return Err("file identity changed during read".into());
        }
        if before != current || after != current {
            return Err("file changed during read".into());
        }
        if !complete || !qualified(&entries) {
            return Ok(json!({"compatibility":true,"version":version,"byteLength":current.size}));
        }
        if self.checked(&path, &id)? != current {
            return Err("file changed during read".into());
        }
        let messages = desktop_messages(&entries, None)?;
        let usage = saved_usage(&entries, None);
        if self.checked(&path, &id)? != current {
            return Err("file changed during projection".into());
        }
        // Only a completed qualification can advance the version eligible for
        // a future handoff. A metadata-only location/cache check cannot.
        if let Some(item) = request["token"]
            .as_str()
            .and_then(|token| self.items.get_mut(token))
        {
            item.identity = current.clone();
        }
        let usage_model = messages
            .as_array()
            .and_then(|m| m.iter().rev().find(|m| m["role"] == "assistant"))
            .map(|m| json!({"provider":m.get("provider"),"model":m.get("model")}));
        Ok(
            json!({"notModified":false,"version":version,"byteLength":current.size,"messages":messages,"usage":usage,"usageModel":usage_model}),
        )
    }
    pub fn source_info(&mut self, request: &Value) -> Result<Value, String> {
        let (path, id, _) = self.resolve(request)?;
        let current = self.checked(&path, &id)?;
        Ok(json!({"version":current.version(),"byteLength":current.size}))
    }

    /// One bounded binary page from the retained directory. Both the actual
    /// descriptor and the catalog location must still identify the same version.
    pub fn source_chunk(&mut self, request: &Value) -> Result<Vec<u8>, String> {
        use std::io::{Read, Seek, SeekFrom};
        const PAGE: u64 = 1024 * 1024;
        let (path, id, _) = self.resolve(request)?;
        let current = self.checked(&path, &id)?;
        if request["version"].as_str() != Some(&current.version()) {
            return Err("session changed during compatibility read".into());
        }
        let offset = request["offset"]
            .as_u64()
            .filter(|n| *n <= current.size)
            .ok_or("invalid session page offset")?;
        if current.size > ReadLimits::default().max_total_bytes {
            return Err("saved journal exceeds the 256 MiB compatibility limit".into());
        }
        let size = PAGE.min(current.size - offset);
        match request["purpose"].as_str() {
            Some("catalog") => {
                self.catalog_remaining = self
                    .catalog_remaining
                    .checked_sub(size)
                    .ok_or("catalog byte allowance exhausted")?;
            }
            Some("selection") => {}
            _ => return Err("unknown session read purpose".into()),
        }
        let (mut file, before) = self
            .store
            .as_ref()
            .unwrap()
            .open_source(&path)
            .map_err(|e| e.to_string())?;
        if Identity::of(&before) != current {
            self.revoke();
            return Err("file identity changed during compatibility read".into());
        }
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| e.to_string())?;
        let mut bytes = vec![0; size as usize];
        file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
        if Identity::of(&file.metadata().map_err(|e| e.to_string())?) != current
            || self.checked(&path, &id)? != current
        {
            return Err("session changed during compatibility read".into());
        }
        Ok(bytes)
    }

    /// Trusted host acknowledgment after the original projection completed.
    pub fn accept_view(&mut self, request: &Value) -> Result<Value, String> {
        let (path, id, _) = self.resolve(request)?;
        let current = self.checked(&path, &id)?;
        if request["version"].as_str() != Some(&current.version()) {
            return Err("session changed during compatibility projection".into());
        }
        let item = self
            .items
            .get_mut(request["token"].as_str().unwrap())
            .unwrap();
        item.identity = current;
        item.resume_qualified = true;
        item.eligible = false;
        Ok(json!({}))
    }

    pub fn location(&mut self, request: &Value) -> Result<Value, String> {
        self.verified_location(request, false)
    }
    pub fn prepare_resume(&mut self, request: &Value) -> Result<Value, String> {
        self.verified_location(request, true)
    }
    fn verified_location(&mut self, request: &Value, consume: bool) -> Result<Value, String> {
        let (path, id, _) = self.resolve(request)?;
        let current = self.checked(&path, &id)?;
        if consume && !self.items[request["token"].as_str().unwrap()].resume_qualified {
            return Err("session format not qualified for native resume".into());
        }
        if consume && current != id {
            return Err("session changed since qualification; refresh the saved view".into());
        }
        let root_id = self.root_id;
        let absolute = std::fs::canonicalize(self.root.join(&path)).map_err(|e| e.to_string())?;
        if consume {
            self.revoke();
        }
        let result = self.location_receipt(&path, &current, root_id, &absolute);
        if result.is_err() {
            self.revoke();
        }
        result
    }
    fn location_receipt(
        &self,
        path: &Path,
        current: &Identity,
        root_id: Option<(u64, u64)>,
        absolute: &Path,
    ) -> Result<Value, String> {
        let fresh =
            SessionStore::open(&self.root, ReadLimits::default()).map_err(|e| e.to_string())?;
        if Some(Identity::of(&fresh.root_metadata().map_err(|e| e.to_string())?).object())
            != root_id
        {
            return Err("root identity changed".into());
        }
        if std::fs::canonicalize(self.root.join(path)).map_err(|e| e.to_string())? != absolute {
            return Err("resume path changed".into());
        }
        let (_, meta) = fresh.open_source(path).map_err(|e| e.to_string())?;
        if Identity::of(&meta) != *current {
            return Err("file identity changed".into());
        }
        let file = cap_std::fs::File::open_ambient(absolute, cap_std::ambient_authority())
            .map_err(|e| e.to_string())?;
        if Identity::of(&file.metadata().map_err(|e| e.to_string())?) != *current {
            return Err("canonical path identity changed".into());
        }
        let s = absolute.to_str().ok_or("non-UTF8 path")?;
        let public = if cfg!(windows) {
            windows_public_path(s)
        } else {
            s.to_owned()
        };
        let public_file = cap_std::fs::File::open_ambient(&public, cap_std::ambient_authority())
            .map_err(|e| e.to_string())?;
        if Identity::of(&public_file.metadata().map_err(|e| e.to_string())?) != *current {
            return Err("public resume path identity changed".into());
        }
        Ok(
            json!({"absolutePath":public,"version":current.version(),"identityToken":format!("{:x}:{:x}",current.dev,current.ino)}),
        )
    }
}

/// Poison recovery is only permitted for revocation, never for continuing a
/// potentially interrupted reader operation. Callers reject work until reopen.
pub fn close_recovering(reader: &std::sync::Mutex<PersistentReader>) {
    let mut guard = reader
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    guard.close();
    drop(guard);
    reader.clear_poison();
}
pub(crate) struct Qualifier {
    count: usize,
    valid: bool,
}
impl Qualifier {
    pub(crate) fn new() -> Self {
        Self {
            count: 0,
            valid: true,
        }
    }
    pub(crate) fn eligible(&self) -> bool {
        self.valid && self.count > 0
    }
    pub(crate) fn push(&mut self, e: &Value) {
        fn canonical(v: &Value) -> bool {
            v.as_str().is_some_and(|s| {
                s.len() == 24
                    && s.ends_with('Z')
                    && s.as_bytes().get(10) == Some(&b'T')
                    && time::OffsetDateTime::parse(
                        s,
                        &time::format_description::well_known::Rfc3339,
                    )
                    .is_ok()
            })
        }
        fn stock_message(message: &Value) -> bool {
            let standard_role = matches!(
                message["role"].as_str(),
                Some("user" | "assistant" | "toolResult" | "system")
            );
            // Rust's summary truncates timestamps to milliseconds before taking
            // the maximum. Let V8 handle submilliseconds and out-of-Date-range values.
            let standard_time = message["timestamp"]
                .as_f64()
                .is_none_or(|n| n.fract() == 0.0 && n.abs() <= 8_640_000_000_000_000.0);
            let standard_content = message["content"].is_string()
                || message["content"].as_array().is_some_and(|blocks| {
                    blocks.iter().all(|block| {
                        block.is_object() && (block["type"] != "text" || block["text"].is_string())
                    })
                });
            standard_role && standard_time && standard_content
        }
        let first = self.count == 0;
        self.count += 1;
        let kind = e["type"].as_str().unwrap_or("");
        let known = matches!(
            kind,
            "message"
                | "custom"
                | "custom_message"
                | "session_info"
                | "thinking_level_change"
                | "model_change"
                | "compaction"
                | "branch_summary"
                | "context_edit"
                | "label"
        );
        let valid = if first {
            kind == "session"
                && e["version"].as_f64() == Some(3.0)
                && e["id"].is_string()
                && canonical(&e["timestamp"])
        } else {
            known
                && e["id"].is_string()
                && (e["parentId"].is_null() || e["parentId"].is_string())
                && canonical(&e["timestamp"])
                && (kind != "message" || stock_message(&e["message"]))
                && (kind != "session_info"
                    || e["name"]
                        .as_str()
                        .is_none_or(|name| !name.contains(['\u{feff}', '\u{85}'])))
        };
        self.valid &= valid;
    }
}
// Node's realpath uses ordinary drive/UNC spelling for these paths. Preserve
// other device namespaces; the caller revalidates the converted path's file ID.
fn windows_public_path(path: &str) -> String {
    if let Some(unc) = path.strip_prefix("\\\\?\\UNC\\") {
        return format!("\\\\{unc}");
    }
    if let Some(drive) = path.strip_prefix("\\\\?\\") {
        let bytes = drive.as_bytes();
        if bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && bytes[2] == b'\\'
        {
            return drive.to_owned();
        }
    }
    path.to_owned()
}

fn qualified(entries: &[Value]) -> bool {
    let mut q = Qualifier::new();
    for e in entries {
        q.push(e);
    }
    q.eligible()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn node_interop_only_simplifies_drive_and_unc_namespaces() {
        assert_eq!(
            windows_public_path(r"\\?\C:\home\saved.jsonl"),
            r"C:\home\saved.jsonl"
        );
        assert_eq!(
            windows_public_path(r"\\?\UNC\server\share\saved.jsonl"),
            r"\\server\share\saved.jsonl"
        );
        assert_eq!(
            windows_public_path(r"\\?\Volume{example}\saved.jsonl"),
            r"\\?\Volume{example}\saved.jsonl"
        );
        assert_eq!(windows_public_path("/tmp/saved.jsonl"), "/tmp/saved.jsonl");
    }
    #[test]
    fn cleanup_recovers_poisoned_reader_by_revoking_and_releasing_handles() {
        use std::sync::{Arc, Mutex};
        let root = std::env::temp_dir().join(format!(
            "suffice-poison-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let mut core = PersistentReader::new(root.clone()).unwrap();
        core.list().unwrap();
        let shared = Arc::new(Mutex::new(core));
        let worker = shared.clone();
        assert!(std::thread::spawn(move || {
            let _held = worker.lock().unwrap();
            panic!("synthetic worker failure");
        })
        .join()
        .is_err());
        assert!(shared.is_poisoned());
        close_recovering(&shared);
        assert!(!shared.is_poisoned());
        assert!(shared.lock().unwrap().is_closed());
        std::fs::rename(&root, root.with_extension("released")).unwrap();
        std::fs::remove_dir_all(root.with_extension("released")).unwrap();
    }
}
