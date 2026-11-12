//! Local HTTP API (see API.txt). The engine lives on its own thread; connection threads
//! send it closures and wait for the answer. Std only: a small HTTP/1.1 parser, one request per connection.

use crate::json::{self, Value};
use crate::orchestrator::{caps_json, logged_json, parse_caps, Engine, MsgErr};
use crate::triggers::{Trigger, When};
use crate::types::{now_ms, Access, AgentKind, Event, Logged, Task, TaskState};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const MAX_BODY: usize = 1 << 20;
const MAX_CONNS: usize = 64;
const ORIGINS: [&str; 3] = ["http://localhost:7711", "http://127.0.0.1:7711", "null"];

type Job = Box<dyn FnOnce(&mut Engine) + Send>;
type Res = (u16, Value);

struct Ctx {
    jobs: Sender<Job>,
    token: String,
    started: Instant,
}

/// A running server. Dropping it without `stop` leaves the threads running until the process exits.
pub struct Server {
    port: u16,
    addr: SocketAddr,
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}

impl Server {
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(self.addr); // wakes the blocked accept
        for t in self.threads.drain(..) {
            let _ = t.join();
        }
    }
}

/// Bind `addr` (loopback only) and serve the engine. `token` must be presented as a Bearer token.
pub fn serve(engine: Engine, addr: &str, token: &str) -> io::Result<Server> {
    let sa: SocketAddr = addr.parse().map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("{e}")))?;
    if !sa.ip().is_loopback() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "refusing non-loopback address"));
    }
    let listener = TcpListener::bind(sa)?;
    let addr = listener.local_addr()?;
    let stop = Arc::new(AtomicBool::new(false));
    let (jobs, job_rx) = channel::<Job>();
    let ctx = Arc::new(Ctx { jobs, token: token.to_string(), started: Instant::now() });

    let engine_stop = stop.clone();
    let engine_thread = thread::spawn(move || run_engine(engine, job_rx, engine_stop));
    let accept_stop = stop.clone();
    let active = Arc::new(AtomicUsize::new(0));
    let accept_thread = thread::spawn(move || {
        for conn in listener.incoming() {
            if accept_stop.load(Ordering::SeqCst) {
                break;
            }
            if let Ok(mut s) = conn {
                if active.fetch_add(1, Ordering::SeqCst) >= MAX_CONNS {
                    active.fetch_sub(1, Ordering::SeqCst);
                    // shortcut: each over-cap reject thread lives up to 1 s, a flood spawns many, upgrade to a bounded pool if needed
                    thread::spawn(move || reject(&mut s, None, 503, "too many connections"));
                    continue;
                }
                let (ctx, active) = (ctx.clone(), active.clone());
                thread::spawn(move || {
                    handle_conn(s, &ctx);
                    active.fetch_sub(1, Ordering::SeqCst);
                });
            }
        }
    });
    Ok(Server { port: addr.port(), addr, stop, threads: vec![engine_thread, accept_thread] })
}

fn run_engine(mut engine: Engine, jobs: Receiver<Job>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::SeqCst) {
        while let Ok(job) = jobs.try_recv() {
            job(&mut engine);
        }
        engine.tick();
        engine.pump(Duration::from_millis(50));
    }
}

/// Run `f` on the engine thread and wait for its result. None if the engine is gone.
fn ask<T: Send + 'static>(ctx: &Ctx, f: impl FnOnce(&mut Engine) -> T + Send + 'static) -> Option<T> {
    let (tx, rx) = channel();
    ctx.jobs.send(Box::new(move |e: &mut Engine| {
        let _ = tx.send(f(e));
    })).ok()?;
    rx.recv().ok()
}

fn ask_res(ctx: &Ctx, f: impl FnOnce(&mut Engine) -> Res + Send + 'static) -> Res {
    ask(ctx, f).unwrap_or_else(|| err(503, "engine unavailable"))
}

fn err(code: u16, msg: impl Into<String>) -> Res {
    (code, obj(vec![("error", Value::Str(msg.into()))]))
}

fn obj(kv: Vec<(&str, Value)>) -> Value {
    Value::Obj(kv.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

fn opt(s: Option<&str>) -> Value {
    s.map_or(Value::Null, Value::str)
}

fn reason_text(code: u16) -> &'static str {
    match code {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        409 => "Conflict",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        _ => "Internal Server Error",
    }
}

fn cors(origin: Option<&str>) -> String {
    match origin {
        Some(o) if ORIGINS.contains(&o) => format!(
            "Access-Control-Allow-Origin: {o}\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, Last-Event-ID\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n"
        ),
        _ => String::new(),
    }
}

fn respond(w: &mut impl Write, code: u16, origin: Option<&str>, body: &str) -> io::Result<()> {
    let ctype = if code == 204 { "" } else { "Content-Type: application/json\r\n" };
    write!(
        w,
        "HTTP/1.1 {code} {}\r\n{ctype}Content-Length: {}\r\nConnection: close\r\n{}\r\n{body}",
        reason_text(code),
        body.len(),
        cors(origin)
    )?;
    w.flush()
}

/// None on a malformed escape (not exactly two ASCII hex digits after '%').
fn pct_decode(s: &str, plus: bool) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' => {
                let h = b.get(i + 1..i + 3)?;
                if !h.iter().all(u8::is_ascii_hexdigit) {
                    return None;
                }
                out.push(u8::from_str_radix(std::str::from_utf8(h).ok()?, 16).ok()?);
                i += 3;
            }
            b'+' if plus => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    Some(String::from_utf8_lossy(&out).into_owned())
}

