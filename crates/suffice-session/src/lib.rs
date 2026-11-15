use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    time::UNIX_EPOCH,
};
use time::{format_description::well_known::Rfc3339, Date, OffsetDateTime};

mod store;
pub use store::{Discovery, ReadError, ReadLimits, SessionInfo, SessionStore};

fn timestamp(v: Option<&Value>) -> Option<i64> {
    let v = v?;
    if v.is_null() {
        return Some(0);
    }
    if let Some(n) = v.as_f64() {
        return (n.is_finite() && n.abs() <= 8_640_000_000_000_000.0).then_some(n.trunc() as i64);
    }
    if let Some(b) = v.as_bool() {
        return Some(i64::from(b));
    }
    // Pi constructs these timestamps with `new Date(value).getTime()`.  This is
    // intentionally not a general JavaScript Date parser: JSON objects stringify
    // to "[object Object]" (invalid), and only a one-item string array has a
    // useful, stable JSON representation for this read-only boundary.
    if let Some(values) = v.as_array() {
        return match values.as_slice() {
            [value @ Value::String(_)] => timestamp(Some(value)),
            _ => None,
        };
    }
    if v.is_object() {
        return None;
    }
    let s = v.as_str()?;
    if let Ok(t) = OffsetDateTime::parse(s, &Rfc3339) {
        return i64::try_from(t.unix_timestamp_nanos().div_euclid(1_000_000)).ok();
    }
    let format = time::format_description::parse_borrowed::<2>("[year]-[month]-[day]").ok()?;
    Date::parse(s, &format)
        .ok()
        .map(|d| d.midnight().assume_utc().unix_timestamp() * 1000)
}

fn integer_index(key: &str) -> Option<u32> {
    if key.is_empty() || (key.len() > 1 && key.starts_with('0')) {
        return None;
    }
    let value = key.parse::<u64>().ok()?;
    // ECMAScript array-index keys are canonical decimal strings in this range.
    (value < u64::from(u32::MAX) && value.to_string() == key).then_some(value as u32)
}

/// Reorder object keys as JavaScript JSON.stringify would enumerate them:
/// integer-index keys first in ascending order, then all other keys by insertion
/// order. serde_json preserves source insertion order, so this only changes the
/// wire representation, not the parsed projection values.
pub fn javascript_json_order(value: &mut Value) {
    match value {
        Value::Array(items) => {
            for item in items {
                javascript_json_order(item);
            }
        }
        Value::Object(object) => {
            let mut indexes = Vec::new();
            let mut other = Vec::new();
            for (key, mut item) in std::mem::take(object) {
                javascript_json_order(&mut item);
                if let Some(index) = integer_index(&key) {
                    indexes.push((index, key, item));
                } else {
                    other.push((key, item));
                }
            }
            indexes.sort_by_key(|(index, _, _)| *index);
            for (_, key, item) in indexes {
                object.insert(key, item);
            }
            for (key, item) in other {
                object.insert(key, item);
            }
        }
        _ => {}
    }
}
fn kind(v: &Value) -> &str {
    v.get("type").and_then(Value::as_str).unwrap_or("")
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|x| x != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn key(v: Option<&Value>) -> String {
    v.map(|x| x.to_string())
        .unwrap_or_else(|| "<undefined>".into())
}

/// Strict desktop transcript parser: only an incomplete last non-newline record is ignored.
pub fn read_journal(source: &str) -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    let lines: Vec<_> = source.split('\n').collect();
    for (i, line) in lines.iter().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str(line) {
            Ok(entry) => out.push(entry),
            Err(_) if i + 1 == lines.len() && !source.ends_with('\n') => break,
            Err(_) => {
                return Err(format!(
                    "Saved transcript contains invalid JSON at line {}",
                    i + 1
                ))
            }
        }
    }
    Ok(out)
}

fn object_with(role: &str, entry: &Value, fields: &[&str]) -> Value {
    let mut obj = Map::new();
    obj.insert("role".into(), json!(role));
    for &field in fields {
        if let Some(v) = entry.get(field) {
            obj.insert(field.into(), v.clone());
        }
    }
    obj.insert(
        "timestamp".into(),
        timestamp(entry.get("timestamp")).map_or(Value::Null, |v| json!(v)),
    );
    Value::Object(obj)
}

