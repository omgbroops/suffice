//! Computer use (screenshot, mouse, keyboard) behind a `Desktop` trait, so the engine can drive any backend.
//! `run` validates every action, gates each one as a ToolCall, then performs it. Tests use `FakeDesktop`.
use crate::gate::{self, Verdict};
use crate::types::Event;
use std::io;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Button {
    Left,
    Right,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Screenshot,
    Click { x: i32, y: i32, button: Button },
    DoubleClick { x: i32, y: i32 },
    Move { x: i32, y: i32 },
    Drag { from: (i32, i32), to: (i32, i32) },
    Type { text: String },
    Key { combo: String },
    Scroll { x: i32, y: i32, dy: i32 },
    Wait { ms: u64 },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ActionResult {
    pub kind: &'static str,
    pub screenshot_png: Option<Vec<u8>>,
}

pub trait Desktop {
    fn screen_size(&self) -> (u32, u32);
    fn screenshot_png(&mut self) -> io::Result<Vec<u8>>;
    fn perform(&mut self, a: &Action) -> io::Result<()>;
}

/// Records performed actions. Screenshot is a solid 8x8 PNG whose color changes after each click.
pub struct FakeDesktop {
    pub width: u32,
    pub height: u32,
    pub performed: Vec<Action>,
    pub clicks: u32,
}

impl FakeDesktop {
    pub fn new(width: u32, height: u32) -> Self {
        FakeDesktop { width, height, performed: Vec::new(), clicks: 0 }
    }
}

impl Desktop for FakeDesktop {
    fn screen_size(&self) -> (u32, u32) {
        (self.width, self.height)
    }
    fn screenshot_png(&mut self) -> io::Result<Vec<u8>> {
        let c = (self.clicks as u8).wrapping_mul(70);
        let rgb = [c, 255 - c, 128].repeat(8 * 8);
        Ok(encode_png(8, 8, &rgb))
    }
    fn perform(&mut self, a: &Action) -> io::Result<()> {
        if matches!(a, Action::Click { .. } | Action::DoubleClick { .. }) {
            self.clicks += 1;
        }
        self.performed.push(a.clone());
        Ok(())
    }
}

// shortcut: live input untested here (TCC Accessibility/Screen Recording prompts blocked in this env); verify on Abhay's OK
pub struct MacDesktop;

impl Desktop for MacDesktop {
    // shortcut: size not queried, so every coordinate is rejected until this is wired (fail closed)
    fn screen_size(&self) -> (u32, u32) {
        (0, 0)
    }
    fn screenshot_png(&mut self) -> io::Result<Vec<u8>> {
        let path = std::env::temp_dir().join(format!("suffice-shot-{}-{}.png", std::process::id(), nanos()));
        let status = std::process::Command::new("/usr/sbin/screencapture").args(["-x", "-t", "png"]).arg(&path).status()?;
        if !status.success() {
            return Err(io::Error::other("screencapture failed"));
        }
        let bytes = std::fs::read(&path);
        let _ = std::fs::remove_file(&path);
        bytes
    }
    fn perform(&mut self, a: &Action) -> io::Result<()> {
        if matches!(a, Action::Screenshot) {
            return Ok(());
        }
        Err(io::Error::new(io::ErrorKind::Unsupported, "live input not implemented"))
    }
}

fn nanos() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
}

const MODS: &[&str] = &["cmd", "ctrl", "alt", "option", "shift"];
const KEYS: &[&str] = &[
    "esc", "enter", "return", "tab", "space", "delete", "backspace", "up", "down", "left", "right", "home", "end",
    "pageup", "pagedown",
];
// Canonical (sorted modifiers, key) combos that are refused outright.
const DANGEROUS: &[(&[&str], &str)] = &[
    (&["cmd"], "q"),
    (&["cmd"], "w"),
    (&["alt", "cmd"], "esc"),
    (&["cmd", "ctrl"], "q"),
    (&["cmd", "shift"], "q"),
    (&["cmd"], "delete"),
];

/// "cmd+s" -> (sorted modifiers with option mapped to alt, key).
fn parse_combo(combo: &str) -> Result<(Vec<String>, String), String> {
    let parts: Vec<String> = combo.split('+').map(|p| p.trim().to_lowercase()).collect();
    let Some((key, mods)) = parts.split_last() else { return Err("empty key combo".into()) };
    if key.is_empty() {
        return Err(format!("key combo has no key: {combo}"));
    }
    let fkey = key.strip_prefix('f').and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (1..=12).contains(&n));
    if !(key.chars().count() == 1 || KEYS.contains(&key.as_str()) || fkey) {
        return Err(format!("unknown key: {key}"));
    }
    let mut canon = Vec::new();
    for m in mods {
        if !MODS.contains(&m.as_str()) {
            return Err(format!("unknown modifier: {m}"));
        }
        canon.push(if m == "option" { "alt".to_string() } else { m.clone() });
    }
    canon.sort();
    canon.dedup();
    Ok((canon, key.clone()))
}

fn point(x: i32, y: i32, (w, h): (u32, u32)) -> Result<(), String> {
    if x < 0 || y < 0 || x as i64 >= w as i64 || y as i64 >= h as i64 {
        return Err(format!("({x},{y}) outside {w}x{h} screen"));
    }
    Ok(())
}

