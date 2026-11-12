//! Ties queue, sessions, gate, adapters and pool together. Second wave: built after the others.

use crate::adapter;
use crate::gate::{self, Verdict};
use crate::json::{self, Value};
use crate::pool::{Pool, PoolMsg};
use crate::queue::Queue;
use crate::session::{Session, Sessions};
use crate::triggers::{self, next_due, Trigger, When};
use crate::types::{now_ms, AgentKind, Event, Logged, Task, TaskId, TaskState};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant};

/// An approved tool call: (task, tool name, input). Allowed once on rerun.
type Call = (TaskId, String, String);

struct Run {
    task: TaskId,
    agent: AgentKind,
    session: Option<String>,
    error: bool,
    /// Set by a rejected rate limit or a rate-limit message on stderr; decides failover on exit.
    rate_limited: bool,
    /// Tool calls seen this run; a rate-limited run with any needs approval before a rerun.
    tools: u32,
    program: String,
}

/// A rate-limit message: a limit phrase and an HTTP 429 context, matched on whole tokens (ASCII case-insensitive).
pub fn rate_limit_text(text: &str) -> bool {
    let b = text.to_ascii_lowercase().into_bytes();
    let bounded = |i: usize, n: usize| (i == 0 || !b[i - 1].is_ascii_alphanumeric()) && b.get(i + n).is_none_or(|c| !c.is_ascii_alphanumeric());
    let at = |p: &str| (0..b.len()).any(|i| b[i..].starts_with(p.as_bytes()) && bounded(i, p.len()));
    let rate = (0..b.len()).any(|i| (i == 0 || !b[i - 1].is_ascii_alphanumeric()) && b[i..].starts_with(b"rate") &&(b[i + 4..].starts_with(b"limit") || b[i + 4..].get(1..).is_some_and(|s| s.starts_with(b"limit"))));
    // a bare 429 needs HTTP context ("took 1429ms", "429 ms" are not limits); the phrases stand alone
    rate || b.windows(11).any(|w| w == b"usage limit") || ["429 too many", "status 429", "http 429", "error 429"].iter().any(|p| at(p))
}

/// Per-kind budget caps: kind name -> window -> max utilization (0.0-1.0) before the kind is skipped.
pub type Caps = BTreeMap<String, BTreeMap<String, f64>>;
/// Latest plan usage per kind and window: (utilization, resets_at unix s, status).
type Limits = BTreeMap<String, BTreeMap<String, (Option<f64>, Option<u64>, String)>>;

pub fn caps_json(caps: &Caps) -> Value {
    Value::Obj(
        caps.iter()
            .map(|(k, ws)| (k.clone(), Value::Obj(ws.iter().map(|(w, c)| (w.clone(), Value::num(*c))).collect())))
            .collect(),
    )
}

/// None when the text is not a kind -> window -> 0.0..=1.0 map.
pub fn parse_caps(text: &str) -> Option<Caps> {
    let Value::Obj(kinds) = json::parse(text).ok()? else { return None };
    kinds
        .into_iter()
        .map(|(k, v)| {
            let Value::Obj(ws) = v else { return None };
            let ws: BTreeMap<String, f64> = ws
                .into_iter()
                .map(|(w, c)| match c {
                    Value::Num(n) if (0.0..=1.0).contains(&n) => Some((w, n)),
                    _ => None,
                })
                .collect::<Option<_>>()?;
            Some((k, ws))
        })
        .collect()
}

type Fallbacks = (HashMap<TaskId, (Vec<AgentKind>, u32)>, BTreeSet<TaskId>);

fn parse_fallbacks(text: &str) -> Option<Fallbacks> {
    let Value::Obj(tasks) = json::parse(text).ok()? else { return None };
    let mut rerun = BTreeSet::new();
    let map = tasks
        .into_iter()
        .map(|(id, v)| {
            if let Some(Value::Bool(true)) = v.get("rerun") {
                rerun.insert(id.clone());
            }
            let Some(Value::Arr(names)) = v.get("kinds") else { return None };
            let kinds = names
                .iter()
                .map(|n| match n.as_str() {
                    Some("claude") => Some(AgentKind::Claude),
                    Some("opencode") => Some(AgentKind::OpenCode),
                    Some("gemini") => Some(AgentKind::Gemini),
                    Some("suffice") => Some(AgentKind::Suffice),
                    _ => None,
                })
                .collect::<Option<Vec<_>>>()?;
            let Some(Value::Num(waits)) = v.get("waits") else { return None };
            Some((id, (kinds, *waits as u32)))
        })
        .collect::<Option<HashMap<_, _>>>()?;
    Some((map, rerun))
}

fn parse_limits(text: &str) -> Option<Limits> {
    let Value::Obj(kinds) = json::parse(text).ok()? else { return None };
    kinds
        .into_iter()
        .map(|(k, v)| {
            let Value::Obj(ws) = v else { return None };
            let ws = ws
                .into_iter()
                .map(|(w, x)| {
                    let util = match x.get("utilization") {
                        Some(Value::Num(n)) => Some(*n),
                        _ => None,
                    };
                    let reset = x.get("resets_at").and_then(Value::as_i64).and_then(|n| u64::try_from(n).ok());
                    let status = x.get("status").and_then(Value::as_str).unwrap_or("").to_string();
                    (w, (util, reset, status))
                })
                .collect();
            Some((k, ws))
        })
        .collect()
}

/// A missing file is empty; an unreadable one is set aside and reported as torn (true).
fn read_or_set_aside<T: Default>(path: &Path, parse: fn(&str) -> Option<T>) -> io::Result<(T, bool)> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(parse(&text).map_or_else(
            || {
                crate::types::set_aside(path);
                (T::default(), true)
            },
            |v| (v, false),
        )),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok((T::default(), false)),
        Err(e) => Err(e),
    }
}

fn write_json(dir: &Path, name: &str, v: &Value) -> io::Result<()> {
    let tmp = dir.join(format!("{name}.tmp"));
    fs::write(&tmp, format!("{v}\n"))?;
    fs::rename(tmp, dir.join(name))
}

