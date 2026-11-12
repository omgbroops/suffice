//! Headless Chrome driven over the DevTools Protocol, std only. Holds a small RFC 6455 client
//! (masked frames, Sec-WebSocket-Accept check), base64, SHA-1 and one page target per Browser.
//! Every click and type goes through the approval gate before it touches the page.
use crate::gate::{self, Verdict};
use crate::json::{self, Value};
use crate::types::Event;
use std::fs;
use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

unsafe extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}
const SIGTERM: i32 = 15;
const SIGKILL: i32 = 9;
const GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME: u64 = 64 << 20;
const POLL: Duration = Duration::from_millis(50);
const IO_TIMEOUT: Duration = Duration::from_secs(15);

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64_encode(data: &[u8]) -> String {
    let mut s = String::new();
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= c.len() {
                s.push(B64[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                s.push('=');
            }
        }
    }
    s
}

pub fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let (mut out, mut buf, mut bits) = (Vec::new(), 0u32, 0u32);
    for ch in s.bytes() {
        if ch == b'=' {
            break;
        }
        let v = B64.iter().position(|&c| c == ch).ok_or_else(|| format!("bad base64 byte {ch}"))? as u32;
        buf = buf << 6 | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

pub fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x6745_2301, 0xEFCD_AB89, 0x98BA_DCFE, 0x1032_5476, 0xC3D2_E1F0];
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&(data.len() as u64 * 8).to_be_bytes());
    for block in msg.chunks(64) {
        let mut w = [0u32; 80];
        for (i, x) in w.iter_mut().take(16).enumerate() {
            *x = u32::from_be_bytes([block[4 * i], block[4 * i + 1], block[4 * i + 2], block[4 * i + 3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let [mut a, mut b, mut c, mut d, mut e] = h;
        for (i, wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | (!b & d), 0x5A82_7999),
                20..=39 => (b ^ c ^ d, 0x6ED9_EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1B_BCDC),
                _ => (b ^ c ^ d, 0xCA62_C1D6),
            };
            let t = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(*wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = t;
        }
        for (x, y) in h.iter_mut().zip([a, b, c, d, e]) {
            *x = x.wrapping_add(y);
        }
    }
    let mut out = [0u8; 20];
    for (i, x) in h.iter().enumerate() {
        out[4 * i..4 * i + 4].copy_from_slice(&x.to_be_bytes());
    }
    out
}

/// Sec-WebSocket-Accept for a client key (RFC 6455 section 4.2.2).
pub fn accept_key(key: &str) -> String {
    base64_encode(&sha1(format!("{key}{GUID}").as_bytes()))
}

fn bad(why: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, why.to_string())
}

fn urandom(buf: &mut [u8]) -> io::Result<()> {
    fs::File::open("/dev/urandom")?.read_exact(buf)
}

pub struct Frame {
    pub fin: bool,
    pub op: u8,
    pub payload: Vec<u8>,
}

/// Client-to-server frame: always masked with `mask`.
pub fn encode_frame(op: u8, payload: &[u8], mask: [u8; 4]) -> Vec<u8> {
    let mut f = vec![0x80 | op];
    let len = payload.len();
    if len < 126 {
        f.push(0x80 | len as u8);
    } else if len <= 0xFFFF {
        f.push(0x80 | 126);
        f.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        f.push(0x80 | 127);
        f.extend_from_slice(&(len as u64).to_be_bytes());
    }
    f.extend_from_slice(&mask);
    f.extend(payload.iter().enumerate().map(|(i, b)| b ^ mask[i % 4]));
    f
}

/// Server-to-client frame. Masked input is refused, as RFC 6455 requires.
pub fn read_frame(r: &mut impl Read) -> io::Result<Frame> {
    let mut h = [0u8; 2];
    r.read_exact(&mut h)?;
    if h[1] & 0x80 != 0 {
        return Err(bad("server frame is masked"));
    }
    let len = match h[1] & 0x7F {
        126 => {
            let mut b = [0u8; 2];
            r.read_exact(&mut b)?;
            u16::from_be_bytes(b) as u64
        }
        127 => {
            let mut b = [0u8; 8];
            r.read_exact(&mut b)?;
            u64::from_be_bytes(b)
        }
        n => n as u64,
    };
    if len > MAX_FRAME {
        return Err(bad("frame too large"));
    }
    let mut payload = vec![0u8; len as usize];
    r.read_exact(&mut payload)?;
    Ok(Frame { fin: h[0] & 0x80 != 0, op: h[0] & 0x0F, payload })
}

struct Ws {
    stream: TcpStream,
}

impl Ws {
    fn send(&mut self, op: u8, payload: &[u8]) -> io::Result<()> {
        let mut mask = [0u8; 4];
        urandom(&mut mask)?;
        self.stream.write_all(&encode_frame(op, payload, mask))
    }

    /// Next complete text message. Pings are answered, pongs skipped, close is an error.
    fn next_text(&mut self) -> Result<String, String> {
        let mut msg: Option<Vec<u8>> = None;
        loop {
            let f = read_frame(&mut self.stream).map_err(|e| format!("ws read: {e}"))?;
            match f.op {
                0x8 => {
                    let _ = self.send(0x8, &[]);
                    return Err("browser closed the websocket".into());
                }
                0x9 => self.send(0xA, &f.payload).map_err(|e| e.to_string())?,
                0xA => {}
                0x0 | 0x1 => {
                    let buf = match (f.op, msg.take()) {
                        (0x1, None) => f.payload,
                        (0x0, Some(mut m)) => {
                            m.extend_from_slice(&f.payload);
                            m
                        }
                        _ => return Err("bad frame sequence".into()),
                    };
                    if f.fin {
                        return String::from_utf8(buf).map_err(|e| e.to_string());
                    }
                    msg = Some(buf);
                }
                op => return Err(format!("unsupported opcode {op}")),
            }
        }
    }
}

fn read_head(r: &mut impl Read) -> io::Result<String> {
    let mut head = Vec::new();
    while !head.ends_with(b"\r\n\r\n") {
        let mut b = [0u8; 1];
        r.read_exact(&mut b)?;
        head.push(b[0]);
        if head.len() > 16384 {
            return Err(bad("header too large"));
        }
    }
    Ok(String::from_utf8_lossy(&head).into_owned())
}

fn header(head: &str, name: &str) -> Option<String> {
    head.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        k.trim().eq_ignore_ascii_case(name).then(|| v.trim().to_string())
    })
}

