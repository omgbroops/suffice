// Offline platform integration fixture for the browser's native delegate callbacks.
#[allow(dead_code)]
#[path = "../src/browser.rs"]
mod browser;
use serde_json::json;
use std::{
    cell::Cell,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    rc::Rc,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tao::{
    event::Event,
    event_loop::{ControlFlow, EventLoopBuilder},
    window::{Window, WindowBuilder},
};
use wry::{
    Rect, WebViewBuilder,
    dpi::{LogicalPosition, LogicalSize},
};

struct Decisions {
    popup: Cell<usize>,
    save: Cell<usize>,
    file: PathBuf,
}
impl browser::Dialogs for Decisions {
    fn popup(&self, _: &Window, source: &str, destination: &str) -> bool {
        assert_eq!(source, destination);
        let count = self.popup.get() + 1;
        self.popup.set(count);
        count >= 2
    }
    fn save(&self, _: &Window, source: &str, _: &str) -> Option<PathBuf> {
        assert!(source.starts_with("http://127.0.0.1:"));
        let count = self.save.get() + 1;
        self.save.set(count);
        (count == 2).then(|| self.file.clone())
    }
}

fn main() {
    let scratch = PathBuf::from(std::env::args_os().nth(1).expect("scratch directory"));
    let server = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", server.local_addr().unwrap());
    let receipts = Arc::new(Mutex::new(Vec::<String>::new()));
    let log = receipts.clone();
    std::thread::spawn(move || {
        for client in server.incoming() {
            let mut sock = client.unwrap();
            let mut data = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                let n = sock.read(&mut buf).unwrap_or(0);
                data.extend_from_slice(&buf[..n]);
                if n == 0 {
                    break;
                }
                if let Some(end) = data.windows(4).position(|b| b == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&data[..end]).to_ascii_lowercase();
                    let length = header
                        .lines()
                        .find_map(|s| {
                            s.strip_prefix("content-length: ")
                                .and_then(|n| n.parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if data.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let raw = String::from_utf8_lossy(&data);
            let mut first = raw.split_whitespace();
            let method = first.next().unwrap_or("");
            let path = first.next().unwrap_or("");
            let (mime, content, headers) = match path {
                "/start" => (
                    "text/html",
                    r#"<!doctype html><title>Guest</title><form action="/save" method="post"><input name="nonce" value="original"></form><script>
        window.onmessage=e=>{if(e.origin===location.origin&&e.data==='proof') fetch('/opener-proof')};
        const popup=()=>window.open('/popup','guestChild');
        setTimeout(popup,550);setTimeout(popup,1000);
        setTimeout(()=>document.forms[0].requestSubmit(),2400);setTimeout(()=>document.forms[0].requestSubmit(),3400);
        </script>"#,
                    "Set-Cookie: fixture=panel; Path=/; SameSite=Strict\r\n",
                ),
                "/popup" => (
                    "text/html",
                    r#"<!doctype html><title>Popup</title><script>if(window.opener&&typeof window.sufficeDesktop==='undefined'&&typeof window.ipc==='undefined'&&document.cookie==='fixture=panel')opener.postMessage('proof',location.origin);setTimeout(()=>window.close(),500);</script>"#,
                    "",
                ),
                "/opener-proof" => {
                    log.lock().unwrap().push("opener".into());
                    ("text/plain", "ok", "")
                }
                "/save" => {
                    let valid = method == "POST"
                        && raw.to_ascii_lowercase().contains("cookie: fixture=panel")
                        && raw.ends_with("nonce=original");
                    log.lock().unwrap().push(format!("POST-{valid}"));
                    (
                        "application/octet-stream",
                        "original POST bytes",
                        "Content-Disposition: attachment; filename=fixture.txt\r\n",
                    )
                }
                _ => ("text/plain", "", ""),
            };
            let _ = write!(
                sock,
                "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nX-Frame-Options: DENY\r\n{headers}Connection: close\r\n\r\n{content}",
                content.len()
            );
        }
    });
    let events = EventLoopBuilder::new().build();
    let window = Rc::new(
        WindowBuilder::new()
            .with_title("Local browser permission fixture")
            .with_inner_size(LogicalSize::new(800, 500))
            .build(&events)
            .unwrap(),
    );
    let root = WebViewBuilder::new()
        .with_bounds(Rect {
            position: LogicalPosition::new(0, 0).into(),
            size: LogicalSize::new(800, 500).into(),
        })
        .with_html("<body>Trusted fixture<script>window.__sufficeReceive=()=>{}</script>")
        .build_as_child(window.as_ref())
        .unwrap();
    let decisions = Rc::new(Decisions {
        popup: Cell::new(0),
        save: Cell::new(0),
        file: scratch.join("accepted.txt"),
    });
    let mut surface = browser::Surface::with_dialogs(scratch.join("profile"), decisions.clone());
    let mut started = false;
    let mut popup_seen = false;
    let start = Instant::now();
    let mut next = start;
    events.run(move |event,_,flow| {
        *flow=ControlFlow::WaitUntil(next);
        if !matches!(event,Event::MainEventsCleared)||Instant::now()<next{return;}
        next=Instant::now()+Duration::from_millis(80);*flow=ControlFlow::WaitUntil(next);
        surface.poll(&root);
        let state=surface.command(&window,&json!({"action":"open","token":"fixture"})).unwrap();
        if !started {
            surface.command(&window,&json!({"action":"bounds","token":"fixture","bounds":{"x":10,"y":50,"width":640,"height":420}})).unwrap();
            surface.command(&window,&json!({"action":"navigate","token":"fixture","url":base.clone()+"/start"})).unwrap();
            started=true;
        }
        if state["popupDepth"]==1{popup_seen=true;}
        let captured=receipts.lock().unwrap().clone();
        if captured==["opener","POST-true","POST-true"] && decisions.popup.get()==2 && decisions.save.get()==2 && popup_seen && state["popupDepth"]==0 && std::fs::read(&decisions.file).ok().as_deref()==Some(b"original POST bytes"){
            println!("PASS: denied and accepted original popup; opener message, isolated guest, cookies, script close; denied and accepted original POST downloads with exact response bytes.");
            surface.command(&window,&json!({"action":"close","token":"fixture"})).unwrap();*flow=ControlFlow::Exit;
        }else if start.elapsed()>Duration::from_secs(12){
            eprintln!("FAIL: state={state} receipts={captured:?} popups={} saves={} popup_seen={popup_seen}",decisions.popup.get(),decisions.save.get());*flow=ControlFlow::ExitWithCode(1);
        }
    });
}