/// A started agent process, journaled in runs.json: (pid = pgid, program, process start time).
type LiveRun = (u32, String, String);

extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}

pub struct Engine {
    dir: PathBuf,
    queue: Queue,
    sessions: Sessions,
    pool: Pool,
    rx: Receiver<PoolMsg>,
    max_parallel: usize,
    file: File,
    seq: u64,
    events: Vec<Logged>,
    subs: Vec<Sender<Logged>>,
    runs: HashMap<String, Run>,
    /// Killed runs (held or cancelled) still alive until their Exited arrives; their session stays claimed.
    zombies: HashMap<String, Run>,
    approved: BTreeSet<TaskId>,
    calls: BTreeSet<Call>,
    /// Last tool call that held each task, moved into `calls` by approve().
    held: HashMap<TaskId, (String, String)>,
    /// Decided approval records, oldest first (mirrors approvals_log.jsonl).
    decisions: Vec<Value>,
    /// Runs started and not yet exited, by task id (mirrors runs.json).
    live: BTreeMap<TaskId, LiveRun>,
    /// Program name -> path override, e.g. "claude" -> a custom install path.
    pub programs: BTreeMap<String, PathBuf>,
    /// Scheduled and event-driven triggers, fired from tick().
    triggers: Vec<Trigger>,
    /// Time source for triggers; tests replace it with set_clock.
    clock: Box<dyn Fn() -> u64 + Send>,
    caps: Caps,
    limits: Limits,
    /// Fallback agent kinds per task, tried in order on an over-cap or rate-limited exit, and the
    /// rate-limit waits spent so far. Persisted in fallbacks.json.
    fallbacks: HashMap<TaskId, (Vec<AgentKind>, u32)>,
    /// Tasks whose rate-limited partial run had tool calls: a rerun on a fallback needs approval.
    rerun: BTreeSet<TaskId>,
}

impl Engine {
    pub fn open(dir: &Path, max_parallel: usize) -> io::Result<Engine> {
        fs::create_dir_all(dir)?;
        let queue = Queue::open(dir)?;
        let sessions = Sessions::open(dir)?;
        let path = dir.join("events.jsonl");
        let (events, good) = read_log(&path)?;
        let size = fs::metadata(&path).map(|m| m.len() as usize).unwrap_or(0);
        if good < size {
            // torn tail from a crash mid-write: drop it so the next append starts a clean line
            OpenOptions::new().write(true).open(&path)?.set_len(good as u64)?;
        }
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let (approved, calls, held) = load_approvals(dir)?;
        let decisions = load_decisions(dir)?;
        let triggers = triggers::load(dir)?;
        let orphans = load_runs(dir)?;
        let (caps, caps_torn) = read_or_set_aside(&dir.join("budgets.json"), parse_caps)?;
        let (limits, limits_torn) = read_or_set_aside(&dir.join("limits.json"), parse_limits)?;
        let ((fallbacks, rerun), fallbacks_torn) = read_or_set_aside(&dir.join("fallbacks.json"), parse_fallbacks)?;
        let (tx, rx) = channel();
        let mut engine = Engine {
            dir: dir.to_path_buf(),
            queue,
            sessions,
            pool: Pool::new(max_parallel, tx),
            rx,
            max_parallel,
            file,
            seq: events.last().map_or(0, |l| l.seq),
            events,
            subs: vec![],
            runs: HashMap::new(),
            zombies: HashMap::new(),
            approved,
            calls,
            held,
            decisions,
            live: BTreeMap::new(),
            programs: BTreeMap::new(),
            triggers,
            clock: Box::new(now_ms),
            caps,
            limits,
            fallbacks,
            rerun,
        };
        for (torn, file) in [(caps_torn, "budgets.json"), (limits_torn, "limits.json"), (fallbacks_torn, "fallbacks.json")] {
            if torn {
                let note = format!("{file} was unreadable and set aside; defaults used");
                engine.log("budgets", Event::Stderr { line: note });
            }
        }
        // runs of the crashed server: their agents may still be alive and hold the task's session
        for task in kill_orphans(&orphans) {
            let note = "orphan run killed after restart";
            engine.log(&task, Event::Stderr { line: note.into() });
            engine.log(&task, Event::State { state: "ready".into(), reason: Some(note.into()) });
        }
        if !orphans.is_empty() {
            engine.save_runs()?;
        }
        Ok(engine)
    }

    pub fn set_program(&mut self, name: &str, path: impl Into<PathBuf>) {
        self.programs.insert(name.to_string(), path.into());
    }

    pub fn submit(&mut self, task: Task) -> Result<(), String> {
        self.queue.submit(task)
    }

    pub fn set_clock(&mut self, f: impl Fn() -> u64 + Send + 'static) {
        self.clock = Box::new(f);
    }

    /// Submit a task with agent kinds to fall back to on an over-cap or rate-limited exit.
    pub fn submit_with(&mut self, task: Task, fallback: Vec<AgentKind>) -> Result<(), String> {
        let id = task.id.clone();
        let primary = crate::server::kind_name(&task.agent);
        let mut kinds: Vec<AgentKind> = vec![];
        for k in fallback {
            let name = crate::server::kind_name(&k);
            if name != primary && !kinds.iter().any(|x| crate::server::kind_name(x) == name) {
                kinds.push(k);
            }
        }
        self.queue.submit(task)?;
        self.fallbacks.insert(id, (kinds, 0));
        let _ = self.save_fallbacks();
        Ok(())
    }

    pub fn budgets(&self) -> &Caps {
        &self.caps
    }

    pub fn set_budgets(&mut self, caps: Caps) -> io::Result<()> {
        self.caps = caps;
        self.save_budgets()
    }

    /// Latest (utilization, resets_at, status) for a kind's plan window.
    pub fn limit(&self, kind: &str, window: &str) -> Option<&(Option<f64>, Option<u64>, String)> {
        self.limits.get(kind)?.get(window)
    }

