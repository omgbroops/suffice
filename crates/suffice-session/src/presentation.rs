//! Offline projection of the desktop's saved transcript and usage view.
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

fn truth(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|x| x != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        _ => true,
    }
}
// JSON scalars use SameValueZero-style identity; object-valued IDs remain
// distinct by reference as in a JavaScript Map. These keys never leave the process.
fn identity(value: Option<&Value>) -> String {
    match value {
        None => "<undefined>".into(),
        Some(value @ (Value::Array(_) | Value::Object(_))) => format!("object@{value:p}"),
        Some(value) => crate::to_js_string(value, false).expect("JSON identity"),
    }
}
fn s<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(Value::as_str)
}
fn copy(dst: &mut Map<String, Value>, target: &str, src: &Value, key: &str) {
    if let Some(v) = src.get(key) {
        dst.insert(target.into(), v.clone());
    }
}
fn text_of(m: &Value) -> Result<String, String> {
    if let Some(t) = m.get("content").and_then(Value::as_str) {
        return Ok(t.into());
    }
    let Some(content) = m.get("content").filter(|v| truth(Some(v))) else {
        return Ok(String::new());
    };
    let parts = content.as_array().ok_or("user content is not filterable")?;
    parts
        .iter()
        .map(|p| {
            if p.is_null() {
                return Err("null content block".into());
            }
            if s(p, "type") != Some("text") {
                return Ok(None);
            }
            let text = p.get("text").filter(|v| truth(Some(v)));
            text.map(|v| js_string(Some(v)))
                .transpose()
                .map(|v| Some(v.unwrap_or_default()))
        })
        .filter_map(|r| match r {
            Ok(None) => None,
            Ok(Some(s)) => Some(Ok(s)),
            Err(e) => Some(Err(e)),
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|parts| parts.join("\n\n"))
}
fn js_string(v: Option<&Value>) -> Result<String, String> {
    Ok(match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => {
            crate::to_js_string(&Value::Number(n.clone()), false).map_err(|e| e.to_string())?
        }
        Some(Value::Array(a)) => a
            .iter()
            .map(|x| {
                if x.is_null() {
                    Ok(String::new())
                } else {
                    js_string(Some(x))
                }
            })
            .collect::<Result<Vec<_>, _>>()?
            .join(","),
        Some(Value::Object(o)) => {
            if o.contains_key("toString") {
                return Err("Cannot convert object to primitive value".into());
            }
            "[object Object]".into()
        }
    })
}
fn boxed_string_text(text: &str, turn: Option<&Value>) -> Result<String, String> {
    let mut output = String::from("{\n");
    for (index, unit) in text.encode_utf16().enumerate() {
        let value = if (0xd800..=0xdfff).contains(&unit) {
            format!("\"\\u{unit:04x}\"")
        } else {
            crate::to_js_string(
                &json!(char::from_u32(u32::from(unit)).unwrap().to_string()),
                false,
            )
            .map_err(|error| error.to_string())?
        };
        output.push_str(&format!("  \"{index}\": {value},\n"));
        if output.len() > 128 * 1024 * 1024 {
            return Err("saved display exceeds wire limit".into());
        }
    }
    let turn = crate::to_js_string(turn.unwrap_or(&Value::Null), true)
        .map_err(|error| error.to_string())?;
    output.push_str("  \"turn\": ");
    output.push_str(&turn.replace('\n', "\n  "));
    output.push_str("\n}");
    Ok(output)
}