fn connect(port: u16, path: &str) -> Result<Ws, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(IO_TIMEOUT)).map_err(|e| e.to_string())?;
    let mut raw = [0u8; 16];
    urandom(&mut raw).map_err(|e| e.to_string())?;
    let key = base64_encode(&raw);
    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
         Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    .map_err(|e| e.to_string())?;
    let head = read_head(&mut stream).map_err(|e| e.to_string())?;
    if !head.starts_with("HTTP/1.1 101") || header(&head, "sec-websocket-accept") != Some(accept_key(&key)) {
        return Err("websocket handshake refused".into());
    }
    Ok(Ws { stream })
}

/// Plain GET with Connection: close; returns the body of a 200 response.
fn http_get(port: u16, path: &str) -> Result<String, String> {
    http_req(port, "GET", path)
}

fn http_req(port: u16, method: &str, path: &str) -> Result<String, String> {
    let mut s = TcpStream::connect(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(IO_TIMEOUT)).map_err(|e| e.to_string())?;
    write!(s, "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").map_err(|e| e.to_string())?;
    // Chrome keeps the socket open after the body, so read exactly Content-Length bytes.
    let head = read_head(&mut s).map_err(|e| e.to_string())?;
    if !head.starts_with("HTTP/1.1 200") {
        return Err("bad http response".into());
    }
    let len: usize = header(&head, "content-length").and_then(|v| v.parse().ok()).ok_or("no content-length")?;
    let mut body = vec![0u8; len];
    s.read_exact(&mut body).map_err(|e| e.to_string())?;
    String::from_utf8(body).map_err(|e| e.to_string())
}

fn obj(kv: &[(&str, Value)]) -> Value {
    Value::Obj(kv.iter().map(|(k, v)| (k.to_string(), v.clone())).collect())
}

/// JS string literal for a selector, so quotes in it cannot break the script.
fn lit(s: &str) -> String {
    Value::str(s).to_string()
}

const CENTER_JS: &str = "(e=>{if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();\
    return [r.x+r.width/2,r.y+r.height/2];})(document.querySelector(SEL))";