    /// Unix ms when the kind unblocks if a cap in `caps` is reached now (None = not over cap).
    fn over_cap(&self, kind: &str, now: u64) -> Option<u64> {
        let caps = self.caps.get(kind)?;
        caps.iter()
            .filter_map(|(w, cap)| {
                let (util, reset, _) = self.limit(kind, w)?;
                let (util, reset) = ((*util)?, (*reset)? * 1000);
                (util >= *cap && reset > now).then_some(reset)
            })
            .max()
    }

    /// Latest unix ms any window of a kind resets at, if still in the future.
    fn latest_reset(&self, kind: &str, now: u64) -> Option<u64> {
        self.limits.get(kind)?.values().filter_map(|(_, r, _)| (*r)?.checked_mul(1000)).filter(|r| *r > now).max()
    }

    /// Move a task to its next fallback kind; false when none is left.
    fn failover(&mut self, id: &str, task: &Task, reason: &str) -> bool {
        let next = match self.fallbacks.get_mut(id) {
            Some((l, _)) if !l.is_empty() => l.remove(0),
            _ => return false,
        };
        // the approval covered the old kind's run; the new kind's prompt gate must run again
        self.approved.remove(id);
        let _ = self.save_approvals();
        let _ = self.save_fallbacks();
        let (from, to) = (crate::server::kind_name(&task.agent), crate::server::kind_name(&next));
        // a new session key keeps the next CLI from resuming the previous agent's conversation
        let session = task.session_key.as_ref().map(|k| format!("{k}@{to}"));
        if self.queue.retarget(id, next.clone(), session, TaskState::Ready, task.attempts).is_err() {
            return false;
        }
        let ev = Event::Failover { from: from.into(), to: to.into(), reason: reason.into() };
        self.log(id, ev);
        true
    }

    fn save_fallbacks(&self) -> io::Result<()> {
        let tasks = self.fallbacks.iter().map(|(id, (kinds, waits))| {
            let names = kinds.iter().map(|k| Value::str(crate::server::kind_name(k))).collect();
            let rerun = Value::Bool(self.rerun.contains(id));
            (id.clone(), Value::Obj(vec![("kinds".into(), Value::Arr(names)), ("waits".into(), Value::num(*waits as f64)), ("rerun".into(), rerun)]))
        });
        write_json(&self.dir, "fallbacks.json", &Value::Obj(tasks.collect()))
    }

    fn save_budgets(&self) -> io::Result<()> {
        write_json(&self.dir, "budgets.json", &caps_json(&self.caps))
    }

    fn save_limits(&self) -> io::Result<()> {
        let kinds = self.limits.iter().map(|(k, ws)| {
            let ws = ws.iter().map(|(w, (util, reset, status))| {
                let fields = vec![
                    ("utilization".into(), util.map_or(Value::Null, Value::Num)),
                    ("resets_at".into(), reset.map_or(Value::Null, |r| Value::num(r as f64))),
                    ("status".into(), Value::str(status)),
                ];
                (w.clone(), Value::Obj(fields))
            });
            (k.clone(), Value::Obj(ws.collect()))
        });
        write_json(&self.dir, "limits.json", &Value::Obj(kinds.collect()))
    }

    pub fn triggers(&self) -> &[Trigger] {
        &self.triggers
    }

    /// Add a trigger. The template is a task body (POST /tasks shape); its id is set per fire.
    pub fn add_trigger(&mut self, id: &str, when: When, template: Value) -> Result<(), String> {
        if id.is_empty() {
            return Err("trigger id is required".into());
        }
        if self.triggers.iter().any(|t| t.id == id) {
            return Err(format!("trigger '{id}' already exists"));
        }
        let own = format!("{id}-");
        if self.queue.all().iter().any(|t| t.id.starts_with(&own)) {
            return Err(format!("trigger id '{id}' collides with an existing task id"));
        }
        if let When::OnDone { task_prefix } = &when {
            if triggers::on_done_cycle(&self.triggers, id, task_prefix) {
                return Err(format!("OnDone cycle through trigger '{id}'"));
            }
        }
        crate::server::parse_task(&template, String::new())?;
        let now = (self.clock)();
        let mut t = Trigger::new(id.to_string(), when, template, now);
        if let When::OnDone { task_prefix } = &t.when {
            // only tasks that finish after creation should count, so the ones already done are seen
            t.done_seen = self.queue.all().into_iter().filter(|x| x.state == TaskState::Done && x.id.starts_with(task_prefix.as_str())).map(|x| x.id.clone()).collect();
        }
        self.triggers.push(t);
        self.save_triggers()
    }

    pub fn remove_trigger(&mut self, id: &str) -> Result<(), String> {
        let n = self.triggers.len();
        self.triggers.retain(|t| t.id != id);
        if self.triggers.len() == n {
            return Err(format!("no trigger '{id}'"));
        }
        self.save_triggers()
    }

    pub fn set_trigger_enabled(&mut self, id: &str, enabled: bool) -> Result<(), String> {
        let t = self.triggers.iter_mut().find(|t| t.id == id).ok_or(format!("no trigger '{id}'"))?;
        t.enabled = enabled;
        self.save_triggers()
    }

