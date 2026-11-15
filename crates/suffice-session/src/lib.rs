use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    time::UNIX_EPOCH,
};
use time::{format_description::well_known::Rfc3339, Date, OffsetDateTime};

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
    let s = v.as_str()?;
    if let Ok(t) = OffsetDateTime::parse(s, &Rfc3339) {
        return i64::try_from(t.unix_timestamp_nanos().div_euclid(1_000_000)).ok();
    }
    let format = time::format_description::parse_borrowed::<2>("[year]-[month]-[day]").ok()?;
    Date::parse(s, &format)
        .ok()
        .map(|d| d.midnight().assume_utc().unix_timestamp() * 1000)
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
    let mut thinking = json!("off");
    let mut model = Value::Null;
    for &i in &path {
        let e = &entries[i];
        match kind(e) {
            "thinking_level_change" => {
                thinking = e.get("thinkingLevel").cloned().unwrap_or(Value::Null)
            }
            "model_change" => {
                model = json!({"provider":e.get("provider"),"modelId":e.get("modelId")})
            }
            "message" if e["message"]["role"] == "assistant" => {
                model = json!({"provider":e["message"].get("provider"),"modelId":e["message"].get("model")})
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
            if edit["replacement"].is_null() {
                messages.clear();
            } else {
                for m in &mut messages {
                    let role = m["role"].as_str().unwrap_or("");
                    if ["user", "assistant", "toolResult", "custom"].contains(&role) {
                        let c = edit["replacement"]["content"].clone();
                        m["content"] =
                            if ["assistant", "toolResult"].contains(&role) && c.is_string() {
                                json!([{"type":"text","text":c}])
                            } else {
                                c
                            };
                    }
                }
            }
        }
        all.extend(messages.iter().cloned());
        projected.push(json!({"sourceIndex":i,"messages":messages}));
    }
    Ok(json!({"entries":projected,"messages":all,"thinkingLevel":thinking,"model":model}))
}

/// Best effort Pi listing summary for a single file; never modifies the file.
pub fn summarize(path: &Path) -> Option<Value> {
    let bytes = fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let metadata = fs::metadata(path).ok()?;
    let mut parsed = text
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(truthy);
    let header = parsed.next()?;
    if kind(&header) != "session" {
        return None;
    }
    let mut count = 0;
    let mut first = String::new();
    let mut all = Vec::new();
    let mut name = None;
    let mut activity: Option<i64> = None;
    for e in parsed {
        if kind(&e) == "session_info" {
            if e.get("name")
                .is_some_and(|v| !v.is_null() && !v.is_string())
            {
                return None;
            }
            name = e["name"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned);
        }
        if kind(&e) != "message" {
            continue;
        }
        count += 1;
        let m = &e["message"];
        if m.is_null() {
            return None;
        }
        let role = m["role"].as_str().unwrap_or("");
        if !["user", "assistant"].contains(&role) || m.get("content").is_none() {
            continue;
        }
        let t = m["timestamp"]
            .as_f64()
            .map(|n| n.trunc() as i64)
            .or_else(|| timestamp(e.get("timestamp")));
        if let Some(t) = t {
            activity = Some(activity.unwrap_or(0).max(t));
        }
        let content = match &m["content"] {
            Value::String(s) => s.clone(),
            Value::Array(a) => a
                .iter()
                .filter(|x| x["type"] == "text")
                .filter_map(|x| x["text"].as_str())
                .collect::<Vec<_>>()
                .join(" "),
            _ => return None,
        };
        if !content.is_empty() {
            if first.is_empty() && role == "user" {
                first = content.clone();
            }
            all.push(content);
        }
    }
    let fallback = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    let modified = activity
        .filter(|n| *n > 0)
        .or_else(|| {
            header
                .get("timestamp")
                .filter(|v| v.is_string())
                .and_then(|v| timestamp(Some(v)))
        })
        .or(fallback);
    Some(
        json!({"path":path.to_string_lossy(),"id":header.get("id"),"cwd":header["cwd"].as_str().unwrap_or(""),"name":name,"parentSessionPath":header.get("parentSession"),"created":timestamp(header.get("timestamp")),"modified":modified,"messageCount":count,"firstMessage":if first.is_empty(){"(no messages)"}else{&first},"allMessagesText":all.join(" ")}),
    )
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