/// Early error: write the response, then drain the rest of the request so the kernel does not RST
/// before the client reads it. Drain stops at EOF, 1 s, or 1 MB.
fn reject(s: &mut TcpStream, origin: Option<&str>, code: u16, msg: &str) {
    let _ = respond(s, code, origin, &err(code, msg).1.to_string());
    let _ = s.flush();
    let _ = s.shutdown(Shutdown::Write);
    let _ = s.set_read_timeout(Some(Duration::from_secs(1)));
    let (start, mut total, mut buf) = (Instant::now(), 0usize, [0u8; 4096]);
    while total < 1 << 20 && start.elapsed() < Duration::from_secs(1) {
        match s.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => total += n,
        }
    }
}

fn ct_eq(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn qget<'a>(q: &'a [(String, String)], k: &str) -> Option<&'a str> {
    q.iter().find(|(key, _)| key == k).map(|(_, v)| v.as_str())
}

fn qnum(q: &[(String, String)], k: &str, default: u64) -> Result<u64, String> {
    match qget(q, k) {
        None => Ok(default),
        Some(s) => s.parse().map_err(|_| format!("bad {k}")),
    }
}

/// Reads one head line (through '\n') under a shared byte budget and a whole-head deadline.
/// Each fill_buf waits at most the time left, so a dribbling sender cannot hold the connection.
fn read_head_line(r: &mut BufReader<TcpStream>, line: &mut String, budget: &mut usize, deadline: Instant) -> io::Result<usize> {
    let mut bytes = Vec::new();
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err(io::Error::from(io::ErrorKind::TimedOut));
        }
        r.get_ref().set_read_timeout(Some(left.max(Duration::from_millis(1))))?;
        let buf = r.fill_buf()?;
        if buf.is_empty() {
            break;
        }
        let (take, done) = match buf.iter().position(|&b| b == b'\n') {
            Some(i) => (i + 1, true),
            None => (buf.len(), false),
        };
        if take > *budget {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "request head too large"));
        }
        *budget -= take;
        bytes.extend_from_slice(&buf[..take]);
        r.consume(take);
        if done {
            break;
        }
    }
    let text = std::str::from_utf8(&bytes).map_err(|_| io::Error::other("non-utf8 head"))?;
    line.push_str(text);
    Ok(bytes.len())
}

fn handle_conn(stream: TcpStream, ctx: &Ctx) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut w = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let mut r = BufReader::new(stream);
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut budget = 16 * 1024usize;
    let mut line = String::new();
    let mut heads = 0usize;
    match read_head_line(&mut r, &mut line, &mut budget, deadline) {
        Ok(0) => return,
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::InvalidData => {
            reject(r.get_mut(), None, 431, "request headers too large");
            return;
        }
        Err(_) => return,
    }
    let mut parts = line.split_whitespace();
    let (method, target) = (parts.next().unwrap_or("").to_string(), parts.next().unwrap_or("").to_string());
    let (mut auth, mut origin, mut last_id, mut len, mut host) = (None, None, None, 0usize, None);
    loop {
        line.clear();
        heads += 1;
        match read_head_line(&mut r, &mut line, &mut budget, deadline) {
            Ok(0) => return,
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::InvalidData => {
                reject(r.get_mut(), None, 431, "request headers too large");
                return;
            }
            Err(_) => return,
        }
        if heads > 100 {
            reject(r.get_mut(), None, 431, "request headers too large");
            return;
        }
        let h = line.trim_end();
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            let v = v.trim().to_string();
            match k.trim().to_ascii_lowercase().as_str() {
                "authorization" => auth = Some(v),
                "origin" => origin = Some(v),
                "host" => host = Some(v),
                "last-event-id" => last_id = Some(v),
                "content-length" => len = v.parse().unwrap_or(0),
                _ => {}
            }
        }
    }
    let _ = r.get_ref().set_read_timeout(Some(Duration::from_secs(10)));
    // DNS rebinding guard: a foreign Host name means the browser resolved an attacker domain to loopback
    if host.is_some_and(|h| !matches!(h.split(':').next(), Some("127.0.0.1" | "localhost"))) {
        reject(r.get_mut(), None, 421, "misdirected request");
        return;
    }
    let origin = origin.as_deref();
    let (raw_path, qs) = target.split_once('?').unwrap_or((&target, ""));
    let decoded = (|| {
        let path = pct_decode(raw_path, false)?;
        let query: Vec<(String, String)> = qs
            .split('&')
            .filter(|p| !p.is_empty())
            .map(|p| {
                let (k, v) = p.split_once('=').unwrap_or((p, ""));
                Some((pct_decode(k, true)?, pct_decode(v, true)?))
            })
            .collect::<Option<_>>()?;
        Some((path, query))
    })();
    let Some((path, query)) = decoded else {
        reject(r.get_mut(), origin, 400, "bad percent-encoding");
        return;
    };

    if method == "OPTIONS" {
        let _ = respond(&mut w, 204, origin, "");
        return;
    }
    if len > MAX_BODY {
        reject(r.get_mut(), origin, 413, "body too large");
        return;
    }
    let bearer = auth.as_deref().and_then(|a| a.strip_prefix("Bearer ")).map(str::trim);
    let token_ok = bearer.is_some_and(|t| ct_eq(t, &ctx.token))
        || (path == "/stream" && qget(&query, "token").is_some_and(|t| ct_eq(t, &ctx.token)));
    if !token_ok {
        reject(r.get_mut(), origin, 401, "unauthorized");
        return;
    }
    let mut body = vec![0u8; len];
    if r.read_exact(&mut body).is_err() {
        return;
    }

    if method == "GET" && path == "/stream" {
        let since = match last_id.as_deref().map(str::to_string).or_else(|| qget(&query, "since").map(str::to_string)) {
            None => Ok(0),
            Some(s) => s.parse::<u64>().map_err(|_| "bad since".to_string()),
        };
        match since {
            Ok(since) => {
                let _ = serve_sse(ctx, &mut w, origin, since, &query);
            }
            Err(m) => {
                let _ = respond(&mut w, 400, origin, &err(400, m).1.to_string());
            }
        }
        return;
    }

    let (code, v) = match route(ctx, &method, &path, &query, &body) {
        Ok(res) => res,
        Err(res) => res,
    };
    let _ = respond(&mut w, code, origin, &v.to_string());
}