    /// Fire a trigger now, ignoring its schedule and enabled flag. Returns the outcome.
    pub fn fire_now(&mut self, id: &str) -> Result<&'static str, String> {
        let i = self.triggers.iter().position(|t| t.id == id).ok_or(format!("no trigger '{id}'"))?;
        let now = (self.clock)();
        let outcome = self.fire_trigger(i, now, None);
        self.save_triggers()?;
        Ok(outcome)
    }

    fn save_triggers(&self) -> Result<(), String> {
        triggers::save(&self.dir, &self.triggers).map_err(|e| e.to_string())
    }

    fn trigger_snapshot(&self) -> String {
        Value::Arr(self.triggers.iter().map(Trigger::to_json).collect()).to_string()
    }

    /// Fire every enabled trigger that is due, or has a new finished task matching its prefix.
    fn run_triggers(&mut self) {
        const DAY_MS: u64 = 86_400_000;
        let now = (self.clock)();
        let before = self.trigger_snapshot();
        let done: Vec<TaskId> =
            self.queue.all().into_iter().filter(|t| t.state == TaskState::Done).map(|t| t.id.clone()).collect();
        for t in self.triggers.iter_mut() {
            // a backward clock jump can leave a Daily due far ahead; reschedule it
            if matches!(t.when, When::Daily { .. }) && t.next_due_ms > now.saturating_add(2 * DAY_MS) {
                t.next_due_ms = next_due(&t.when, now);
            }
            if matches!(t.when, When::OnDone { .. }) {
                t.done_seen.retain(|d| done.contains(d));
                let extra = t.done_seen.len().saturating_sub(1000);
                t.done_seen.drain(..extra);
            }
        }
        for i in 0..self.triggers.len() {
            let t = &self.triggers[i];
            if !t.enabled {
                continue;
            }
            let fresh: Vec<Option<TaskId>> = match &t.when {
                When::OnDone { task_prefix } => {
                    let own = format!("{}-", t.id);
                    done.iter()
                        .filter(|d| d.starts_with(task_prefix.as_str()) && !d.starts_with(&own) && !t.done_seen.contains(d))
                        .map(|d| Some(d.clone()))
                        .collect()
                }
                When::Every { .. } | When::Daily { .. } if now >= t.next_due_ms => vec![None],
                _ => vec![],
            };
            for d in fresh {
                self.fire_trigger(i, now, d);
            }
        }
        if self.trigger_snapshot() != before {
            let _ = self.save_triggers();
        }
    }

    /// Submit the trigger's task unless its previous one is still open. Logs the outcome.
    fn fire_trigger(&mut self, i: usize, now: u64, done: Option<TaskId>) -> &'static str {
        let id = self.triggers[i].id.clone();
        let prev = format!("{id}-{}", self.triggers[i].fires);
        let busy = self.queue.get(&prev).is_some_and(|t| {
            matches!(t.state, TaskState::Pending | TaskState::Ready | TaskState::Running { .. } | TaskState::NeedsApproval { .. })
        });
        let t = &mut self.triggers[i];
        if let Some(d) = done {
            t.done_seen.push(d);
        }
        t.next_due_ms = next_due(&t.when, now);
        let mut reason = None;
        let (outcome, task_id) = if busy {
            ("skipped", None)
        } else if matches!(t.when, When::OnDone { .. }) && !triggers::od_allow(&mut t.od_fires, now) {
            t.enabled = false;
            reason = Some("more than 20 OnDone fires in an hour".to_string());
            ("disabled", None)
        } else {
            // skip ids already taken (e.g. by a task the user submitted under this prefix)
            let mut n = t.fires + 1;
            while self.queue.get(&format!("{id}-{n}")).is_some() {
                n += 1;
            }
            let fire_id = format!("{id}-{n}");
            let res = crate::server::parse_task(&t.template, fire_id.clone()).and_then(|task| self.queue.submit(task));
            match res {
                Ok(()) => {
                    t.fires = n;
                    t.last_fire_ms = Some(now);
                    t.failures = 0;
                    ("fired", Some(fire_id))
                }
                Err(e) => {
                    t.failures += 1;
                    if t.failures >= 3 {
                        t.enabled = false;
                        reason = Some(format!("3 consecutive failures: {e}"));
                        ("disabled", None)
                    } else {
                        ("failed", None)
                    }
                }
            }
        };
        self.log(&id, Event::Trigger { outcome: outcome.to_string(), task_id, reason });
        outcome
    }

    pub fn approve(&mut self, id: &str) -> Result<(), String> {
        match self.queue.get(id).map(|t| &t.state) {
            Some(TaskState::NeedsApproval { .. }) => {}
            Some(_) => return Err(format!("task '{id}' is not waiting for approval")),
            None => return Err(format!("no task '{id}'")),
        }
        if self.rerun.remove(id) {
            let _ = self.save_fallbacks();
            let task = self.queue.get(id).cloned().ok_or(format!("no task '{id}'"))?;
            return if self.failover(id, &task, "rate limited") { Ok(()) } else { Err(format!("task '{id}' has no fallback left")) };
        }
        self.approved.insert(id.to_string());
        if let Some((name, input)) = self.held.remove(id) {
            self.calls.insert((id.to_string(), name, input));
        }
        self.save_approvals().map_err(|e| e.to_string())?;
        self.set_state(id, TaskState::Ready)
    }

    /// Append an approval decision to approvals_log.jsonl and log an approval event.
    pub fn record_decision(&mut self, task: &str, status: &str, rec: Value) -> Result<(), String> {
        let mut f = OpenOptions::new().create(true).append(true).open(self.dir.join("approvals_log.jsonl")).map_err(|e| e.to_string())?;
        f.write_all(format!("{rec}\n").as_bytes()).map_err(|e| e.to_string())?;
        self.decisions.push(rec);
        self.log(task, Event::Approval { status: status.to_string() });
        Ok(())
    }

    pub fn decisions(&self) -> &[Value] {
        &self.decisions
    }

    /// Move a task to `state` and log the change.
    fn set_state(&mut self, id: &str, state: TaskState) -> Result<(), String> {
        self.queue.set_state(id, state)?;
        if self.queue.get(id).is_some_and(|t| matches!(t.state, TaskState::Done | TaskState::Cancelled | TaskState::Failed { .. })) {
            self.fallbacks.remove(id);
            self.rerun.remove(id);
            let _ = self.save_fallbacks();
        }
        self.log_state(id);
        Ok(())
    }

    /// Log the task's current state (after the queue may have turned a Failed into a retry Ready).
    fn log_state(&mut self, id: &str) {
        let Some(t) = self.queue.get(id) else { return };
        let (state, reason) = match &t.state {
            TaskState::NeedsApproval { reason } => (t.state.name(), Some(reason.clone())),
            TaskState::Failed { error } => (t.state.name(), Some(error.clone())),
            s => (s.name(), None),
        };
        let event = Event::State { state: state.to_string(), reason };
        self.log(id, event);
    }

    /// Re-queue a failed or cancelled task.
    pub fn retry(&mut self, id: &str) -> Result<(), String> {
        match self.queue.get(id).map(|t| &t.state) {
            Some(TaskState::Failed { .. } | TaskState::Cancelled) => self.set_state(id, TaskState::Ready),
            Some(_) => Err(format!("task '{id}' is not failed or cancelled")),
            None => Err(format!("no task '{id}'")),
        }
    }

    /// Refuse a pending approval: a rate-limited rerun is marked Failed, anything else is cancelled.
    pub fn deny(&mut self, id: &str) -> Result<(), String> {
        if self.rerun.remove(id) {
            return self.set_state(id, TaskState::Failed { error: "rate limited rerun denied".into() });
        }
        self.cancel(id)
    }

    pub fn cancel(&mut self, id: &str) -> Result<(), String> {
        let attempts = self.queue.get(id).ok_or(format!("no task '{id}'"))?.attempts;
        let run = run_id(id, attempts);
        if let Some(r) = self.runs.remove(&run) {
            self.pool.kill(&run);
            self.zombies.insert(run, r);
        }
        self.set_state(id, TaskState::Cancelled)
    }

    pub fn sessions(&self) -> Vec<Session> {
        self.sessions.all().into_iter().cloned().collect()
    }

    pub fn running(&self) -> usize {
        self.pool.running()
    }

    pub fn max_parallel(&self) -> usize {
        self.max_parallel
    }

    /// The last tool call that held `task` for approval: (name, input).
    pub fn held_call(&self, task: &str) -> Option<(String, String)> {
        self.held.get(task).cloned()
    }

    pub fn tasks(&self) -> Vec<Task> {
        self.queue.all().into_iter().cloned().collect()
    }

    pub fn events_since(&self, seq: u64) -> Vec<Logged> {
        self.events.iter().filter(|l| l.seq > seq).cloned().collect()
    }

    pub fn subscribe(&mut self) -> Receiver<Logged> {
        let (tx, rx) = channel();
        self.subs.push(tx);
        rx
    }

    /// Start every Ready task that fits the pool. Non-blocking.
    pub fn tick(&mut self) {
        self.run_triggers();
        let now = (self.clock)();
        let due: Vec<TaskId> = self
            .queue
            .all()
            .into_iter()
            .filter(|t| matches!(t.state, TaskState::Waiting { until } if until <= now))
            .map(|t| t.id.clone())
            .collect();
        for id in due {
            let _ = self.set_state(&id, TaskState::Ready);
        }
        let pending: Vec<TaskId> =
            self.queue.all().into_iter().filter(|t| t.state == TaskState::Pending).map(|t| t.id.clone()).collect();
        let ready = self.queue.ready();
        for id in pending {
            if self.queue.get(&id).is_some_and(|t| t.state != TaskState::Pending) {
                self.log_state(&id);
            }
        }
        for id in ready {
            if self.pool.running() >= self.max_parallel {
                break;
            }
            let Some(task) = self.queue.get(&id).cloned() else { continue };
            let run = run_id(&id, task.attempts);
            if self.runs.contains_key(&run) || self.zombies.contains_key(&run) {
                continue; // started, or killed but not yet exited (still holds the session)
            }
            if !self.approved.contains(&id) {
                if matches!(task.agent, AgentKind::Generic { .. }) {
                    let _ = self.set_state(&id, TaskState::NeedsApproval { reason: "custom program".into() });
                    continue;
                }
                if let Verdict::Hold { reason } = gate::check_task(&task) {
                    let _ = self.set_state(&id, TaskState::NeedsApproval { reason });
                    continue;
                }
            }
            if let Some(reset) = self.over_cap(crate::server::kind_name(&task.agent), now) {
                let kind = crate::server::kind_name(&task.agent);
                if !self.failover(&id, &task, &format!("{kind} over budget cap")) {
                    let _ = self.set_state(&id, TaskState::Waiting { until: reset });
                }
                continue;
            }
            let resume = match &task.session_key {
                Some(k) => {
                    if !self.sessions.claim(k, &task.agent, &id) {
                        continue;
                    }
                    self.sessions.get(k).and_then(|s| s.native_id.clone())
                }
                None => None,
            };
            let mut cmd = adapter::command(&task, resume.as_deref());
            if let Some(p) = self.programs.get(&cmd.program) {
                cmd.program = p.to_string_lossy().into_owned();
            }
            let program = cmd.program.clone();
            if !self.pool.try_start(&run, cmd, task.timeout_secs) {
                if let Some(k) = &task.session_key {
                    self.sessions.release(k, &id);
                }
                break;
            }
            let session = task.session_key.clone();
            self.runs.insert(
                run,
                Run { task: id.clone(), agent: task.agent.clone(), session, error: false, rate_limited: false, tools: 0, program },
            );
        }
    }

    /// Handle pool messages for up to `timeout`. Blocks on the channel; does not spin.
    pub fn pump(&mut self, timeout: Duration) {
        if let Ok(m) = self.rx.recv_timeout(timeout) {
            self.handle(m);
            while let Ok(m) = self.rx.try_recv() {
                self.handle(m);
            }
        }
    }

    /// Tick and pump until no task is Pending, Ready or Running, or `max` elapses.
    pub fn run_until_idle(&mut self, max: Duration) {
        let end = Instant::now() + max;
        loop {
            self.tick();
            let busy = self.queue.all().iter().any(|t| {
                matches!(t.state, TaskState::Pending | TaskState::Ready | TaskState::Running { .. })
            });
            if !busy || Instant::now() >= end {
                break;
            }
            self.pump(Duration::from_millis(200));
        }
    }

    fn handle(&mut self, msg: PoolMsg) {
        match msg {
            PoolMsg::Started { run, pid } => {
                if let Some((task, program)) = self.runs.get(&run).map(|r| (r.task.clone(), r.program.clone())) {
                    // journal before Running so a crash after this point can find the process
                    let start = ps_field(pid, "lstart").unwrap_or_default();
                    self.live.insert(task.clone(), (pid, program, start));
                    let _ = self.save_runs();
                    let _ = self.set_state(&task, TaskState::Running { pid });
                }
            }
            PoolMsg::Stdout { run, line } => {
                if let Some(r) = self.runs.get(&run) {
                    let agent = r.agent.clone();
                    for ev in adapter::parse_line(&agent, &line) {
                        self.on_event(&run, ev);
                    }
                }
            }
            PoolMsg::Stderr { run, line } => self.on_event(&run, Event::Stderr { line }),
            PoolMsg::Exited { run, code, timed_out, killed } => {
                if let Some(r) = self.zombies.remove(&run) {
                    if let Some(k) = &r.session {
                        self.sessions.release(k, &r.task);
                    }
                    self.forget_run(&r.task);
                    self.log(&r.task, Event::Exit { code });
                    return;
                }
                let Some(r) = self.runs.remove(&run) else { return };
                if let Some(k) = &r.session {
                    self.sessions.release(k, &r.task);
                }
                self.forget_run(&r.task);
                self.log(&r.task, Event::Exit { code });
                let state = if code == Some(0) && !r.error && !killed && !timed_out {
                    TaskState::Done
                } else {
                    let error = if timed_out {
                        "timed out".to_string()
                    } else if killed {
                        "killed".to_string()
                    } else if r.error {
                        "agent reported an error".to_string()
                    } else {
                        format!("exit {}", code.map_or("by signal".to_string(), |c| c.to_string()))
                    };
                    TaskState::Failed { error }
                };
                if r.rate_limited && !killed && matches!(state, TaskState::Failed { .. }) {
                    let now = (self.clock)();
                    let kind = crate::server::kind_name(&r.agent);
                    let next = self.fallbacks.get(&r.task).and_then(|(l, _)| l.first()).map(|k| crate::server::kind_name(k));
                    if let (Some(next), true) = (next, r.tools > 0) {
                        let reason = format!("rerun on {next} after rate limit (partial run had {} tool calls)", r.tools);
                        self.rerun.insert(r.task.clone());
                        let _ = self.save_fallbacks();
                        let _ = self.set_state(&r.task, TaskState::NeedsApproval { reason });
                        return;
                    }
                    if next.is_some() {
                        if let Some(task) = self.queue.get(&r.task).cloned() {
                            if self.failover(&r.task, &task, "rate limited") {
                                return;
                            }
                        }
                    }
                    let entry = self.fallbacks.entry(r.task.clone()).or_insert((vec![], 0));
                    if entry.1 >= 3 {
                        let _ = self.set_state(&r.task, TaskState::Failed { error: "rate limited, gave up".into() });
                        return;
                    }
                    entry.1 += 1;
                    let _ = self.save_fallbacks();
                    // shortcut: a rate limit with no known reset waits a fixed 60s, upgrade when reset is always reported
                    let until = self.latest_reset(kind, now).unwrap_or(now + 60_000);
                    let _ = self.set_state(&r.task, TaskState::Waiting { until });
                    return;
                }
                // Invalid transitions (cancelled or held runs) are expected here and ignored.
                let _ = self.set_state(&r.task, state);
            }
            PoolMsg::SpawnFailed { run, error } => {
                if let Some(r) = self.runs.remove(&run) {
                    if let Some(k) = &r.session {
                        self.sessions.release(k, &r.task);
                    }
                    let _ = self.set_state(&r.task, TaskState::Failed { error });
                }
            }
        }
    }

    fn on_event(&mut self, run: &str, ev: Event) {
        let Some(r) = self.runs.get_mut(run) else { return };
        if matches!(ev, Event::Result { is_error: true, .. }) {
            r.error = true;
        }
        if matches!(ev, Event::ToolCall { .. }) {
            r.tools += 1;
        }
        let (task, session) = (r.task.clone(), r.session.clone());
        let kind = crate::server::kind_name(&r.agent);
        let limited = match &ev {
            Event::RateLimit { status, .. } => status == "rejected",
            Event::Stderr { line } => rate_limit_text(line),
            Event::Result { text, .. } => rate_limit_text(text),
            _ => false,
        };
        if limited {
            r.rate_limited = true;
        }
        if let Event::RateLimit { window, utilization, resets_at, status } = &ev {
            let w = (*utilization, *resets_at, status.clone());
            self.limits.entry(kind.into()).or_default().insert(window.clone(), w);
            let _ = self.save_limits();
            self.log(&task, ev.clone());
        }
        if let (Event::Session { native_id }, Some(k)) = (&ev, &session) {
            self.sessions.set_native(k, native_id);
        }
        let mut hold = None;
        if let Event::ToolCall { name, input } = &ev {
            if self.is_running(&task) {
                if let Verdict::Hold { reason } = gate::check_event(&ev) {
                    let call = (task.clone(), name.clone(), input.clone());
                    if self.calls.remove(&call) {
                        let _ = self.save_approvals();
                    } else {
                        hold = Some((reason, call));
                    }
                }
            }
        }
        self.log(&task, ev);
        if let Some((reason, (_, name, input))) = hold {
            if let Some(r) = self.runs.remove(run) {
                self.pool.kill(run);
                self.zombies.insert(run.to_string(), r);
            }
            self.held.insert(task.clone(), (name, input));
            let _ = self.save_approvals();
            let _ = self.set_state(&task, TaskState::NeedsApproval { reason });
        }
    }

    fn is_running(&self, task: &str) -> bool {
        matches!(self.queue.get(task).map(|t| &t.state), Some(TaskState::Running { .. }))
    }

    fn log(&mut self, task: &str, event: Event) {
        self.seq += 1;
        let l = Logged { seq: self.seq, task: task.to_string(), ms: now_ms(), event };
        // shortcut: log write errors are dropped like session save errors; one write call per line
        let _ = self.file.write_all(format!("{}\n", logged_json(&l)).as_bytes());
        self.subs.retain(|s| s.send(l.clone()).is_ok());
        self.events.push(l);
    }

    /// Drop a finished run from runs.json.
    fn forget_run(&mut self, task: &str) {
        if self.live.remove(task).is_some() {
            let _ = self.save_runs();
        }
    }

    fn save_runs(&self) -> io::Result<()> {
        let v = Value::Obj(
            self.live
                .iter()
                .map(|(t, (pid, program, start))| {
                    let rec = Value::Obj(vec![
                        ("pid".into(), Value::num(*pid as f64)),
                        ("program".into(), Value::str(program)),
                        ("start".into(), Value::str(start)),
                    ]);
                    (t.clone(), rec)
                })
                .collect(),
        );
        let tmp = self.dir.join("runs.json.tmp");
        fs::write(&tmp, format!("{v}\n"))?;
        fs::rename(tmp, self.dir.join("runs.json"))
    }

    fn save_approvals(&self) -> io::Result<()> {
        let tasks = Value::Arr(self.approved.iter().map(|t| Value::str(t)).collect());
        let calls = Value::Arr(
            self.calls
                .iter()
                .map(|(t, n, i)| Value::Arr(vec![Value::str(t), Value::str(n), Value::str(i)]))
                .collect(),
        );
        let held = Value::Arr(
            self.held
                .iter()
                .map(|(t, (n, i))| Value::Arr(vec![Value::str(t), Value::str(n), Value::str(i)]))
                .collect(),
        );
        let v = Value::Obj(vec![("tasks".into(), tasks), ("calls".into(), calls), ("held".into(), held)]);
        let tmp = self.dir.join("approvals.json.tmp");
        fs::write(&tmp, format!("{v}\n"))?;
        fs::rename(tmp, self.dir.join("approvals.json"))
    }
}