fn normalized(
    m: &Value,
    turn: Option<&Value>,
    boxed_string: Option<&str>,
) -> Result<Value, String> {
    // Explicit turns predeclare these fields in JS, even when initially undefined;
    // legacy backfill must not change their eventual JSON property ordering.
    let ordered_turn = turn.map(|turn| {
        let mut object = Map::new();
        for key in [
            "id",
            "startedAt",
            "endedAt",
            "provider",
            "model",
            "modelName",
            "effort",
        ] {
            copy(&mut object, key, turn, key);
        }
        Value::Object(object)
    });
    let turn = ordered_turn.as_ref();
    let mut o = Map::new();
    for k in [
        "role",
        "timestamp",
        "provider",
        "model",
        "displayText",
        "attachments",
        "kind",
        "automatic",
        "toolName",
        "toolCallId",
        "isError",
    ] {
        copy(&mut o, k, m, k)
    }
    o.insert("turn".into(), turn.cloned().unwrap_or(Value::Null));
    // Status messages do not go through createMessagePresentation.
    if s(m, "role") == Some("status") {
        o.remove("turn");
    }
    let content = if let Some(text) = boxed_string {
        vec![json!({"type":"text", "text": boxed_string_text(text, turn)?})]
    } else {
        match m.get("content") {
            Some(Value::String(t)) => vec![json!({"type":"text","text":t})],
            Some(Value::Array(a)) => a
                .iter()
                .map(|p| {
                    if p.is_null() {
                        return Err("null content block".to_string());
                    }
                    let typ = s(p, "type").unwrap_or("undefined");
                    let mut part = Map::new();
                    copy(&mut part, "type", p, "type");
                    match typ {
                        "text" => copy(&mut part, "text", p, "text"),
                        "thinking" => {
                            part.insert("type".into(), json!("thinking"));
                            copy(&mut part, "text", p, "thinking");
                        }
                        "toolCall" => {
                            copy(&mut part, "id", p, "id");
                            copy(&mut part, "name", p, "name");
                            if let Some(a) = p.get("arguments") {
                                part.insert(
                                    "text".into(),
                                    json!(crate::to_js_string(a, true).unwrap()),
                                );
                            }
                        }
                        "image" => {
                            copy(&mut part, "data", p, "data");
                            copy(&mut part, "mimeType", p, "mimeType");
                        }
                        _ => {
                            part.insert(
                                "text".into(),
                                json!(format!("[{}]", js_string(p.get("type"))?)),
                            );
                        }
                    }
                    Ok(Value::Object(part))
                })
                .collect::<Result<Vec<_>, String>>()?,
            _ => {
                let t = if truth(m.get("output")) {
                    m["output"].clone()
                } else {
                    {
                        let mut presented = m.clone();
                        if s(m, "role") != Some("status") {
                            presented["turn"] = turn.cloned().unwrap_or(Value::Null);
                        }
                        json!(crate::to_js_string(&presented, true).unwrap())
                    }
                };
                vec![json!({"type":"text","text":t})]
            }
        }
    };
    o.insert("content".into(), Value::Array(content));
    Ok(Value::Object(o))
}
fn status(kind: &str, automatic: Option<bool>) -> Value {
    let mut v = json!({"role":"status","kind":kind,"content":[]});
    if let Some(a) = automatic {
        v["automatic"] = json!(a);
    }
    v
}
fn legacy(m: &mut Value) -> Result<(), String> {
    let t = text_of(m)?;
    let marker = "\n\nAttached local files (user-provided data):\n";
    let Some(at) = t.rfind(marker) else {
        return Ok(());
    };
    let parsed: Result<Vec<Value>, _> = t[at + marker.len()..]
        .trim()
        .split('\n')
        .map(|line| crate::parse_js_json(line.as_bytes()))
        .collect();
    let Ok(files) = parsed else { return Ok(()) };
    if files.len() > 20
        || !files.iter().all(|f| {
            s(f, "name").is_some()
                && s(f, "path").is_some()
                && f.get("size")
                    .and_then(Value::as_f64)
                    .is_some_and(f64::is_finite)
        })
    {
        return Ok(());
    }
    let mut ix = 0;
    let a:Vec<_>=files.iter().map(|f|{let name=s(f,"name").unwrap();let ext=name.rsplit('.').next().unwrap_or("").to_lowercase();let typ=match ext.as_str(){"png"=>Some("image/png"),"jpg"|"jpeg"=>Some("image/jpeg"),"gif"=>Some("image/gif"),"webp"=>Some("image/webp"),_=>None};let mut x=json!({"name":name,"size":f["size"],"type":typ.unwrap_or("application/octet-stream")});if typ.is_some(){x["imageIndex"]=json!(ix);ix+=1;}x}).collect();
    m["displayText"] = json!(&t[..at]);
    m["attachments"] = json!(a);
    Ok(())
}