fn parse_body(body: &[u8]) -> Result<Value, Res> {
    let text = std::str::from_utf8(body).map_err(|_| err(400, "body is not UTF-8"))?;
    json::parse(text).map_err(|e| err(400, format!("bad JSON: {e}")))
}

fn route(ctx: &Ctx, method: &str, path: &str, q: &[(String, String)], body: &[u8]) -> Result<Res, Res> {
    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let uptime = ctx.started.elapsed().as_millis() as u64;
    let res = match (method, segs.as_slice()) {
        ("GET", ["health"]) => ask_res(ctx, move |e| {
            (
                200,
                obj(vec![
                    ("ok", Value::Bool(true)),
                    ("version", Value::str("0.1")),
                    ("running", Value::Num(e.running() as f64)),
                    ("max_parallel", Value::Num(e.max_parallel() as f64)),
                    ("uptime_ms", Value::Num(uptime as f64)),
                ]),
            )
        }),
        ("GET", ["agents"]) => ask_res(ctx, |e| {
            let tasks = e.tasks();
            let sessions = e.sessions();
            let mut seen: Vec<&str> = sessions.iter().map(|s| s.key.as_str()).collect();
            let mut out: Vec<Value> = sessions.iter().map(|s| Value::Obj(agent_fields(s, &tasks))).collect();
            // agents known only from tasks, before any session claims their key
            for k in tasks.iter().filter_map(|t| t.session_key.as_deref()) {
                if !seen.contains(&k) {
                    seen.push(k);
                    out.push(Value::Obj(task_agent_fields(k, &tasks)));
                }
            }
            (200, Value::Arr(out))
        }),
        ("GET", ["agents", key]) => {
            let key = key.to_string();
            ask_res(ctx, move |e| {
                let tasks = e.tasks();
                let mut fields = match e.sessions().into_iter().find(|s| s.key == key) {
                    Some(s) => agent_fields(&s, &tasks),
                    None if tasks.iter().any(|t| t.session_key.as_deref() == Some(key.as_str())) => {
                        task_agent_fields(&key, &tasks)
                    }
                    None => return err(404, format!("no agent '{key}'")),
                };
                let keys = task_keys(&tasks);
                let all = e.events_since(0);
                let recent: Vec<Value> = all
                    .iter()
                    .filter(|l| keys.get(&l.task).cloned().flatten().as_deref() == Some(key.as_str()))
                    .rev()
                    .take(50)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .map(|l| event_json(l, keys.get(&l.task).cloned().flatten().as_deref()))
                    .collect();
                fields.push(("recent".into(), Value::Arr(recent)));
                (200, Value::Obj(fields))
            })
        }
        ("GET", ["tasks"]) => {
            let want: Option<Vec<String>> = qget(q, "state").map(|s| s.split(',').map(str::to_string).collect());
            ask_res(ctx, move |e| {
                let tasks = e.tasks();
                let out = tasks
                    .iter()
                    .filter(|t| want.as_ref().is_none_or(|w| w.iter().any(|s| s == t.state.name())))
                    .map(task_json)
                    .collect();
                (200, Value::Arr(out))
            })
        }
        ("POST", ["tasks"]) => {
            let v = match parse_body(body) {
                Ok(v) => v,
                Err(e) => return Ok(e),
            };
            ask_res(ctx, move |e| create_task(e, &v))
        }
        ("GET", ["tasks", id]) => {
            let id = id.to_string();
            ask_res(ctx, move |e| match e.tasks().iter().find(|t| t.id == id) {
                Some(t) => (200, task_json(t)),
                None => err(404, format!("no task '{id}'")),
            })
        }
        ("GET", ["tasks", id, "thread"]) => {
            let since = qnum(q, "since", 0).map_err(|m| err(400, m))?;
            let id = id.to_string();
            ask_res(ctx, move |e| {
                let tasks = e.tasks();
                // a follow-up id resolves to its root, so any turn gives the whole thread
                let mut root_id = id.clone();
                while let Some((p, _)) = root_id.rsplit_once(".m") {
                    if follow_n(p, &root_id).is_some() && tasks.iter().any(|t| t.id == p) {
                        root_id = p.to_string();
                    } else {
                        break;
                    }
                }
                let Some(root) = tasks.iter().find(|t| t.id == root_id) else {
                    return err(404, format!("no task '{id}'"));
                };
                let mut turns: Vec<(u64, &Task)> = tasks.iter().filter_map(|t| Some((follow_n(&root_id, &t.id)?, t))).collect();
                turns.sort_by_key(|(n, _)| *n);
                let mut all: Vec<&Task> = vec![root];
                all.extend(turns.iter().map(|(_, t)| *t));
                let ids: HashSet<&str> = all.iter().map(|t| t.id.as_str()).collect();
                let keys = task_keys(&tasks);
                let events: Vec<Value> = e
                    .events_since(since)
                    .iter()
                    .filter(|l| ids.contains(l.task.as_str()))
                    .map(|l| event_json(l, keys.get(&l.task).cloned().flatten().as_deref()))
                    .collect();
                let turns: Vec<Value> = all.iter().map(|t| task_json(t)).collect();
                let body = obj(vec![
                    ("root", task_json(root)),
                    ("turns", Value::Arr(turns)),
                    ("events", Value::Arr(events)),
                ]);
                (200, body)
            })
        }
        ("POST", ["tasks", id, "cancel"]) => {
            let id = id.to_string();
            ask_res(ctx, move |e| {
                let r = e.cancel(&id);
                task_result(e, &id, r)
            })
        }
        ("POST", ["tasks", id, "messages"]) => {
            let v = match parse_body(body) {
                Ok(v) => v,
                Err(e) => return Ok(e),
            };
            let id = id.to_string();
            ask_res(ctx, move |e| {
                let text = v.get("text").and_then(Value::as_str).unwrap_or("").to_string();
                match e.message(&id, &text) {
                    Ok(task) => (202, obj(vec![("task", Value::str(&task))])),
                    Err(MsgErr::NoTask) => err(404, format!("no task '{id}'")),
                    Err(MsgErr::Empty) => err(400, "text is empty"),
                    Err(MsgErr::TooLong) => err(400, "text is over 32768 bytes"),
                    Err(MsgErr::NoSession) => err(409, format!("task '{id}' has no session")),
                    Err(MsgErr::Submit(m)) => err(400, m),
                }
            })
        }
        ("POST", ["tasks", id, "retry"]) => {
            let id = id.to_string();
            ask_res(ctx, move |e| {
                let r = e.retry(&id);
                task_result(e, &id, r)
            })
        }
        ("GET", ["graph"]) => ask_res(ctx, |e| {
            let tasks = e.tasks();
            let edges = tasks
                .iter()
                .flat_map(|t| t.deps.iter().map(move |d| obj(vec![("from", Value::str(d)), ("to", Value::str(&t.id))])))
                .collect();
            (200, obj(vec![("nodes", Value::Arr(tasks.iter().map(task_json).collect())), ("edges", Value::Arr(edges))]))
        }),
        ("GET", ["events"]) => {
            let since = qnum(q, "since", 0).map_err(|m| err(400, m))?;
            let limit = qnum(q, "limit", 500).map_err(|m| err(400, m))? as usize;
            let (task_f, agent_f) = (qget(q, "task").map(str::to_string), qget(q, "agent").map(str::to_string));
            ask_res(ctx, move |e| {
                let keys = task_keys(&e.tasks());
                let out = e
                    .events_since(since)
                    .iter()
                    .filter(|l| task_f.as_deref().is_none_or(|t| l.task == t))
                    .filter(|l| {
                        agent_f.as_deref().is_none_or(|a| keys.get(&l.task).cloned().flatten().as_deref() == Some(a))
                    })
                    .take(limit)
                    .map(|l| event_json(l, keys.get(&l.task).cloned().flatten().as_deref()))
                    .collect();
                (200, Value::Arr(out))
            })
        }
        ("GET", ["approvals"]) => {
            let want = qget(q, "status").map(str::to_string);
            ask_res(ctx, move |e| {
                let mut out: Vec<Value> = e
                    .tasks()
                    .iter()
                    .filter(|t| matches!(t.state, TaskState::NeedsApproval { .. }))
                    .map(|t| approval_json(t, e.held_call(&t.id), t.created_ms, "pending"))
                    .collect();
                out.extend(e.decisions().iter().cloned());
                out.retain(|a| want.as_deref().is_none_or(|s| a.get("status").and_then(Value::as_str) == Some(s)));
                out.sort_by_key(|a| std::cmp::Reverse(ms_of(a)));
                (200, Value::Arr(out))
            })
        }
        ("POST", ["approvals", id, "approve"]) => {
            let Some(task) = id.strip_prefix('a').map(str::to_string) else {
                return Err(err(404, format!("no approval '{id}'")));
            };
            ask_res(ctx, move |e| decide(e, &task, "approved", |e, t| e.approve(t)))
        }
        ("POST", ["approvals", id, "deny"]) => {
            let Some(task) = id.strip_prefix('a').map(str::to_string) else {
                return Err(err(404, format!("no approval '{id}'")));
            };
            ask_res(ctx, move |e| {
                if !e.tasks().iter().any(|t| t.id == task && matches!(t.state, TaskState::NeedsApproval { .. })) {
                    return err(409, format!("task {task} is not awaiting approval"));
                }
                decide(e, &task, "denied", |e, t| e.deny(t))
            })
        }
        ("GET", ["usage"]) => ask_res(ctx, |e| (200, Value::Arr(usage_rows(&e.tasks(), &e.events_since(0), e.limits())))),
        ("GET", ["budgets"]) => ask_res(ctx, |e| (200, caps_json(e.budgets()))),
        ("PUT", ["budgets"]) => {
            let Some(caps) = std::str::from_utf8(body).ok().and_then(parse_caps) else {
                return Err(err(400, "budgets must be {kind: {window: 0.0-1.0}}"));
            };
            ask_res(ctx, move |e| match e.set_budgets(caps) {
                Ok(()) => (200, caps_json(e.budgets())),
                Err(m) => err(500, m.to_string()),
            })
        }
        ("GET", ["triggers"]) => ask_res(ctx, |e| (200, Value::Arr(e.triggers().iter().map(Trigger::to_json).collect()))),
        ("POST", ["triggers"]) => {
            let v = match parse_body(body) {
                Ok(v) => v,
                Err(e) => return Ok(e),
            };
            ask_res(ctx, move |e| create_trigger(e, &v))
        }
        ("POST", ["triggers", id, "fire"]) => {
            let id = id.to_string();
            ask_res(ctx, move |e| match e.fire_now(&id) {
                Ok(outcome) => (200, obj(vec![("outcome", Value::str(outcome))])),
                Err(m) => trigger_err(m),
            })
        }
        ("POST", ["triggers", id, action @ ("enable" | "disable")]) => {
            let (id, on) = (id.to_string(), *action == "enable");
            ask_res(ctx, move |e| {
                let r = e.set_trigger_enabled(&id, on);
                trigger_result(e, &id, r)
            })
        }
        ("DELETE", ["triggers", id]) => {
            let id = id.to_string();
            ask_res(ctx, move |e| match e.remove_trigger(&id) {
                Ok(()) => (200, obj(vec![("removed", Value::str(&id))])),
                Err(m) => trigger_err(m),
            })
        }
        _ => err(404, format!("no route {method} {path}")),
    };
    Ok(res)
}

