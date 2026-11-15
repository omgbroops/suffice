use serde_json::{json, Value};
use std::io::{self, Read};
fn run(v: Value) -> Result<Value, String> {
    match v["op"].as_str() {
        Some("project") => suffice_session::project(
            v["entries"].as_array().ok_or("entries must be an array")?,
            v.get("leaf"),
        ),
        Some("journal") => Ok(json!(suffice_session::read_journal(
            v["source"].as_str().ok_or("source must be a string")?
        )?)),
        Some("discover") => Ok(json!(suffice_session::discover(std::path::Path::new(
            v["root"].as_str().ok_or("root must be a string")?
        ))?)),
        _ => Err("unknown operation".into()),
    }
}
fn main() {
    let mut s = String::new();
    let result = io::stdin()
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())
        .and_then(|_| serde_json::from_str(&s).map_err(|e| e.to_string()))
        .and_then(run);
    println!(
        "{}",
        match result {
            Ok(v) => json!({"ok":true,"result":v}),
            Err(e) => json!({"ok":false,"error":e}),
        }
    );
}
