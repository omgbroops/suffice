//! Triggers: a saved task template that the engine submits on a schedule, when a task
//! with a given prefix finishes, or on demand. State lives in triggers.json in the engine dir.
use crate::json::Value;
use std::ffi::c_char;
use std::io;
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
pub enum When {
    Every { secs: u64 },
    Daily { hour: u8, minute: u8 },
    OnDone { task_prefix: String },
    Manual,
}

impl When {
    pub fn from_json(v: &Value) -> Result<When, String> {
        let kind = v.get("kind").and_then(Value::as_str).ok_or("when.kind is required")?;
        Ok(match kind {
            "every" => {
                let secs = v.get("secs").and_then(Value::as_i64).filter(|s| *s >= 1).ok_or("when.secs must be >= 1")?;
                When::Every { secs: secs as u64 }
            }
            "daily" => {
                let hour = v.get("hour").and_then(Value::as_i64).filter(|h| (0..24).contains(h)).ok_or("when.hour must be 0-23")?;
                let minute = v.get("minute").and_then(Value::as_i64).filter(|m| (0..60).contains(m)).ok_or("when.minute must be 0-59")?;
                When::Daily { hour: hour as u8, minute: minute as u8 }
            }
            "on_done" => {
                let p = v.get("task_prefix").and_then(Value::as_str).filter(|p| !p.is_empty()).ok_or("when.task_prefix is required")?;
                When::OnDone { task_prefix: p.to_string() }
            }
            "manual" => When::Manual,
            other => return Err(format!("unknown when.kind '{other}'")),
        })
    }