/// Serve the SSE stream. Replays the log after `since`, then forwards live events.
fn serve_sse(ctx: &Ctx, w: &mut TcpStream, origin: Option<&str>, since: u64, q: &[(String, String)]) -> io::Result<()> {
    let (task_f, agent_f) = (qget(q, "task").map(str::to_string), qget(q, "agent").map(str::to_string));
    let Some((backlog, rx, tasks)) = ask(ctx, move |e| {
        let rx = e.subscribe();
        (e.events_since(since), rx, e.tasks())
    }) else {
        return respond(w, 503, origin, &err(503, "engine unavailable").1.to_string());
    };
    write!(
        w,
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: close\r\n{}\r\n",
        cors(origin)
    )?;
    let mut keys: HashMap<String, Option<String>> = task_keys(&tasks);
    let mut last = since;
    let mut feed = Vec::new();
    feed.extend(backlog.into_iter().rev().map(Some));
    loop {
        let next = if let Some(l) = feed.pop() {
            l
        } else {
            match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(l) => Some(l),
                Err(RecvTimeoutError::Timeout) => {
                    write!(w, ": ping\n\n")?;
                    w.flush()?;
                    continue;
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        };
        let Some(l) = next else { break };
        if l.seq <= last {
            continue;
        }
        last = l.seq;
        let key = match keys.get(&l.task) {
            Some(k) => k.clone(),
            None => {
                let fresh = ask(ctx, |e| task_keys(&e.tasks())).unwrap_or_default();
                keys = fresh;
                keys.get(&l.task).cloned().flatten()
            }
        };
        if task_f.as_deref().is_some_and(|t| t != l.task) || agent_f.as_deref().is_some_and(|a| key.as_deref() != Some(a)) {
            continue;
        }
        let kind = kind_of(&l.event);
        write!(w, "id: {}\nevent: {kind}\ndata: {}\n\n", l.seq, event_json(&l, key.as_deref()))?;
        match &l.event {
            Event::State { state, .. } if state == "needs_approval" => {
                let id = l.task.clone();
                if let Some(Some(ap)) = ask(ctx, move |e| {
                    let t = e.tasks().into_iter().find(|t| t.id == id)?;
                    Some(approval_json(&t, e.held_call(&t.id), l_ms(&t), "pending"))
                }) {
                    write!(w, "event: approval\ndata: {ap}\n\n")?;
                }
            }
            Event::Usage { .. } => {
                let row = ask(ctx, |e| usage_rows(&e.tasks(), &e.events_since(0), e.limits())).unwrap_or_default();
                let agent = tasks_kind(&tasks, &l.task).unwrap_or("generic");
                if let Some(r) = row.iter().find(|r| r.get("kind").and_then(Value::as_str) == Some(agent)) {
                    write!(w, "event: usage\ndata: {r}\n\n")?;
                }
            }
            _ => {}
        }
        w.flush()?;
    }
    Ok(())
}

fn l_ms(t: &Task) -> u64 {
    t.created_ms
}

fn tasks_kind(tasks: &[Task], id: &str) -> Option<&'static str> {
    tasks.iter().find(|t| t.id == id).map(|t| kind_name(&t.agent))
}