fn model_from(entry: &Value, provider: &str, model_id: &str) -> Value {
    let mut model = Map::new();
    if let Some(value) = entry.get(provider) {
        model.insert("provider".into(), value.clone());
    }
    if let Some(value) = entry.get(model_id) {
        model.insert("modelId".into(), value.clone());
    }
    Value::Object(model)
}
fn entry_messages(e: &Value) -> Result<Vec<Value>, String> {
    let result = match kind(e) {
        "message" => {
            let mut m = e
                .get("message")
                .cloned()
                .filter(|m| !m.is_null())
                .ok_or("missing or null message")?;
            let role = m
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            if m.get("content").is_none_or(Value::is_null)
                && ["system", "user", "assistant", "toolResult"].contains(&role.as_str())
            {
                m["content"] = if role == "system" {
                    json!("")
                } else {
                    json!([])
                };
            }
            vec![m]
        }
        "custom_message" => {
            let mut m = object_with("custom", e, &["customType", "display", "details"]);
            m["content"] = e
                .get("content")
                .filter(|v| !v.is_null())
                .cloned()
                .unwrap_or(json!([]));
            vec![m]
        }
        "branch_summary" if truthy(&e["summary"]) => {
            vec![object_with("branchSummary", e, &["summary", "fromId"])]
        }
        "compaction" => {
            let mut v = Vec::new();
            if truthy(&e["systemMessage"]) {
                v.push(e["systemMessage"].clone());
            }
            v.push(object_with(
                "compactionSummary",
                e,
                &["summary", "tokensBefore"],
            ));
            v
        }
        _ => vec![],
    };
    Ok(result)
}

/// Pi projection. `leaf`: None = last, Some(null) = empty, otherwise explicit ID.
pub fn project(entries: &[Value], leaf: Option<&Value>) -> Result<Value, String> {
    if entries.iter().any(Value::is_null) {
        return Err("null entry".into());
    }
    if entries
        .iter()
        .any(|e| kind(e) == "message" && e.get("message").is_none_or(Value::is_null))
    {
        return Err("missing or null message".into());
    }
    let mut by_id = HashMap::new();
    for (i, e) in entries.iter().enumerate() {
        by_id.insert(key(e.get("id")), i);
    }
    let start = match leaf {
        Some(Value::Null) => None,
        Some(v) if truthy(v) => by_id
            .get(&key(Some(v)))
            .copied()
            .or_else(|| entries.len().checked_sub(1)),
        _ => entries.len().checked_sub(1),
    };
    let mut path = Vec::new();
    let mut current = start;
    let mut seen = HashSet::new();
    while let Some(i) = current {
        if !seen.insert(i) {
            return Err("Cycle in session parent chain".into());
        }
        path.push(i);
        current = entries[i]
            .get("parentId")
            .filter(|v| truthy(v))
            .and_then(|v| by_id.get(&key(Some(v))).copied());
    }
    path.reverse();
    let mut thinking = Some(json!("off"));
    let mut model = Value::Null;
    for &i in &path {
        let e = &entries[i];
        match kind(e) {
            "thinking_level_change" => thinking = e.get("thinkingLevel").cloned(),
            "model_change" => model = model_from(e, "provider", "modelId"),
            "message" if e["message"]["role"] == "assistant" => {
                model = model_from(&e["message"], "provider", "model")
            }
            _ => {}
        }
    }
    let context = if let Some(pos) = path
        .iter()
        .rposition(|&i| kind(&entries[i]) == "compaction")
    {
        let comp = path[pos];
        let mut retained = vec![comp];
        let mut found = false;
        for &i in &path[..pos] {
            if entries[i].get("id") == entries[comp].get("firstKeptEntryId") {
                found = true;
            }
            if found
                && !(kind(&entries[i]) == "message" && entries[i]["message"]["role"] == "system")
            {
                retained.push(i);
            }
        }
        retained.extend_from_slice(&path[pos + 1..]);
        retained
    } else {
        path
    };
    let mut edits = HashMap::new();
    for &i in &context {
        if kind(&entries[i]) == "context_edit" {
            edits.insert(key(entries[i].get("targetId")), &entries[i]);
        }
    }
    let mut projected = Vec::new();
    let mut all = Vec::new();
    for (n, &i) in context.iter().enumerate() {
        let e = &entries[i];
        let mut messages = if n > 0 && kind(e) == "compaction" {
            vec![]
        } else {
            entry_messages(e)?
        };
        if let Some(edit) = edits.get(&key(e.get("id"))) {
            if edit.get("replacement").is_some_and(Value::is_null) {
                messages.clear();
            } else {
                for m in &mut messages {
                    let role = m["role"].as_str().unwrap_or("");
                    if ["user", "assistant", "toolResult", "custom"].contains(&role) {
                        let replacement = edit
                            .get("replacement")
                            .ok_or("missing context edit replacement")?;
                        if let Some(c) = replacement.get("content") {
                            m["content"] =
                                if ["assistant", "toolResult"].contains(&role) && c.is_string() {
                                    json!([{"type":"text","text":c}])
                                } else {
                                    c.clone()
                                };
                        } else if let Some(object) = m.as_object_mut() {
                            object.remove("content");
                        }
                    }
                }
            }
        }
        all.extend(messages.iter().cloned());
        projected.push(json!({"sourceIndex":i,"messages":messages}));
    }
    let mut result = Map::new();
    result.insert("entries".into(), json!(projected));
    result.insert("messages".into(), json!(all));
    if let Some(thinking) = thinking {
        result.insert("thinkingLevel".into(), thinking);
    }
    result.insert("model".into(), model);
    Ok(Value::Object(result))
}