fn run_id(task: &str, attempts: u32) -> String {
    format!("{task}#{attempts}")
}

fn bad(e: impl std::fmt::Display) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, e.to_string())
}

/// `ps -o <field>=` for a live pid; None when the process is gone or ps fails.
fn ps_field(pid: u32, field: &str) -> Option<String> {
    let out = std::process::Command::new("ps").args(["-o", &format!("{field}="), "-p", &pid.to_string()]).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !s.is_empty()).then_some(s)
}

/// Kill the groups of journaled runs whose pid still holds the same process (start time and
/// program match, so a reused pid is never touched). SIGTERM, then SIGKILL after 3 s.
fn kill_orphans(runs: &BTreeMap<TaskId, LiveRun>) -> Vec<TaskId> {
    let mut killed = vec![];
    for (task, (pid, program, start)) in runs {
        let same = ps_field(*pid, "lstart").as_deref() == Some(start.as_str())
            && ps_field(*pid, "command").is_some_and(|c| c.contains(program.as_str()));
        if !same {
            continue;
        }
        let pgid = *pid as i32;
        unsafe { kill(-pgid, 15) };
        let mut waited = 0;
        while unsafe { kill(pgid, 0) } == 0 && waited < 30 {
            std::thread::sleep(Duration::from_millis(100));
            waited += 1;
        }
        if unsafe { kill(pgid, 0) } == 0 {
            unsafe { kill(-pgid, 9) };
        }
        killed.push(task.clone());
    }
    killed
}