fn kind_of(e: &Event) -> &'static str {
    match e {
        Event::Session { .. } => "session",
        Event::Text { .. } => "text",
        Event::ToolCall { .. } => "tool_call",
        Event::ToolResult { .. } => "tool_result",
        Event::Usage { .. } => "usage",
        Event::Result { .. } => "result",
        Event::Raw { .. } => "raw",
        Event::Stderr { .. } => "stderr",
        Event::Exit { .. } => "exit",
        Event::State { .. } => "state",
        Event::Approval { .. } => "approval",
        Event::Trigger { .. } => "trigger",
        Event::RateLimit { .. } => "rate_limit",
        Event::Failover { .. } => "failover",
        Event::User { .. } => "user",
    }
}

fn task_keys(tasks: &[Task]) -> HashMap<String, Option<String>> {
    tasks.iter().map(|t| (t.id.clone(), t.session_key.clone())).collect()
}

pub fn kind_name(a: &AgentKind) -> &'static str {
    match a {
        AgentKind::Claude => "claude",
        AgentKind::Codex => "codex",
        AgentKind::OpenCode => "opencode",
        AgentKind::Gemini => "gemini",
        AgentKind::Suffice => "suffice",
        AgentKind::Generic { .. } => "generic",
    }
}

fn trigger_err(m: String) -> Res {
    if m.starts_with("no trigger") {
        err(404, m)
    } else {
        err(400, m)
    }
}

