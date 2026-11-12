//! End-to-end: the Suffice UI at :7711 shows a real agent task live from `suffice-backend serve` on :7878.
//! Run: cargo run --example e2e_ui (server + UI must be up; submits ONE cheap claude haiku task).
use suffice::browser::Browser;
use suffice::json::Value;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::{Duration, Instant};

const SHELL: &str = "/Users/abhayg/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell";

fn http(method: &str, path: &str, token: &str, body: &str) -> String {
    let mut s = TcpStream::connect("127.0.0.1:7878").expect("suffice-backend serve not running");
    let req = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:7878\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    s.write_all(req.as_bytes()).unwrap();
    let mut out = String::new();
    s.read_to_string(&mut out).unwrap();
    out
}

fn wait_for(b: &mut Browser, what: &str, js: &str, secs: u64) -> bool {
    let t = Instant::now();
    while t.elapsed() < Duration::from_secs(secs) {
        if b.evaluate(js) == Ok(Value::Bool(true)) {
            println!("OK   {what} ({} ms)", t.elapsed().as_millis());
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    println!("FAIL {what}");
    false
}

fn main() {
    let token = std::fs::read_to_string(format!("{}/.suffice/backend/token", std::env::var("HOME").unwrap())).unwrap();
    let token = token.trim();
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    let (task, held) = (format!("e2e-{stamp}"), format!("e2e-held-{stamp}"));
    let mut b = Browser::launch(Path::new(SHELL)).expect("launch headless shell");
    b.navigate(&format!("http://localhost:7711/suffice-ui/?token={token}")).unwrap();
    std::thread::sleep(Duration::from_secs(2));
    let mode = b.evaluate("window.Suffice && Suffice.mode").unwrap_or(Value::Null);
    println!("UI mode: {mode}");

    // one real, cheap, read-only agent run on a fixed session = an agent row
    let body = format!(
        r#"{{"id":"{task}","agent":"claude","model":"haiku","access":"read","session_key":"e2e-bot","cwd":"/tmp","prompt":"Say only the single word ready","timeout_secs":120}}"#
    );
    println!("POST task: {}", http("POST", "/tasks", token, &body).lines().next().unwrap_or(""));
    // outward ask: gate holds it before any spawn
    let body = format!(
        r#"{{"id":"{held}","agent":"claude","model":"haiku","access":"read","session_key":"e2e-bot","cwd":"/tmp","prompt":"publish the package to npm"}}"#
    );
    println!("POST held: {}", http("POST", "/tasks", token, &body).lines().next().unwrap_or(""));

    let mut ok = true;
    ok &= wait_for(&mut b, "agent e2e-bot in agent list", "!!document.querySelector('#agentlist [data-key=\"e2e-bot\"]')", 30);
    b.evaluate("document.querySelector('nav.views button[data-v=\"tasks\"]').click(), true").ok();
    ok &= wait_for(&mut b, "task row in task table", &format!("!!document.querySelector('tr[data-task=\"{task}\"]')"), 30);
    ok &= wait_for(&mut b, "task row shows done", &format!("(document.querySelector('tr[data-task=\"{task}\"]')||{{}}).textContent?.includes('done')"), 120);
    b.evaluate("document.querySelector('#agentlist [data-key=\"e2e-bot\"]').click(), true").ok();
    ok &= wait_for(&mut b, "agent event stream shows the reply", "[...document.querySelectorAll('[data-kind=\"text\"]')].some(e => e.textContent.toLowerCase().includes('ready'))", 30);
    b.evaluate("document.querySelector('nav.views button[data-v=\"inbox\"]').click(), true").ok();
    ok &= wait_for(&mut b, "held task in approval inbox", &format!("document.body.innerText.includes('{held}') || document.body.innerText.includes('publish the package')"), 30);
    if let Ok(png) = b.screenshot_png() {
        std::fs::write("/tmp/suffice-e2e.png", png).ok();
    }
    // leave nothing pending: deny the held one
    let ap = http("GET", "/approvals?status=pending", token, "");
    if let Some(i) = ap.find(&format!("\"task\":\"{held}\"")) {
        if let Some(j) = ap[..i].rfind("\"id\":\"") {
            let id: String = ap[j + 6..].chars().take_while(|c| *c != '"').collect();
            println!("deny {id}: {}", http("POST", &format!("/approvals/{id}/deny"), token, "").lines().next().unwrap_or(""));
        }
    }
    println!("{}", if ok { "E2E PASS" } else { "E2E FAIL" });
    drop(b);
    std::process::exit(if ok { 0 } else { 1 });
}
