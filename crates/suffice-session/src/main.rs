use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::path::Path;
use suffice_session::{ReadLimits, SessionStore};

const MAX_WIRE_BYTES: usize = 128 * 1024 * 1024;

fn store(v: &Value) -> Result<SessionStore, String> {
    SessionStore::open(
        Path::new(v["root"].as_str().ok_or("root must be a string")?),
        ReadLimits::default(),
    )
    .map_err(|error| error.to_string())
}
fn run(v: Value) -> Result<Value, String> {
    match v["op"].as_str() {
        Some("date") => {
            suffice_session::js_date::timestamp(v.get("value")).map(|value| json!(value))
        }
        Some("present") => {
            let entries = v["entries"].as_array().ok_or("entries must be an array")?;
            let messages = suffice_session::desktop_messages(entries, v.get("leaf"))?;
            let usage = suffice_session::saved_usage(entries, v["contextWindow"].as_f64());
            Ok(json!({"messages":messages,"usage":usage}))
        }
        Some("present_session") => {
            let entries = store(&v)?
                .read(Path::new(
                    v["relativePath"]
                        .as_str()
                        .ok_or("relativePath must be a string")?,
                ))
                .map_err(|error| error.to_string())?;
            let messages = suffice_session::desktop_messages(&entries, v.get("leaf"))?;
            let usage = suffice_session::saved_usage(&entries, v["contextWindow"].as_f64());
            Ok(json!({"messages":messages,"usage":usage}))
        }
        Some("project") => suffice_session::project(
            v["entries"].as_array().ok_or("entries must be an array")?,
            v.get("leaf"),
        ),
        Some("journal") => Ok(json!(suffice_session::read_journal(
            v["source"].as_str().ok_or("source must be a string")?
        )?)),
        Some("discover") | Some("discover_confined") => {
            let discovery = store(&v)?.discover().map_err(|error| error.to_string())?;
            if v["op"] == "discover" {
                return Ok(json!(discovery
                    .sessions
                    .into_iter()
                    .map(|info| info.summary)
                    .collect::<Vec<_>>()));
            }
            Ok(
                json!({"sessions": discovery.sessions.into_iter().map(|info| {
                // Non-UTF-8 paths cannot be represented faithfully in JSON.
                let relative = info.relative_path.to_str().ok_or("Session path is not UTF-8")?;
                Ok(json!({"relativePath":relative,"summary":info.summary}))
            }).collect::<Result<Vec<_>,String>>()?, "skipped":discovery.skipped}),
            )
        }
        Some("read_session") => {
            let entries = store(&v)?
                .read(Path::new(
                    v["relativePath"]
                        .as_str()
                        .ok_or("relativePath must be a string")?,
                ))
                .map_err(|error| error.to_string())?;
            let projection = suffice_session::project_journal(&entries, v.get("leaf"))?;
            Ok(json!({"entries":entries,"projection":projection}))
        }
        _ => Err("unknown operation".into()),
    }
}
fn main() {
    let mut input = Vec::new();
    let result = io::stdin()
        .take(MAX_WIRE_BYTES as u64 + 1)
        .read_to_end(&mut input)
        .map_err(|e| e.to_string())
        .and_then(|_| {
            if input.len() > MAX_WIRE_BYTES {
                return Err("Request exceeds 128 MiB wire limit".to_owned());
            }
            suffice_session::parse_js_json(&input).map_err(|e| e.to_string())
        })
        .and_then(run);
    let mut response = match result {
        Ok(v) => json!({"ok":true,"result":v}),
        Err(e) => json!({"ok":false,"error":e}),
    };
    suffice_session::javascript_json_order(&mut response);
    let mut output = BoundedOutput {
        bytes: Vec::new(),
        // Reserve the terminating newline inside the total wire budget.
        limit: MAX_WIRE_BYTES - 1,
    };
    if suffice_session::write_js_json(&mut output, &response, false).is_err() {
        output.bytes = b"{\"ok\":false,\"error\":\"Response exceeds 128 MiB wire limit\"}".to_vec();
    }
    output.bytes.push(b'\n');
    if let Err(error) = io::stdout().lock().write_all(&output.bytes) {
        eprintln!("Session response failed: {error}");
        std::process::exit(1);
    }
}

struct BoundedOutput {
    bytes: Vec<u8>,
    limit: usize,
}
impl Write for BoundedOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.limit.saturating_sub(self.bytes.len()) {
            return Err(io::Error::other("response byte limit"));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn serialization_buffer_never_exceeds_the_wire_byte_limit() {
        let mut output = BoundedOutput {
            bytes: Vec::new(),
            limit: 8,
        };
        assert!(serde_json::to_writer(&mut output, &json!("larger than the limit")).is_err());
        assert!(output.bytes.len() <= 8);
    }
}