fn trigger_result(e: &Engine, id: &str, r: Result<(), String>) -> Res {
    match r {
        Err(m) => trigger_err(m),
        Ok(()) => match e.triggers().iter().find(|t| t.id == id) {
            Some(t) => (200, t.to_json()),
            None => err(404, format!("no trigger '{id}'")),
        },
    }
}

fn create_trigger(e: &mut Engine, v: &Value) -> Res {
    let Some(id) = v.get("id").and_then(Value::as_str) else { return err(400, "id is required") };
    let when = match v.get("when").ok_or_else(|| "when is required".to_string()).and_then(When::from_json) {
        Ok(w) => w,
        Err(m) => return err(400, m),
    };
    let template = v.get("template").cloned().unwrap_or(Value::Null);
    if !matches!(template, Value::Obj(_)) {
        return err(400, "template must be an object");
    }
    if let Err(m) = e.add_trigger(id, when, template) {
        return err(400, m);
    }
    match e.triggers().iter().find(|t| t.id == id) {
        Some(t) => (201, t.to_json()),
        None => err(500, "trigger vanished after add"),
    }
}

fn task_result(e: &Engine, id: &str, r: Result<(), String>) -> Res {
    match r {
        Err(m) if m.starts_with("no task") => err(404, m),
        Err(m) => err(400, m),
        Ok(()) => match e.tasks().iter().find(|t| t.id == id) {
            Some(t) => (200, task_json(t)),
            None => err(404, format!("no task '{id}'")),
        },
    }
}

/// The n of a follow-up id `<root>.m<n>`, or None for any other id.
fn follow_n(root: &str, id: &str) -> Option<u64> {
    let n = id.strip_prefix(root)?.strip_prefix(".m")?;
    if n.is_empty() || !n.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    n.parse().ok()
}

fn task_json(t: &Task) -> Value {
    let (reason, pid) = match &t.state {
        TaskState::NeedsApproval { reason } => (Some(reason.as_str()), None),
        TaskState::Failed { error } => (Some(error.as_str()), None),
        TaskState::Running { pid } => (None, Some(*pid as f64)),
        _ => (None, None),
    };
    obj(vec![
        ("id", Value::str(&t.id)),
        ("agent", Value::str(kind_name(&t.agent))),
        ("session_key", opt(t.session_key.as_deref())),
        ("prompt", Value::str(&t.prompt)),
        ("cwd", Value::Str(t.cwd.to_string_lossy().into_owned())),
        ("model", opt(t.model.as_deref())),
        ("access", Value::str(t.access.name())),
        ("deps", Value::Arr(t.deps.iter().map(|d| Value::str(d.as_str())).collect())),
        ("state", Value::str(t.state.name())),
        ("reason", opt(reason)),
        ("pid", pid.map_or(Value::Null, Value::Num)),
        ("attempts", Value::Num(t.attempts as f64)),
        ("max_retries", Value::Num(t.max_retries as f64)),
        ("timeout_secs", Value::Num(t.timeout_secs as f64)),
        ("created_ms", Value::Num(t.created_ms as f64)),
    ])
}

/// Build and submit a task from a POST /tasks body. Errors are 400.
fn create_task(e: &mut Engine, v: &Value) -> Res {
    let taken: HashSet<String> = e.tasks().into_iter().map(|t| t.id).collect();
    let id = match v.get("id").and_then(Value::as_str) {
        Some(s) => s.to_string(),
        None => (1..).map(|n| format!("t{n}")).find(|id| !taken.contains(id)).unwrap_or_default(),
    };
    let task = match parse_task(v, id.clone()) {
        Ok(t) => t,
        Err(m) => return err(400, m),
    };
    let fallback = match parse_fallback(v) {
        Ok(f) => f,
        Err(m) => return err(400, m),
    };
    if !matches!(task.access, Access::Full) {
        if let Some(k) = fallback.iter().find(|k| !crate::adapter::enforces_access(k)) {
            return err(400, format!("{} can't enforce {}", kind_name(k), task.access.name()));
        }
    }
    if let Err(m) = e.submit_with(task, fallback) {
        return err(400, m);
    }
    match e.tasks().iter().find(|t| t.id == id) {
        Some(t) => (201, task_json(t)),
        None => err(500, "task vanished after submit"),
    }
}

/// Optional "fallback": agent names tried in order on an over-cap or rate-limited exit. Codex is never automatic.
fn parse_fallback(v: &Value) -> Result<Vec<AgentKind>, String> {
    let Some(names) = v.get("fallback").and_then(Value::as_arr) else { return Ok(vec![]) };
    names
        .iter()
        .map(|n| match n.as_str() {
            Some("claude") => Ok(AgentKind::Claude),
            Some("opencode") => Ok(AgentKind::OpenCode),
            Some("gemini") => Ok(AgentKind::Gemini),
            Some("suffice") => Ok(AgentKind::Suffice),
            Some("codex") => Err("codex is never an automatic fallback".to_string()),
            _ => Err("fallback must be a list of claude, opencode, gemini or suffice".to_string()),
        })
        .collect()
}

