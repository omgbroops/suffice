use suffice::gate::{self, Verdict};
use suffice::json::{self, Value};
use suffice::orchestrator::Engine;
use suffice::server::serve;
use suffice::types::Event;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::time::Duration;

fn main() {
    if std::env::args().nth(1).as_deref() == Some("gate-hook") {
        std::process::exit(gate_hook());
    }
    if let Err(e) = run() {
        eprintln!("suffice-backend: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) != Some("serve") {
        return Err("usage: suffice-backend serve [--port N] [--dir PATH] [--max N]".into());
    }
    let home = std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."));
    let (mut port, mut dir, mut max) = (7878u16, std::env::var("SUFFICE_HOME").map(PathBuf::from).unwrap_or_else(|_| home.join(".suffice")).join("backend"), 4usize);
    let mut it = args[1..].iter();
    while let Some(flag) = it.next() {
        let val = it.next().ok_or(format!("{flag} needs a value"))?;
        match flag.as_str() {
            "--port" => port = val.parse().map_err(|_| "bad --port")?,
            "--dir" => dir = PathBuf::from(val),
            "--max" => max = val.parse().map_err(|_| "bad --max")?,
            other => return Err(format!("unknown flag {other}")),
        }
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let token_path = dir.join("token");
    let token = load_or_create_token(&token_path)?;
    let mut engine = Engine::open(&dir, max).map_err(|e| e.to_string())?;
    for (k, v) in std::env::vars() {
        if let Some(name) = k.strip_prefix("SUFFICE_PROGRAM_") {
            engine.set_program(&name.to_lowercase(), v);
        }
    }
    let server = serve(engine, &format!("127.0.0.1:{port}"), &token).map_err(|e| e.to_string())?;
    println!("suffice backend on http://127.0.0.1:{}  token: {}", server.port(), token_path.display());
    loop {
        std::thread::sleep(Duration::from_secs(3600));
    }
}

/// Claude PreToolUse hook: exit 0 allows the call, exit 2 blocks it (stderr is shown to the model).
fn gate_hook() -> i32 {
    let mut raw = String::new();
    if std::io::stdin().read_to_string(&mut raw).is_err() {
        eprintln!("suffice gate: cannot read hook input; ask the user to approve this in Suffice");
        return 2;
    }
    let Ok(v) = json::parse(&raw) else {
        eprintln!("suffice gate: unparseable hook input; ask the user to approve this in Suffice");
        return 2;
    };
    let Some(name) = v.get("tool_name").and_then(Value::as_str) else {
        eprintln!("suffice gate: hook input has no tool_name; ask the user to approve this in Suffice");
        return 2;
    };
    let Some(input) = v.get("tool_input").filter(|i| matches!(i, Value::Obj(_))).map(|i| i.to_string()) else {
        eprintln!("suffice gate: hook input has no tool_input object; ask the user to approve this in Suffice");
        return 2;
    };
    match gate::check_event(&Event::ToolCall { name: name.to_string(), input: input.clone() }) {
        Verdict::Allow => 0,
        Verdict::Hold { .. } if approved(name, &input) => 0,
        Verdict::Hold { reason } => {
            eprintln!("suffice gate: {reason}; ask the user to approve this in Suffice");
            2
        }
    }
}

/// True when the orchestrator passed this exact call as approved for the run.
fn approved(name: &str, input: &str) -> bool {
    // shortcut: allows every exact match, not exactly once; the child cannot consume the orchestrator's calls set
    let Ok(list) = std::env::var("SUFFICE_APPROVED_CALLS") else { return false };
    let Ok(Value::Arr(calls)) = json::parse(&list) else { return false };
    calls.iter().any(|c| c.get("name").and_then(Value::as_str) == Some(name) && c.get("input").and_then(Value::as_str) == Some(input))
}

/// Read the token file, or create it (mode 0600, 32 random hex chars) if missing. Never overwrites.
fn load_or_create_token(path: &Path) -> Result<String, String> {
    let mut raw = [0u8; 16];
    let mut fresh = || -> Result<String, String> {
        fs::File::open("/dev/urandom").and_then(|mut r| r.read_exact(&mut raw)).map_err(|e| e.to_string())?;
        Ok(raw.iter().map(|b| format!("{b:02x}")).collect())
    };
    match OpenOptions::new().write(true).create_new(true).mode(0o600).open(path) {
        Ok(mut f) => {
            let tok = fresh()?;
            f.write_all(tok.as_bytes()).map_err(|e| e.to_string())?;
            Ok(tok)
        }
        Err(e) if e.kind() == ErrorKind::AlreadyExists => {
            let tok = fs::read_to_string(path).map_err(|e| e.to_string())?.trim().to_string();
            if tok.is_empty() {
                return Err(format!("token file {} is empty", path.display()));
            }
            Ok(tok)
        }
        Err(e) => Err(e.to_string()),
    }
}