pub fn desktop_messages(entries: &[Value], leaf: Option<&Value>) -> Result<Value, String> {
    let projection = crate::project_journal(entries, leaf)?;
    let projected = projection["entries"]
        .as_array()
        .ok_or("invalid projection")?;
    let mut by_id = HashMap::new();
    let mut ends = HashMap::new();
    let mut reasons = HashMap::new();
    let selected = projected
        .iter()
        .filter_map(|entry| entry["sourceIndex"].as_u64().map(|i| i as usize))
        .collect::<HashSet<_>>();
    for (i, e) in entries.iter().enumerate() {
        if truth(e.get("id")) {
            by_id.insert(identity(e.get("id")), i);
        }
        if s(e, "type") == Some("custom") {
            let d = &e["data"];
            if s(e, "customType") == Some("suffice:turn-end") && truth(d.get("id")) {
                ends.insert(identity(d.get("id")), d.clone());
            }
            if selected.contains(&i) && s(e, "customType") == Some("suffice:compaction") {
                reasons.insert(identity(d.get("entryId")), d.get("reason").cloned());
            }
        }
    }
    let checkpoints: Vec<usize> = projected
        .iter()
        .filter_map(|p| {
            let i = p["sourceIndex"].as_u64()? as usize;
            (s(&entries[i], "type") == Some("compaction") && !p["messages"].as_array()?.is_empty())
                .then_some(i)
        })
        .collect();
    let mut cp = 0;
    let mut turns: Vec<Value> = Vec::new();
    let mut turn_ids: HashMap<String, usize> = HashMap::new();
    let mut cache: HashMap<String, Option<usize>> = HashMap::new();
    let mut legacy_turn = None;
    let mut seq = 0;
    let mut output: Vec<(Value, Option<usize>, Option<String>)> = Vec::new();
    for p in projected {
        let i = p["sourceIndex"].as_u64().ok_or("invalid index")? as usize;
        let e = &entries[i];
        if s(e, "type") == Some("compaction") {
            continue;
        }
        while cp < checkpoints.len() && checkpoints[cp] < i {
            let id = identity(entries[checkpoints[cp]].get("id"));
            let auto = reasons
                .get(&id)
                .is_some_and(|r| r.as_ref().and_then(Value::as_str) != Some("manual"));
            output.push((status("compacted", Some(auto)), None, None));
            cp += 1;
        }
        if s(e, "type") == Some("custom") && s(e, "customType") == Some("suffice:interrupted") {
            if output.last().and_then(|x| s(&x.0, "kind")) != Some("interrupted") {
                output.push((status("interrupted", None), None, None));
            }
            continue;
        }
        let messages = p["messages"].as_array().ok_or("invalid messages")?;
        for m in messages {
            let mut turn = None;
            if truth(e.get("id")) {
                let mut node = Some(i);
                let mut visited = HashSet::new();
                let mut path = Vec::new();
                while let Some(n) = node {
                    let ne = &entries[n];
                    let nid = identity(ne.get("id"));
                    if !visited.insert(nid.clone()) {
                        break;
                    }
                    if let Some(c) = cache.get(&nid) {
                        turn = *c;
                        break;
                    }
                    path.push(nid);
                    if s(ne, "type") == Some("custom")
                        && s(ne, "customType") == Some("suffice:turn-start")
                    {
                        let d = &ne["data"];
                        let key = identity(d.get("id"));
                        turn = Some(*turn_ids.entry(key.clone()).or_insert_with(|| {
                            let mut t = Map::new();
                            for k in [
                                "id",
                                "startedAt",
                                "provider",
                                "model",
                                "modelName",
                                "effort",
                            ] {
                                copy(&mut t, k, d, k)
                            }
                            if let Some(end) = ends.get(&key) {
                                copy(&mut t, "endedAt", end, "endedAt");
                            }
                            turns.push(Value::Object(t));
                            turns.len() - 1
                        }));
                        break;
                    }
                    if s(ne, "type") == Some("custom")
                        && s(ne, "customType") == Some("suffice:turn-end")
                    {
                        break;
                    }
                    node = by_id.get(&identity(ne.get("parentId"))).copied();
                }
                for k in path {
                    cache.insert(k, turn);
                }
            }
            if s(m, "role") == Some("user") && turn.is_none() {
                let id = if truth(e.get("id")) {
                    e["id"].clone()
                } else {
                    seq += 1;
                    json!(format!("legacy-{seq}"))
                };
                turns.push(json!({"id":id}));
                legacy_turn = Some(turns.len() - 1);
            }
            turn = turn.or(legacy_turn);
            if s(m, "role") == Some("assistant") {
                if let Some(t) = turn {
                    for k in ["provider", "model"] {
                        if turns[t].get(k).is_none_or(Value::is_null) {
                            if let Some(v) = m.get(k) {
                                turns[t][k] = v.clone();
                            } else {
                                turns[t].as_object_mut().unwrap().remove(k);
                            }
                        }
                    }
                    if !truth(turns[t].get("effort")) {
                        let mut node = Some(i);
                        let mut seen = HashSet::new();
                        while let Some(n) = node {
                            let ne = &entries[n];
                            let id = identity(ne.get("id"));
                            if !seen.insert(id) {
                                break;
                            }
                            if s(ne, "type") == Some("thinking_level_change") {
                                if let Some(v) = ne.get("thinkingLevel") {
                                    turns[t]["effort"] = v.clone();
                                } else {
                                    turns[t].as_object_mut().unwrap().remove("effort");
                                }
                                break;
                            }
                            node = by_id.get(&identity(ne.get("parentId"))).copied();
                        }
                    }
                }
            }
            // Object spread boxes primitive messages and copies enumerable string indices.
            let mut msg = match m {
                Value::Object(_) => m.clone(),
                Value::Array(items) => Value::Object(
                    items
                        .iter()
                        .enumerate()
                        .map(|(index, value)| (index.to_string(), value.clone()))
                        .collect(),
                ),
                _ => json!({}),
            };
            if s(m, "role") == Some("user") {
                if let Some(content) = m.get("content") {
                    if truth(Some(content)) && !content.is_string() && !content.is_array() {
                        return Err("user content is not filterable".into());
                    }
                    if content
                        .as_array()
                        .is_some_and(|a| a.iter().any(Value::is_null))
                    {
                        return Err("null content block".into());
                    }
                }
                let hash = format!("{:x}", Sha256::digest(text_of(m)?.as_bytes()));
                let mut node = by_id.get(&identity(e.get("parentId"))).copied();
                let mut crossed = false;
                let mut seen = HashSet::new();
                let mut display = None;
                while let Some(n) = node {
                    let ne = &entries[n];
                    let id = identity(ne.get("id"));
                    if !seen.insert(id) {
                        break;
                    }
                    if s(ne, "type") == Some("message") && s(&ne["message"], "role") == Some("user")
                    {
                        crossed = true
                    }
                    let d = &ne["data"];
                    if s(ne, "type") == Some("custom")
                        && [
                            Some("suffice:turn-start"),
                            Some("suffice:user-presentation"),
                        ]
                        .contains(&s(ne, "customType"))
                        && ((truth(d.get("promptHash"))
                            && s(d, "promptHash") == Some(hash.as_str()))
                            || (!truth(d.get("promptHash")) && !crossed))
                    {
                        display = Some(d);
                        break;
                    }
                    node = by_id.get(&identity(ne.get("parentId"))).copied();
                }
                if let Some(d) = display {
                    if let Some(v) = d.get("displayPrompt") {
                        msg["displayText"] = v.clone();
                    } else {
                        msg.as_object_mut().unwrap().remove("displayText");
                    }
                    msg["attachments"] = if truth(d.get("attachments")) {
                        d["attachments"].clone()
                    } else {
                        json!([])
                    };
                } else {
                    legacy(&mut msg)?;
                }
            }
            output.push((msg, turn, m.as_str().map(str::to_owned)));
        }
        if messages.last().is_some_and(|m| {
            s(m, "role") == Some("assistant") && s(m, "stopReason") == Some("aborted")
        }) {
            output.push((status("interrupted", None), None, None));
        }
    }
    while cp < checkpoints.len() {
        let id = identity(entries[checkpoints[cp]].get("id"));
        let auto = reasons
            .get(&id)
            .is_some_and(|r| r.as_ref().and_then(Value::as_str) != Some("manual"));
        output.push((status("compacted", Some(auto)), None, None));
        cp += 1;
    }
    Ok(Value::Array(
        output
            .iter()
            .map(|(m, t, boxed)| normalized(m, t.map(|i| &turns[i]), boxed.as_deref()))
            .collect::<Result<Vec<_>, _>>()?,
    ))
}