pub fn parse_task(v: &Value, id: String) -> Result<Task, String> {
    let s = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
    let agent = match v.get("agent") {
        Some(Value::Str(a)) => match a.as_str() {
            "claude" => AgentKind::Claude,
            "codex" => AgentKind::Codex,
            "opencode" => AgentKind::OpenCode,
            "gemini" => AgentKind::Gemini,
            "suffice" => AgentKind::Suffice,
            other => return Err(format!("unknown agent '{other}'")),
        },
        Some(g @ Value::Obj(_)) => {
            let g = g.get("generic").ok_or("agent object must be {\"generic\": {...}}")?;
            let program = g.get("program").and_then(Value::as_str).ok_or("generic needs program")?.to_string();
            let args = match g.get("args") {
                None => vec![],
                Some(a) => a
                    .as_arr()
                    .ok_or("args must be an array")?
                    .iter()
                    .map(|x| x.as_str().map(str::to_string).ok_or("args must be strings"))
                    .collect::<Result<_, _>>()?,
            };
            AgentKind::Generic { program, args }
        }
        Some(_) => return Err("agent must be a name or {\"generic\": {...}}".into()),
        None => return Err("missing agent".into()),
    };
    let prompt = s("prompt").ok_or("missing prompt")?;
    let cwd = PathBuf::from(s("cwd").ok_or("missing cwd")?);
    let deps = match v.get("deps") {
        None => vec![],
        Some(d) => d
            .as_arr()
            .ok_or("deps must be an array")?
            .iter()
            .map(|x| x.as_str().map(str::to_string).ok_or("deps must be strings"))
            .collect::<Result<_, _>>()?,
    };
    let num = |k: &str, default: i64| -> Result<i64, String> {
        match v.get(k) {
            None => Ok(default),
            Some(x) => x.as_i64().ok_or_else(|| format!("{k} must be an integer")),
        }
    };
    let env: BTreeMap<String, String> = match v.get("env") {
        None => BTreeMap::new(),
        Some(Value::Obj(kv)) => kv
            .iter()
            .map(|(k, x)| x.as_str().map(|x| (k.clone(), x.to_string())).ok_or("env values must be strings"))
            .collect::<Result<_, _>>()?,
        Some(_) => return Err("env must be an object".into()),
    };
    Ok(Task {
        id,
        agent,
        prompt,
        cwd,
        session_key: s("session_key"),
        deps,
        max_retries: num("max_retries", 0)?.try_into().map_err(|_| "max_retries out of range")?,
        attempts: 0,
        timeout_secs: num("timeout_secs", 1800)?.try_into().map_err(|_| "timeout_secs out of range")?,
        model: s("model"),
        access: match v.get("access") {
            None => Access::Edit,
            Some(Value::Str(a)) => Access::from_name(a).ok_or("access must be \"read\", \"edit\" or \"full\"")?,
            Some(_) => return Err("access must be a string".into()),
        },
        env,
        state: TaskState::Pending,
        created_ms: now_ms(),
    })
}

fn agent_fields(s: &crate::session::Session, tasks: &[Task]) -> Vec<(String, Value)> {
    let busy = s.busy_task.as_deref();
    let status = match busy.and_then(|id| tasks.iter().find(|t| t.id == id)).map(|t| &t.state) {
        Some(TaskState::Running { .. }) => "running",
        Some(TaskState::NeedsApproval { .. }) => "waiting_approval",
        _ => "idle",
    };
    vec![
        ("key".into(), Value::str(&s.key)),
        ("kind".into(), Value::str(kind_name(&s.agent))),
        ("subscription".into(), Value::Null),
        ("status".into(), Value::str(status)),
        ("task".into(), opt(busy)),
        ("native_id".into(), opt(s.native_id.as_deref())),
        ("runs".into(), Value::Num(s.runs as f64)),
        ("last_ms".into(), Value::Num(s.last_ms as f64)),
    ]
}

fn event_json(l: &Logged, agent_key: Option<&str>) -> Value {
    let Value::Obj(kv) = logged_json(l) else { return Value::Null };
    let mut out = Vec::with_capacity(kv.len() + 1);
    for (k, v) in kv {
        match k.as_str() {
            "type" => out.push(("kind".to_string(), v)),
            "task" => {
                out.push((k, v));
                out.push(("agent_key".to_string(), opt(agent_key)));
            }
            _ => out.push((k, v)),
        }
    }
    Value::Obj(out)
}

/// Apply an approve/deny action; on success, append the decided approval to the log.
fn decide(e: &mut Engine, task: &str, status: &str, act: impl FnOnce(&mut Engine, &str) -> Result<(), String>) -> Res {
    // snapshot before the action: the held call and task fields are gone after it
    let snap = e.tasks().into_iter().find(|t| t.id == task).map(|t| approval_json(&t, e.held_call(task), now_ms(), status));
    let r = act(e, task);
    if r.is_ok() {
        if let Some(rec) = snap {
            if let Err(m) = e.record_decision(task, status, rec) {
                return err(500, m);
            }
        }
    }
    task_result(e, task, r)
}