const FOCUS_JS: &str = "(e=>{if(e)e.focus();return !!e;})(document.querySelector(SEL))";
const TEXT_JS: &str = "(e=>e?e.innerText:null)(document.querySelector(SEL))";
const INFO_JS: &str = "(e=>e?{text:e.innerText||e.textContent||'',value:e.value||'',\
    type:e.getAttribute('type')||e.tagName,action:(e.form&&e.form.action)||''}:null)(document.querySelector(SEL))";

pub struct Browser {
    child: Child,
    profile: PathBuf,
    ws: Option<Ws>,
    loaded: bool,
    next_id: i64,
}

impl Browser {
    /// Starts headless Chrome on a fresh profile and attaches to its page target.
    pub fn launch(binary: &Path) -> io::Result<Browser> {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let profile = std::env::temp_dir().join(format!("suffice-browser-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&profile)?;
        let spawned = Command::new(binary)
            .args([
                "--headless",
                "--remote-debugging-port=0",
                &format!("--user-data-dir={}", profile.display()),
                "--no-first-run",
                "--no-default-browser-check",
                "about:blank",
            ])
            .process_group(0)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
        let child = match spawned {
            Ok(c) => c,
            Err(e) => {
                let _ = fs::remove_dir_all(&profile);
                return Err(e);
            }
        };
        // If attach fails, dropping `b` kills the process and removes the profile.
        let mut b = Browser { child, profile, ws: None, loaded: false, next_id: 0 };
        b.attach().map_err(io::Error::other)?;
        Ok(b)
    }

    fn attach(&mut self) -> Result<(), String> {
        let deadline = Instant::now() + Duration::from_secs(10);
        let port_file = self.profile.join("DevToolsActivePort");
        let text = loop {
            if let Ok(t) = fs::read_to_string(&port_file) {
                if t.lines().count() >= 2 {
                    break t;
                }
            }
            if Instant::now() > deadline {
                return Err("DevToolsActivePort did not appear".into());
            }
            thread::sleep(POLL);
        };
        let port: u16 = text.lines().next().unwrap_or("").trim().parse().map_err(|_| "bad debug port")?;
        // headless shell sometimes starts with no page target; ask for a blank one if none shows within 2 s
        let nudge = Instant::now() + Duration::from_secs(2);
        let mut nudged = false;
        let url = loop {
            if !nudged && Instant::now() > nudge {
                nudged = true;
                let _ = http_req(port, "PUT", "/json/new?about:blank");
            }
            if let Ok(Value::Arr(targets)) = http_get(port, "/json/list").and_then(|b| json::parse(&b)) {
                let page = targets.iter().find(|t| t.get("type").and_then(Value::as_str) == Some("page"));
                if let Some(u) = page.and_then(|t| t.get("webSocketDebuggerUrl")).and_then(Value::as_str) {
                    break u.to_string();
                }
            }
            if Instant::now() > deadline {
                return Err("no page target".into());
            }
            thread::sleep(POLL);
        };
        let path = &url[url.find("/devtools/").ok_or("bad websocket url")?..];
        self.ws = Some(connect(port, path)?);
        Ok(())
    }

    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn profile_dir(&self) -> &Path {
        &self.profile
    }

    /// Reads one message from the socket, noting page load events on the way.
    fn pump(&mut self) -> Result<Value, String> {
        let ws = self.ws.as_mut().ok_or("not connected")?;
        let msg = json::parse(&ws.next_text()?)?;
        // headless shell occasionally skips loadEventFired on file:// loads but still sends frameStoppedLoading
        if matches!(msg.get("method").and_then(Value::as_str), Some("Page.loadEventFired" | "Page.frameStoppedLoading")) {
            self.loaded = true;
        }
        Ok(msg)
    }

    pub fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let req = obj(&[("id", Value::num(id as f64)), ("method", Value::str(method)), ("params", params)]);
        let ws = self.ws.as_mut().ok_or("not connected")?;
        ws.send(0x1, req.to_string().as_bytes()).map_err(|e| e.to_string())?;
        loop {
            let msg = self.pump()?;
            if msg.get("id").and_then(Value::as_i64) != Some(id) {
                continue;
            }
            if let Some(e) = msg.get("error") {
                let text = e.get("message").and_then(Value::as_str).map(String::from);
                return Err(text.unwrap_or_else(|| e.to_string()));
            }
            return Ok(msg.get("result").cloned().unwrap_or(Value::Null));
        }
    }

    pub fn navigate(&mut self, url: &str) -> Result<(), String> {
        self.call("Page.enable", obj(&[]))?;
        self.loaded = false;
        self.call("Page.navigate", obj(&[("url", Value::str(url))]))?;
        while !self.loaded {
            self.pump()?;
        }
        Ok(())
    }

    pub fn evaluate(&mut self, js: &str) -> Result<Value, String> {
        let params = obj(&[
            ("expression", Value::str(js)),
            ("returnByValue", Value::Bool(true)),
            ("awaitPromise", Value::Bool(true)),
        ]);
        let r = self.call("Runtime.evaluate", params)?;
        if let Some(d) = r.get("exceptionDetails") {
            let text = d.get("text").and_then(Value::as_str).unwrap_or("exception");
            return Err(format!("js error: {text}"));
        }
        Ok(r.get("result").and_then(|x| x.get("value")).cloned().unwrap_or(Value::Null))
    }

    pub fn screenshot_png(&mut self) -> Result<Vec<u8>, String> {
        let r = self.call("Page.captureScreenshot", obj(&[("format", Value::str("png"))]))?;
        let data = r.get("data").and_then(Value::as_str).ok_or("no screenshot data")?;
        base64_decode(data)
    }

    /// Runs the approval gate on the element before any input is sent.
    fn gate_check(&mut self, name: &str, selector: &str) -> Result<(), String> {
        let info = self.evaluate(&INFO_JS.replace("SEL", &lit(selector)))?;
        let Value::Obj(mut kv) = info else { return Err(format!("no element matches {selector}")) };
        kv.insert(0, ("selector".into(), Value::str(selector)));
        let input = Value::Obj(kv).to_string();
        match gate::check_event(&Event::ToolCall { name: name.into(), input }) {
            Verdict::Hold { reason } => Err(format!("held: {reason}")),
            Verdict::Allow => Ok(()),
        }
    }

    pub fn click(&mut self, selector: &str) -> Result<(), String> {
        self.gate_check("browser_click", selector)?;
        let c = self.evaluate(&CENTER_JS.replace("SEL", &lit(selector)))?;
        let (x, y) = match c.as_arr() {
            Some([Value::Num(x), Value::Num(y)]) => (*x, *y),
            _ => return Err(format!("no element matches {selector}")),
        };
        for ty in ["mousePressed", "mouseReleased"] {
            let params = obj(&[
                ("type", Value::str(ty)),
                ("x", Value::num(x)),
                ("y", Value::num(y)),
                ("button", Value::str("left")),
                ("clickCount", Value::num(1.0)),
            ]);
            self.call("Input.dispatchMouseEvent", params)?;
        }
        Ok(())
    }

    pub fn type_text(&mut self, selector: &str, text: &str) -> Result<(), String> {
        self.gate_check("browser_type", selector)?;
        if self.evaluate(&FOCUS_JS.replace("SEL", &lit(selector)))? != Value::Bool(true) {
            return Err(format!("no element matches {selector}"));
        }
        self.call("Input.insertText", obj(&[("text", Value::str(text))]))?;
        Ok(())
    }

    pub fn text(&mut self, selector: &str) -> Result<String, String> {
        let v = self.evaluate(&TEXT_JS.replace("SEL", &lit(selector)))?;
        v.as_str().map(String::from).ok_or_else(|| format!("no element matches {selector}"))
    }
}

impl Drop for Browser {
    fn drop(&mut self) {
        if let Some(ws) = self.ws.as_mut() {
            let _ = ws.send(0x8, &[]);
            let _ = ws.stream.shutdown(Shutdown::Both);
        }
        self.ws = None;
        let pid = self.child.id() as i32;
        // Negative pid signals the whole process group made in launch().
        unsafe { kill(-pid, SIGTERM) };
        let start = Instant::now();
        loop {
            let exited = matches!(self.child.try_wait(), Ok(Some(_)));
            if exited && unsafe { kill(-pid, 0) } != 0 {
                break;
            }
            if start.elapsed() > Duration::from_secs(2) {
                unsafe { kill(-pid, SIGKILL) };
                let _ = self.child.wait();
                break;
            }
            thread::sleep(POLL);
        }
        let _ = fs::remove_dir_all(&self.profile);
    }
}