pub fn saved_usage(entries: &[Value], context_window: Option<f64>) -> Value {
    let (mut cost, mut total, mut has, mut last, mut compacted) = (0.0, 0.0, false, None, false);
    for e in entries {
        if s(e, "type") == Some("compaction") {
            compacted = true;
            last = None
        }
        let m = if s(e, "type") == Some("message") {
            e.get("message")
        } else {
            None
        };
        let usage = m
            .and_then(|x| x.get("usage"))
            .filter(|x| !x.is_null())
            .or_else(|| {
                if [Some("usage"), Some("compaction"), Some("branch_summary")]
                    .contains(&s(e, "type"))
                {
                    e.get("usage")
                } else {
                    None
                }
            });
        if truth(usage) {
            let u = usage.unwrap();
            has = true;
            let mut entry_tokens = 0.0;
            for k in ["input", "output", "cacheRead", "cacheWrite"] {
                entry_tokens += u
                    .get(k)
                    .and_then(Value::as_f64)
                    .filter(|x| x.is_finite())
                    .unwrap_or(0.0);
            }
            total += entry_tokens;
            cost += u
                .get("cost")
                .and_then(|x| x.get("total"))
                .and_then(Value::as_f64)
                .filter(|x| x.is_finite())
                .unwrap_or(0.0);
        }
        if let Some(m) = m {
            if s(m, "role") == Some("assistant")
                && truth(m.get("usage"))
                && ![Some("error"), Some("aborted")].contains(&s(m, "stopReason"))
            {
                last = m.get("usage");
                compacted = false;
            }
        }
    }
    let tokens = if compacted {
        None
    } else {
        last.and_then(|u| {
            if truth(u.get("totalTokens")) {
                u.get("totalTokens").and_then(Value::as_f64)
            } else {
                let mut v = 0.0;
                for k in ["input", "output", "cacheRead", "cacheWrite"] {
                    v += match u.get(k)? {
                        Value::Null => 0.0,
                        Value::Bool(b) => {
                            if *b {
                                1.0
                            } else {
                                0.0
                            }
                        }
                        Value::Number(n) => n.as_f64()?,
                        _ => return None,
                    };
                }
                Some(v)
            }
        })
        .filter(|v| v.is_finite())
    };
    let percent = tokens
        .and_then(|t| context_window.filter(|w| *w > 0.0).map(|w| t / w * 100.0))
        .filter(|x| x.is_finite());
    json!({"cost":if has{Some(cost)}else{None},"totalTokens":if has{Some(total)}else{None},"windowTokens":tokens,"windowPercent":percent})
}