fn parse_runs(text: &str) -> Option<BTreeMap<TaskId, LiveRun>> {
    let Value::Obj(kv) = json::parse(text).ok()? else { return None };
    kv.iter()
        .map(|(t, r)| {
            let pid = r.get("pid")?.as_i64()? as u32;
            Some((t.clone(), (pid, r.get("program")?.as_str()?.to_string(), r.get("start")?.as_str()?.to_string())))
        })
        .collect()
}

/// Reads runs.json. Unreadable content is set aside and treated as no runs.
fn load_runs(dir: &Path) -> io::Result<BTreeMap<TaskId, LiveRun>> {
    let path = dir.join("runs.json");
    match fs::read_to_string(&path) {
        Ok(text) => Ok(parse_runs(&text).unwrap_or_else(|| {
            crate::types::set_aside(&path);
            BTreeMap::new()
        })),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(e),
    }
}

fn load_approvals(dir: &Path) -> io::Result<(BTreeSet<TaskId>, BTreeSet<Call>, HashMap<TaskId, (String, String)>)> {
    let path = dir.join("approvals.json");
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Default::default()),
        Err(e) => return Err(e),
    };
    // unreadable approvals are set aside and dropped: tasks must be approved again (fails closed)
    parse_approvals(&text).or_else(|_| {
        crate::types::set_aside(&path);
        Ok(Default::default())
    })
}