fn ms_of(a: &Value) -> u64 {
    match a.get("ms") {
        Some(Value::Num(n)) => *n as u64,
        _ => 0,
    }
}

/// An agent known only from its tasks: status and kind come from those tasks.
fn task_agent_fields(key: &str, tasks: &[Task]) -> Vec<(String, Value)> {
    let mine: Vec<&Task> = tasks.iter().filter(|t| t.session_key.as_deref() == Some(key)).collect();
    let status = if mine.iter().any(|t| matches!(t.state, TaskState::Running { .. })) {
        "running"
    } else if mine.iter().any(|t| matches!(t.state, TaskState::NeedsApproval { .. })) {
        "waiting_approval"
    } else if mine.last().is_some_and(|t| matches!(t.state, TaskState::Failed { .. })) {
        "error"
    } else {
        "idle"
    };
    let last = mine.last();
    vec![
        ("key".into(), Value::str(key)),
        ("kind".into(), Value::str(last.map_or("generic", |t| kind_name(&t.agent)))),
        ("subscription".into(), Value::Null),
        ("status".into(), Value::str(status)),
        ("task".into(), Value::Null),
        ("native_id".into(), Value::Null),
        ("runs".into(), Value::Num(0.0)),
        ("last_ms".into(), Value::Num(last.map_or(0, |t| t.created_ms) as f64)),
    ]
}

fn approval_json(t: &Task, held: Option<(String, String)>, ms: u64, status: &str) -> Value {
    let reason = match &t.state {
        TaskState::NeedsApproval { reason } => Some(reason.as_str()),
        _ => None,
    };
    let tool = match &held {
        Some((name, input)) => obj(vec![("name", Value::str(name)), ("input", Value::str(input))]),
        None => Value::Null,
    };
    obj(vec![
        ("id", Value::Str(format!("a{}", t.id))),
        ("task", Value::str(&t.id)),
        ("agent_key", opt(t.session_key.as_deref())),
        ("kind", Value::str(if held.is_some() { "tool_call" } else { "task" })),
        ("reason", opt(reason)),
        ("tool", tool),
        ("prompt", Value::str(&t.prompt)),
        ("status", Value::str(status)),
        ("ms", Value::Num(ms as f64)),
    ])
}

/// One /usage row per agent kind (subscriptions are not tracked yet, so subscription and window are null).
fn usage_rows(tasks: &[Task], events: &[Logged], saved: &crate::orchestrator::Limits) -> Vec<Value> {
    let kinds: HashMap<&str, &'static str> = tasks.iter().map(|t| (t.id.as_str(), kind_name(&t.agent))).collect();
    let mut sums: BTreeMap<&'static str, (u64, u64, u64, Option<f64>)> = BTreeMap::new();
    // latest plan window per kind: (window, utilization, resets_at)
    let mut plan: HashMap<&'static str, (String, Option<f64>, Option<u64>)> = HashMap::new();
    for l in events {
        let Some(&kind) = kinds.get(l.task.as_str()) else { continue };
        let row = sums.entry(kind).or_default();
        match &l.event {
            Event::RateLimit { window, utilization, resets_at, .. } => {
                plan.insert(kind, (window.clone(), *utilization, *resets_at));
            }
            Event::Exit { .. } => row.0 += 1,
            Event::Usage { input_tokens, output_tokens, cost_usd } => {
                row.1 += input_tokens;
                row.2 += output_tokens;
                if let Some(c) = cost_usd {
                    row.3 = Some(row.3.unwrap_or(0.0) + c);
                }
            }
            _ => {}
        }
    }
    // no rate_limit event in the log (restart, trimmed log): use the saved window with the highest utilization
    for (&kind, _) in sums.iter() {
        if plan.contains_key(kind) {
            continue;
        }
        let best = saved.get(kind).and_then(|ws| ws.iter().max_by(|a, b| a.1 .0.unwrap_or(0.0).total_cmp(&b.1 .0.unwrap_or(0.0))));
        if let Some((w, (u, r, _))) = best {
            plan.insert(kind, (w.clone(), *u, *r));
        }
    }
    sums.into_iter()
        .map(|(kind, (runs, i, o, cost))| {
            let (window, percent, resets_ms) = match plan.get(kind) {
                Some((w, u, r)) => (Value::str(w), u.map_or(Value::Null, |u| Value::Num(u * 100.0)), r.map_or(Value::Null, |r| Value::Num((r * 1000) as f64))),
                None => (Value::Null, Value::Null, Value::Null),
            };
            obj(vec![
                ("subscription", Value::Null),
                ("kind", Value::str(kind)),
                ("window", window),
                ("runs", Value::Num(runs as f64)),
                ("input_tokens", Value::Num(i as f64)),
                ("output_tokens", Value::Num(o as f64)),
                ("cost_usd", cost.map_or(Value::Null, Value::Num)),
                ("percent", percent),
                ("resets_ms", resets_ms),
                ("status", Value::str("ok")),
            ])
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_and_plus() {
        assert_eq!(pct_decode("a%20b+c", true).as_deref(), Some("a b c"));
        assert_eq!(pct_decode("a+b", false).as_deref(), Some("a+b"));
        assert_eq!(pct_decode("%zz", false), None);
        assert_eq!(pct_decode("%+1", false), None);
    }

    #[test]
    fn compares_tokens_in_constant_time_shape() {
        assert!(ct_eq("abc", "abc"));
        assert!(!ct_eq("abc", "abd"));
        assert!(!ct_eq("abc", "ab"));
    }
}