    pub fn to_json(&self) -> Value {
        match self {
            When::Every { secs } => Value::Obj(vec![("kind".into(), Value::str("every")), ("secs".into(), Value::Num(*secs as f64))]),
            When::Daily { hour, minute } => Value::Obj(vec![
                ("kind".into(), Value::str("daily")),
                ("hour".into(), Value::Num(*hour as f64)),
                ("minute".into(), Value::Num(*minute as f64)),
            ]),
            When::OnDone { task_prefix } => {
                Value::Obj(vec![("kind".into(), Value::str("on_done")), ("task_prefix".into(), Value::str(task_prefix))])
            }
            When::Manual => Value::Obj(vec![("kind".into(), Value::str("manual"))]),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Trigger {
    pub id: String,
    pub when: When,
    /// A task template in the POST /tasks body shape; the engine adds the id.
    pub template: Value,
    pub enabled: bool,
    pub fires: u32,
    pub last_fire_ms: Option<u64>,
    /// Next scheduled time for Every/Daily; 0 for OnDone and Manual.
    pub next_due_ms: u64,
    /// OnDone only: finished task ids already matched, so each one fires the trigger once.
    pub done_seen: Vec<String>,
    pub created_ms: u64,
    /// Consecutive real submit failures; the trigger disables itself at 3.
    pub failures: u32,
    /// OnDone fire times in the last hour, for the rate cap.
    /// shortcut: not persisted, so a restart resets the cap; persist if restarts must not reset it.
    pub od_fires: Vec<u64>,
}

impl Trigger {
    pub fn new(id: String, when: When, template: Value, now: u64) -> Trigger {
        let next_due_ms = next_due(&when, now);
        Trigger { id, when, template, enabled: true, fires: 0, last_fire_ms: None, next_due_ms, done_seen: vec![], created_ms: now, failures: 0, od_fires: vec![] }
    }

    pub fn to_json(&self) -> Value {
        let opt = |o: Option<u64>| o.map_or(Value::Null, |v| Value::Num(v as f64));
        Value::Obj(vec![
            ("id".into(), Value::str(&self.id)),
            ("when".into(), self.when.to_json()),
            ("template".into(), self.template.clone()),
            ("enabled".into(), Value::Bool(self.enabled)),
            ("fires".into(), Value::Num(self.fires as f64)),
            ("last_fire_ms".into(), opt(self.last_fire_ms)),
            ("next_due_ms".into(), Value::Num(self.next_due_ms as f64)),
            ("done_seen".into(), Value::Arr(self.done_seen.iter().map(|s| Value::str(s)).collect())),
            ("created_ms".into(), Value::Num(self.created_ms as f64)),
            ("failures".into(), Value::Num(self.failures as f64)),
        ])
    }

    fn from_json(v: &Value) -> Result<Trigger, String> {
        let s = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string).ok_or(format!("trigger.{k} is required"));
        let n = |k: &str| v.get(k).and_then(Value::as_i64).unwrap_or(0).max(0) as u64;
        Ok(Trigger {
            id: s("id")?,
            when: When::from_json(v.get("when").ok_or("trigger.when is required")?)?,
            template: v.get("template").cloned().unwrap_or(Value::Null),
            enabled: matches!(v.get("enabled"), Some(Value::Bool(true))),
            fires: n("fires") as u32,
            last_fire_ms: v.get("last_fire_ms").and_then(Value::as_i64).map(|x| x.max(0) as u64),
            next_due_ms: n("next_due_ms"),
            done_seen: v.get("done_seen").and_then(Value::as_arr).unwrap_or(&[]).iter().filter_map(|x| x.as_str().map(str::to_string)).collect(),
            created_ms: n("created_ms"),
            failures: n("failures") as u32,
            od_fires: vec![],
        })
    }
}

/// The next scheduled time after `now`, in ms; 0 when the trigger is not time-based.
pub fn next_due(when: &When, now: u64) -> u64 {
    match when {
        When::Every { secs } => now.saturating_add(secs.saturating_mul(1000)),
        When::Daily { hour, minute } => {
            let off = local_offset_secs(now);
            let due = daily_due(now, *hour, *minute, off);
            // the offset at the target time can differ from now's (DST), so recompute with it
            let off_due = local_offset_secs(due);
            if off_due == off { due } else { daily_due(now, *hour, *minute, off_due) }
        }
        _ => 0,
    }
}

/// Records an OnDone fire at `now`; false when 20 already fell within the last hour.
pub fn od_allow(window: &mut Vec<u64>, now: u64) -> bool {
    const HOUR: u64 = 3_600_000;
    window.retain(|&t| now.saturating_sub(t) < HOUR);
    if window.len() >= 20 {
        return false;
    }
    window.push(now);
    true
}

/// True if an OnDone chain that starts at trigger `id` (with `prefix`) can lead back to `id`.
pub fn on_done_cycle(triggers: &[Trigger], id: &str, prefix: &str) -> bool {
    let od: Vec<(&str, &str)> = triggers
        .iter()
        .filter_map(|t| match &t.when {
            When::OnDone { task_prefix } => Some((t.id.as_str(), task_prefix.as_str())),
            _ => None,
        })
        .chain(std::iter::once((id, prefix)))
        .collect();
    let mut seen = vec![id];
    let mut stack = vec![id];
    while let Some(from) = stack.pop() {
        let out = format!("{from}-");
        for &(to, p) in &od {
            if !out.starts_with(p) {
                continue;
            }
            if to == id {
                return true;
            }
            if !seen.contains(&to) {
                seen.push(to);
                stack.push(to);
            }
        }
    }
    false
}

/// The first local wall-clock time of hour:minute strictly after `now_ms`, in UTC ms.
/// `offset_secs` is the local offset from UTC at that moment.
pub fn daily_due(now_ms: u64, hour: u8, minute: u8, offset_secs: i64) -> u64 {
    const DAY: i64 = 86_400;
    let local = now_ms as i64 / 1000 + offset_secs;
    let mut due = local - local.rem_euclid(DAY) + hour as i64 * 3600 + minute as i64 * 60;
    if due <= local {
        due += DAY;
    }
    ((due - offset_secs) * 1000) as u64
}

#[repr(C)]
struct Tm {
    tm_sec: i32,
    tm_min: i32,
    tm_hour: i32,
    tm_mday: i32,
    tm_mon: i32,
    tm_year: i32,
    tm_wday: i32,
    tm_yday: i32,
    tm_isdst: i32,
    tm_gmtoff: i64,
    tm_zone: *const c_char,
}

unsafe extern "C" {
    fn localtime_r(t: *const i64, out: *mut Tm) -> *mut Tm;
}

/// The local UTC offset in seconds at `now_ms` (0 if the platform call fails).
pub fn local_offset_secs(now_ms: u64) -> i64 {
    let t = (now_ms / 1000) as i64;
    let mut tm = std::mem::MaybeUninit::<Tm>::uninit();
    // SAFETY: localtime_r fills `tm` on success and returns null on failure.
    unsafe {
        if localtime_r(&t, tm.as_mut_ptr()).is_null() {
            return 0;
        }
        tm.assume_init().tm_gmtoff
    }
}

pub fn load(dir: &Path) -> io::Result<(Vec<Trigger>, Option<String>)> {
    let text = match std::fs::read_to_string(dir.join("triggers.json")) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok((vec![], None)),
        Err(e) => return Err(e),
    };
    let parsed = crate::json::parse(&text).and_then(|v| {
        v.as_arr().unwrap_or(&[]).iter().map(Trigger::from_json).collect::<Result<Vec<_>, String>>()
    });
    match parsed {
        Ok(triggers) => Ok((triggers, None)),
        // garbage or torn write: keep the file aside and start with no triggers rather than fail open
        Err(_) => {
            Ok((vec![], Some(crate::types::set_aside(&dir.join("triggers.json")))))
        }
    }
}

pub fn save(dir: &Path, triggers: &[Trigger]) -> io::Result<()> {
    let tmp = dir.join("triggers.json.tmp");
    let body = Value::Arr(triggers.iter().map(Trigger::to_json).collect());
    std::fs::write(&tmp, body.to_string())?;
    std::fs::rename(tmp, dir.join("triggers.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daily_due_respects_offset_and_rollover() {
        // UTC: 00:00 is strictly after 00:00 is false, so the next one is tomorrow.
        assert_eq!(daily_due(0, 0, 0, 0), 86_400_000);
        // UTC+1: local midnight is 23:00 UTC.
        assert_eq!(daily_due(0, 0, 0, 3600), 82_800_000);
        // 25h after epoch, 01:00 already passed today (UTC), so next is 01:00 on day 2.
        assert_eq!(daily_due(90_000_000, 1, 0, 0), 176_400_000);
    }
}

#[cfg(test)]
mod cap_tests {
    use super::*;

    #[test]
    fn od_cap_is_20_per_hour() {
        let mut w = vec![];
        assert!((0..20).all(|i| od_allow(&mut w, i)));
        assert!(!od_allow(&mut w, 20));
        assert!(od_allow(&mut w, 3_600_000));
    }

    #[test]
    fn on_done_cycles_are_detected() {
        let od = |id: &str, p: &str| Trigger::new(id.into(), When::OnDone { task_prefix: p.into() }, Value::Null, 0);
        assert!(on_done_cycle(&[], "s", "s-"));
        assert!(!on_done_cycle(&[], "a", "b-"));
        assert!(on_done_cycle(&[od("a", "b-")], "b", "a-"));
        assert!(on_done_cycle(&[od("a", "b-"), od("b", "c-")], "c", "a-"));
        assert!(!on_done_cycle(&[od("a", "b-")], "c", "a-"));
    }
}