fn validate(a: &Action, size: (u32, u32)) -> Result<(), String> {
    match a {
        Action::Screenshot | Action::Wait { .. } => Ok(()),
        Action::Click { x, y, .. } | Action::DoubleClick { x, y } | Action::Move { x, y } | Action::Scroll { x, y, .. } => {
            point(*x, *y, size)
        }
        Action::Drag { from, to } => {
            point(from.0, from.1, size)?;
            point(to.0, to.1, size)
        }
        Action::Type { text } => {
            if text.chars().count() > 10_000 {
                return Err("text over 10000 chars".into());
            }
            Ok(())
        }
        Action::Key { combo } => {
            let (mods, key) = parse_combo(combo)?;
            let m: Vec<&str> = mods.iter().map(String::as_str).collect();
            if DANGEROUS.iter().any(|(dm, dk)| *dm == m.as_slice() && *dk == key) {
                return Err(format!("refused: system-dangerous key combo {combo}"));
            }
            Ok(())
        }
    }
}

fn kind(a: &Action) -> &'static str {
    match a {
        Action::Screenshot => "screenshot",
        Action::Click { .. } => "click",
        Action::DoubleClick { .. } => "double_click",
        Action::Move { .. } => "move",
        Action::Drag { .. } => "drag",
        Action::Type { .. } => "type",
        Action::Key { .. } => "key",
        Action::Scroll { .. } => "scroll",
        Action::Wait { .. } => "wait",
    }
}

/// JSON string literal with escaping.
fn js(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn input_json(a: &Action, context: &str) -> String {
    let mut f: Vec<String> = Vec::new();
    match a {
        Action::Screenshot => {}
        Action::Click { x, y, button } => {
            let b = if *button == Button::Left { "left" } else { "right" };
            f.push(format!("\"x\":{x}"));
            f.push(format!("\"y\":{y}"));
            f.push(format!("\"button\":{}", js(b)));
        }
        Action::DoubleClick { x, y } | Action::Move { x, y } => {
            f.push(format!("\"x\":{x}"));
            f.push(format!("\"y\":{y}"));
        }
        Action::Drag { from, to } => {
            f.push(format!("\"from\":[{},{}]", from.0, from.1));
            f.push(format!("\"to\":[{},{}]", to.0, to.1));
        }
        Action::Type { text } => f.push(format!("\"text\":{}", js(text))),
        Action::Key { combo } => f.push(format!("\"combo\":{}", js(combo))),
        Action::Scroll { x, y, dy } => {
            f.push(format!("\"x\":{x}"));
            f.push(format!("\"y\":{y}"));
            f.push(format!("\"dy\":{dy}"));
        }
        Action::Wait { ms } => f.push(format!("\"ms\":{ms}")),
    }
    f.push(format!("\"context\":{}", js(context)));
    format!("{{{}}}", f.join(","))
}

fn exec(d: &mut dyn Desktop, actions: &[Action], context: Option<&str>) -> Result<Vec<ActionResult>, String> {
    let size = d.screen_size();
    for (i, a) in actions.iter().enumerate() {
        validate(a, size).map_err(|e| format!("action {i}: {e}"))?;
    }
    let mut out = Vec::new();
    for (i, a) in actions.iter().enumerate() {
        if let Some(ctx) = context {
            let ev = Event::ToolCall { name: format!("computer_{}", kind(a)), input: input_json(a, ctx) };
            if let Verdict::Hold { reason } = gate::check_event(&ev) {
                return Err(format!("held: {reason}; {i} of {} actions ran", actions.len()));
            }
        }
        d.perform(a).map_err(|e| format!("action {i} failed: {e}"))?;
        let screenshot_png = if matches!(a, Action::Screenshot) {
            Some(d.screenshot_png().map_err(|e| format!("action {i} screenshot failed: {e}"))?)
        } else {
            None
        };
        out.push(ActionResult { kind: kind(a), screenshot_png });
    }
    Ok(out)
}

/// Validates all actions, then gates and performs each in order. Stops at the first Hold.
pub fn run(d: &mut dyn Desktop, actions: &[Action], context: &str) -> Result<Vec<ActionResult>, String> {
    exec(d, actions, Some(context))
}

/// Test-only: same validation and sequencing, no gate.
#[doc(hidden)]
pub fn run_ungated(d: &mut dyn Desktop, actions: &[Action]) -> Result<Vec<ActionResult>, String> {
    exec(d, actions, None)
}

fn crc32(parts: &[&[u8]]) -> u32 {
    let mut c = 0xFFFF_FFFFu32;
    for p in parts {
        for &b in *p {
            c ^= b as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            }
        }
    }
    !c
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &x in data {
        a = (a + x as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

fn chunk(out: &mut Vec<u8>, typ: &[u8; 4], data: &[u8]) {
    out.extend((data.len() as u32).to_be_bytes());
    out.extend(typ);
    out.extend(data);
    out.extend(crc32(&[typ, data]).to_be_bytes());
}

/// Minimal PNG: 8-bit RGB, one IDAT of stored (uncompressed) deflate blocks inside a zlib wrapper.
fn encode_png(w: u32, h: u32, rgb: &[u8]) -> Vec<u8> {
    let row = w as usize * 3;
    let mut raw = Vec::with_capacity((row + 1) * h as usize);
    for y in 0..h as usize {
        raw.push(0); // filter: none
        raw.extend(&rgb[y * row..(y + 1) * row]);
    }
    let mut z = vec![0x78, 0x01];
    let blocks: Vec<&[u8]> = raw.chunks(65535).collect();
    for (i, b) in blocks.iter().enumerate() {
        let len = b.len() as u16;
        z.push((i + 1 == blocks.len()) as u8);
        z.extend(len.to_le_bytes());
        z.extend((!len).to_le_bytes());
        z.extend(*b);
    }
    z.extend(adler32(&raw).to_be_bytes());

    let mut out = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    let mut ihdr = Vec::new();
    ihdr.extend(w.to_be_bytes());
    ihdr.extend(h.to_be_bytes());
    ihdr.extend([8, 2, 0, 0, 0]); // depth 8, RGB, deflate, no filter prep, no interlace
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &z);
    chunk(&mut out, b"IEND", &[]);
    out
}