/// Project a raw journal as desktop browsing does: ignore session headers in
/// the Pi graph, but retain sourceIndex provenance into the original journal.
pub fn project_journal(entries: &[Value], leaf: Option<&Value>) -> Result<Value, String> {
    let indexes = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| kind(entry) != "session")
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    let body = indexes
        .iter()
        .map(|&index| entries[index].clone())
        .collect::<Vec<_>>();
    let mut projection = project(&body, leaf)?;
    for entry in projection["entries"]
        .as_array_mut()
        .ok_or("invalid projection entries")?
    {
        let index = entry["sourceIndex"]
            .as_u64()
            .ok_or("invalid projection source index")? as usize;
        entry["sourceIndex"] = json!(indexes
            .get(index)
            .ok_or("projection source index out of bounds")?);
    }
    Ok(projection)
}

/// Incremental Pi-style discovery summary; opaque messages are discarded after
/// each record, rather than retaining a decoded journal for every candidate.
struct SummaryBuilder {
    header: Value,
    count: usize,
    first: String,
    all: Vec<String>,
    name: Option<String>,
    activity: Option<i64>,
    valid: bool,
}
impl SummaryBuilder {
    fn new(header: Value) -> Option<Self> {
        (kind(&header) == "session").then_some(Self {
            header,
            count: 0,
            first: String::new(),
            all: Vec::new(),
            name: None,
            activity: None,
            valid: true,
        })
    }
    fn push(&mut self, e: Value) {
        if !self.valid {
            return;
        }
        if kind(&e) == "session_info" {
            if e.get("name")
                .is_some_and(|v| !v.is_null() && !v.is_string())
            {
                self.valid = false;
                return;
            }
            self.name = e["name"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned);
        }
        if kind(&e) != "message" {
            return;
        }
        self.count += 1;
        let m = &e["message"];
        if m.is_null() {
            self.valid = false;
            return;
        }
        let role = m["role"].as_str().unwrap_or("");
        if !["user", "assistant"].contains(&role) || m.get("content").is_none() {
            return;
        }
        let t = m["timestamp"]
            .as_f64()
            .map(|n| n.trunc() as i64)
            .or_else(|| timestamp(e.get("timestamp")));
        if let Some(t) = t {
            self.activity = Some(self.activity.unwrap_or(0).max(t));
        }
        let content = match &m["content"] {
            Value::String(s) => s.clone(),
            Value::Array(a) => a
                .iter()
                .filter(|x| x["type"] == "text")
                .filter_map(|x| x["text"].as_str())
                .collect::<Vec<_>>()
                .join(" "),
            _ => {
                self.valid = false;
                return;
            }
        };
        if !content.is_empty() {
            if self.first.is_empty() && role == "user" {
                self.first = content.clone();
            }
            self.all.push(content);
        }
    }
    fn finish(self, path: &Path, fallback: Option<i64>) -> Option<Value> {
        if !self.valid {
            return None;
        }
        let header = self.header;
        let modified = self
            .activity
            .filter(|n| *n > 0)
            .or_else(|| {
                header
                    .get("timestamp")
                    .filter(|v| v.is_string())
                    .and_then(|v| timestamp(Some(v)))
            })
            .or(fallback);
        Some(json!({"path":path.to_string_lossy(),"id":header.get("id"),
            "cwd":header["cwd"].as_str().unwrap_or(""),"name":self.name,
            "parentSessionPath":header.get("parentSession"),
            "created":timestamp(header.get("timestamp")),"modified":modified,
            "messageCount":self.count,"firstMessage":if self.first.is_empty(){"(no messages)"}else{&self.first},
            "allMessagesText":self.all.join(" ")}))
    }
}

/// Legacy ambient-path oracle. New callers should retain a `SessionStore`.
pub fn summarize(path: &Path) -> Option<Value> {
    let bytes = fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let metadata = fs::metadata(path).ok()?;
    let mut parsed = text
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(truthy);
    let mut summary = SummaryBuilder::new(parsed.next()?)?;
    for entry in parsed {
        summary.push(entry);
    }
    let fallback = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    summary.finish(path, fallback)
}
pub fn discover(root: &Path) -> Result<Vec<Value>, String> {
    let dirs = match fs::read_dir(root) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };
    let mut out = Vec::new();
    for dir in dirs
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
    {
        if let Ok(files) = fs::read_dir(dir.path()) {
            for file in files.flatten() {
                let path = file.path();
                if path.extension().is_some_and(|s| s == "jsonl") {
                    if let Some(info) = summarize(&path) {
                        out.push(info);
                    }
                }
            }
        }
    }
    // Pi orders candidates by file mtime then descending basename before a stable
    // modified-time sort. For ASCII names this matches localeCompare ordering.
    out.sort_by(|a, b| {
        let pa = Path::new(a["path"].as_str().unwrap_or(""));
        let pb = Path::new(b["path"].as_str().unwrap_or(""));
        let ma = fs::metadata(pa).and_then(|m| m.modified()).ok();
        let mb = fs::metadata(pb).and_then(|m| m.modified()).ok();
        mb.cmp(&ma)
            .then_with(|| pb.file_name().cmp(&pa.file_name()))
    });
    out.sort_by_key(|v| std::cmp::Reverse(v["modified"].as_i64().unwrap_or(0)));
    Ok(out)
}