fn parse_approvals(text: &str) -> io::Result<(BTreeSet<TaskId>, BTreeSet<Call>, HashMap<TaskId, (String, String)>)> {
    let v = json::parse(text).map_err(|e| bad(format!("approvals.json: {e}")))?;
    let mut approved = BTreeSet::new();
    let mut calls = BTreeSet::new();
    let mut held = HashMap::new();
    for t in v.get("tasks").and_then(Value::as_arr).unwrap_or(&[]) {
        approved.insert(t.as_str().ok_or_else(|| bad("approvals.json: task id"))?.to_string());
    }
    for c in v.get("calls").and_then(Value::as_arr).unwrap_or(&[]) {
        let (t, n, i) = call_triple(c)?;
        calls.insert((t, n, i));
    }
    for c in v.get("held").and_then(Value::as_arr).unwrap_or(&[]) {
        let (t, n, i) = call_triple(c)?;
        held.insert(t, (n, i));
    }
    Ok((approved, calls, held))
}

fn call_triple(c: &Value) -> io::Result<(String, String, String)> {
    let s = |x: &Value| x.as_str().map(str::to_string).ok_or_else(|| bad("approvals.json: call"));
    match c.as_arr() {
        Some([t, n, i]) => Ok((s(t)?, s(n)?, s(i)?)),
        _ => Err(bad("approvals.json: call")),
    }
}

/// Replays events.jsonl. Returns the events and the byte length of the valid prefix.
fn read_log(path: &Path) -> io::Result<(Vec<Logged>, usize)> {
    let text = match fs::read(path) {
        Ok(t) => String::from_utf8_lossy(&t).into_owned(),
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok((vec![], 0)),
        Err(e) => return Err(e),
    };
    let mut out = vec![];
    let mut good = 0;
    for line in text.split_inclusive('\n') {
        if !line.ends_with('\n') {
            break; // torn tail
        }
        // a garbage line ends the good prefix; it is truncated like a torn tail
        let Ok(l) = json::parse(line.trim_end()).and_then(|v| logged_from(&v)) else { break };
        out.push(l);
        good += line.len();
    }
    Ok((out, good))
}

