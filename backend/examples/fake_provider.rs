//! Tiny scripted fake LLM server (std only) for a $0 local gate test.
//!
//! Purpose: lets opencode and codex run against localhost. The scripted model
//! always asks to run ONE shell command (--cmd), then answers "done" once the
//! tool result comes back. Used to prove the pre-exec gate blocks a tool call.
//!
//! The Responses API event shape is a best guess, unverified against real codex.
//!
//! Run:
//!   cargo run --example fake_provider -- --port 8898 --cmd 'curl -s -X POST http://127.0.0.1:8899/hit' --log fake.log
//!
//! Point opencode at it (provider via OPENCODE_CONFIG_CONTENT, npm "@ai-sdk/openai-compatible"):
//!   OPENCODE_CONFIG_CONTENT='{"provider":{"fake":{"npm":"@ai-sdk/openai-compatible","options":{"baseURL":"http://127.0.0.1:8898/v1"},"models":{"fake":{}}}}}' opencode run -m fake/fake "..."
//!
//! Point codex at it (Responses wire API):
//!   codex exec -c model_providers.fake={name="fake",base_url="http://127.0.0.1:8898/v1",wire_api="responses"} -c model_provider=fake -m fake "..."

use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;

fn json_str(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

// Whitespace-insensitive view of the request body, for marker detection only.
// shortcut: substring match on raw JSON, a user message quoting the marker would false-positive; fine for a fake.
fn squash(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

fn chat_args(cmd: &str) -> String {
    format!("{{\"command\": {}, \"description\": \"run\"}}", json_str(cmd))
}

fn shell_args(cmd: &str) -> String {
    format!("{{\"command\":[\"bash\",\"-lc\",{}]}}", json_str(cmd))
}

fn chat_reply(body: &str, cmd: &str) -> (&'static str, String) {
    let sq = squash(body);
    let stream = sq.contains("\"stream\":true");
    let call = !sq.contains("\"role\":\"tool\"");
    let usage = r#""usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}"#;
    if !stream {
        let (msg, finish) = if call {
            let tc = format!(
                r#"{{"role":"assistant","content":null,"tool_calls":[{{"id":"call_1","type":"function","function":{{"name":"bash","arguments":{}}}}}]}}"#,
                json_str(&chat_args(cmd))
            );
            (tc, "tool_calls")
        } else {
            (r#"{"role":"assistant","content":"done"}"#.to_string(), "stop")
        };
        let out = format!(
            r#"{{"id":"chatcmpl-fake","object":"chat.completion","created":0,"model":"fake","choices":[{{"index":0,"message":{msg},"finish_reason":"{finish}"}}],{usage}}}"#
        );
        return ("application/json", out);
    }
    let chunks: Vec<String> = if call {
        vec![
            r#"{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":""}}]}"#.to_string(),
            format!(
                r#"{{"tool_calls":[{{"index":0,"function":{{"arguments":{}}}}}]}}"#,
                json_str(&chat_args(cmd))
            ),
        ]
    } else {
        vec![r#"{"role":"assistant","content":"done"}"#.to_string()]
    };
    let finish = if call { "tool_calls" } else { "stop" };
    let mut out = String::new();
    for d in chunks {
        out.push_str(&format!(
            "data: {{\"id\":\"chatcmpl-fake\",\"object\":\"chat.completion.chunk\",\"created\":0,\"model\":\"fake\",\"choices\":[{{\"index\":0,\"delta\":{d},\"finish_reason\":null}}]}}\n\n"
        ));
    }
    out.push_str(&format!(
        "data: {{\"id\":\"chatcmpl-fake\",\"object\":\"chat.completion.chunk\",\"created\":0,\"model\":\"fake\",\"choices\":[{{\"index\":0,\"delta\":{{}},\"finish_reason\":\"{finish}\"}}],{usage}}}\n\n"
    ));
    out.push_str("data: [DONE]\n\n");
    ("text/event-stream", out)
}

fn ev(name: &str, data: &str) -> String {
    format!("event: {name}\ndata: {data}\n\n")
}

fn resp_obj(status: &str, output: &str) -> String {
    format!(
        r#"{{"id":"resp_fake","object":"response","model":"fake","status":"{status}","output":{output},"usage":{{"input_tokens":0,"output_tokens":0,"total_tokens":0}}}}"#
    )
}

fn responses_reply(body: &str, cmd: &str) -> (&'static str, String) {
    let has_out = squash(body).contains("\"type\":\"function_call_output\"");
    let (item, output_idx) = if has_out {
        (
            r#"{"type":"message","id":"msg_fake","role":"assistant","status":"completed","content":[{"type":"output_text","text":"done","annotations":[]}]}"#.to_string(),
            0,
        )
    } else {
        (
            format!(
                r#"{{"type":"function_call","id":"fc_c1","call_id":"c1","name":"shell","arguments":{},"status":"completed"}}"#,
                json_str(&shell_args(cmd))
            ),
            0,
        )
    };
    let mut out = ev(
        "response.created",
        &format!(r#"{{"type":"response.created","response":{}}}"#, resp_obj("in_progress", "[]")),
    );
    out.push_str(&ev(
        "response.output_item.added",
        &format!(r#"{{"type":"response.output_item.added","output_index":{output_idx},"item":{item}}}"#),
    ));
    out.push_str(&ev(
        "response.output_item.done",
        &format!(r#"{{"type":"response.output_item.done","output_index":{output_idx},"item":{item}}}"#),
    ));
    out.push_str(&ev(
        "response.completed",
        &format!(
            r#"{{"type":"response.completed","response":{}}}"#,
            resp_obj("completed", &format!("[{item}]"))
        ),
    ));
    ("text/event-stream", out)
}

fn handle(mut s: TcpStream, cmd: &str, log: Option<&str>) {
    let Ok(clone) = s.try_clone() else { return };
    let mut rd = BufReader::new(clone);
    let mut line = String::new();
    if rd.read_line(&mut line).unwrap_or(0) == 0 {
        return;
    }
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("").to_string();
    let mut len = 0usize;
    loop {
        let mut h = String::new();
        if rd.read_line(&mut h).unwrap_or(0) == 0 {
            break;
        }
        let h = h.trim_end();
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            if k.eq_ignore_ascii_case("content-length") {
                len = v.trim().parse().unwrap_or(0);
            }
        }
    }
    let mut buf = vec![0u8; len];
    if rd.read_exact(&mut buf).is_err() {
        return;
    }
    let body = String::from_utf8_lossy(&buf).into_owned();
    let prefix: String = body.chars().take(200).collect();
    eprintln!("{method} {path}\n  body: {prefix}");
    if let Some(p) = log {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(p) {
            let _ = writeln!(f, "{method} {path}\n{body}\n");
        }
    }

    let (status, ctype, resp) = match (method.as_str(), path.as_str()) {
        ("POST", "/v1/chat/completions") => {
            let (c, b) = chat_reply(&body, cmd);
            ("200 OK", c, b)
        }
        ("POST", "/v1/responses") => {
            let (c, b) = responses_reply(&body, cmd);
            ("200 OK", c, b)
        }
        ("GET", "/v1/models") => (
            "200 OK",
            "application/json",
            r#"{"data":[{"id":"fake","object":"model"}]}"#.to_string(),
        ),
        _ => ("404 Not Found", "text/plain", "not found".to_string()),
    };
    let _ = write!(
        s,
        "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{resp}",
        resp.len()
    );
}

fn main() {
    let mut port: u16 = 8898;
    let mut cmd = "curl -s -X POST http://127.0.0.1:8899/hit".to_string();
    let mut log: Option<String> = None;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--port" => port = args.next().and_then(|v| v.parse().ok()).expect("--port N"),
            "--cmd" => cmd = args.next().expect("--cmd S"),
            "--log" => log = Some(args.next().expect("--log P")),
            other => panic!("unknown arg {other}"),
        }
    }
    let listener = TcpListener::bind(("127.0.0.1", port)).expect("bind 127.0.0.1");
    eprintln!("fake_provider listening on 127.0.0.1:{port} cmd={cmd:?}");
    let cmd = Arc::new(cmd);
    let log = Arc::new(log);
    for s in listener.incoming().flatten() {
        let (c, l) = (Arc::clone(&cmd), Arc::clone(&log));
        thread::spawn(move || handle(s, &c, l.as_deref()));
    }
}