/// Reads approvals_log.jsonl. A torn tail is cut off so the next append starts a clean line.
fn load_decisions(dir: &Path) -> io::Result<Vec<Value>> {
    let path = dir.join("approvals_log.jsonl");
    let text = match fs::read(&path) {
        Ok(t) => String::from_utf8_lossy(&t).into_owned(),
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e),
    };
    let mut out = vec![];
    let mut good = 0;
    for line in text.split_inclusive('\n') {
        if !line.ends_with('\n') {
            break;
        }
        let Ok(v) = json::parse(line.trim_end()) else { break };
        out.push(v);
        good += line.len();
    }
    if good < text.len() {
        OpenOptions::new().write(true).open(&path)?.set_len(good as u64)?;
    }
    Ok(out)
}

fn sval(v: &Value, k: &str) -> Result<String, String> {
    v.get(k).and_then(Value::as_str).map(str::to_string).ok_or_else(|| format!("missing {k}"))
}

fn num(v: &Value, k: &str) -> Option<f64> {
    match v.get(k) {
        Some(Value::Num(n)) => Some(*n),
        _ => None,
    }
}

fn flag(v: &Value, k: &str) -> bool {
    v.get(k) == Some(&Value::Bool(true))
}

pub fn logged_json(l: &Logged) -> Value {
    let (ty, fields) = match &l.event {
        Event::Session { native_id } => ("session", vec![("native_id", Value::str(native_id))]),
        Event::Text { text } => ("text", vec![("text", Value::str(text))]),
        Event::ToolCall { name, input } => ("tool_call", vec![("name", Value::str(name)), ("input", Value::str(input))]),
        Event::ToolResult { name, output, is_error } => (
            "tool_result",
            vec![("name", Value::str(name)), ("output", Value::str(output)), ("is_error", Value::Bool(*is_error))],
        ),
        Event::Usage { input_tokens, output_tokens, cost_usd } => (
            "usage",
            vec![
                ("input_tokens", Value::Num(*input_tokens as f64)),
                ("output_tokens", Value::Num(*output_tokens as f64)),
                ("cost_usd", cost_usd.map_or(Value::Null, Value::Num)),
            ],
        ),
        Event::Result { text, is_error } => ("result", vec![("text", Value::str(text)), ("is_error", Value::Bool(*is_error))]),
        Event::Raw { line } => ("raw", vec![("line", Value::str(line))]),
        Event::Stderr { line } => ("stderr", vec![("line", Value::str(line))]),
        Event::Exit { code } => ("exit", vec![("code", code.map_or(Value::Null, |c| Value::Num(c as f64)))]),
        Event::State { state, reason } => {
            ("state", vec![("state", Value::str(state)), ("reason", reason.as_deref().map_or(Value::Null, Value::str))])
        }
        Event::Approval { status } => ("approval", vec![("status", Value::str(status))]),
        Event::Trigger { outcome, task_id, reason } => {
            ("trigger", vec![("outcome", Value::str(outcome)), ("task_id", task_id.as_deref().map_or(Value::Null, Value::str)), ("reason", reason.as_deref().map_or(Value::Null, Value::str))])
        }
        Event::RateLimit { window, utilization, resets_at, status } => (
            "rate_limit",
            vec![
                ("window", Value::str(window)),
                ("utilization", utilization.map_or(Value::Null, Value::Num)),
                ("resets_at", resets_at.map_or(Value::Null, |r| Value::Num(r as f64))),
                ("status", Value::str(status)),
            ],
        ),
        Event::Failover { from, to, reason } => (
            "failover",
            vec![("from", Value::str(from)), ("to", Value::str(to)), ("reason", Value::str(reason))],
        ),
    };
    let mut o = vec![
        ("seq".to_string(), Value::Num(l.seq as f64)),
        ("task".to_string(), Value::str(&l.task)),
        ("ms".to_string(), Value::Num(l.ms as f64)),
        ("type".to_string(), Value::str(ty)),
    ];
    o.extend(fields.into_iter().map(|(k, v)| (k.to_string(), v)));
    Value::Obj(o)
}

fn logged_from(v: &Value) -> Result<Logged, String> {
    let event = match sval(v, "type")?.as_str() {
        "session" => Event::Session { native_id: sval(v, "native_id")? },
        "text" => Event::Text { text: sval(v, "text")? },
        "tool_call" => Event::ToolCall { name: sval(v, "name")?, input: sval(v, "input")? },
        "tool_result" => Event::ToolResult {
            name: sval(v, "name")?,
            output: sval(v, "output")?,
            is_error: flag(v, "is_error"),
        },
        "usage" => Event::Usage {
            input_tokens: num(v, "input_tokens").unwrap_or(0.0) as u64,
            output_tokens: num(v, "output_tokens").unwrap_or(0.0) as u64,
            cost_usd: num(v, "cost_usd"),
        },
        "result" => Event::Result { text: sval(v, "text")?, is_error: flag(v, "is_error") },
        "raw" => Event::Raw { line: sval(v, "line")? },
        "stderr" => Event::Stderr { line: sval(v, "line")? },
        "exit" => Event::Exit { code: num(v, "code").map(|c| c as i32) },
        "state" => Event::State {
            state: sval(v, "state")?,
            reason: v.get("reason").and_then(Value::as_str).map(str::to_string),
        },
        "approval" => Event::Approval { status: sval(v, "status")? },
        "trigger" => Event::Trigger {
            outcome: sval(v, "outcome")?,
            task_id: v.get("task_id").and_then(Value::as_str).map(str::to_string),
            reason: v.get("reason").and_then(Value::as_str).map(str::to_string),
        },
        other => return Err(format!("unknown event '{other}'")),
    };
    Ok(Logged {
        seq: num(v, "seq").ok_or("missing seq")? as u64,
        task: sval(v, "task")?,
        ms: num(v, "ms").unwrap_or(0.0) as u64,
        event,
    })
}
