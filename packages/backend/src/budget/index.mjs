import fs from 'node:fs';
import { assertShape } from '../contract.mjs';

const HOUR = 3600000, DAY = 24 * HOUR, WEEK = 7 * DAY;
const PERIODS = ['run', 'hour', 'day', 'week'];
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const fail = (m) => { throw new TypeError(`budget: ${m}`); };

/** Start instant (ms, UTC) of the window containing nowMs; 0 for 'run'. */
export function windowStart(limit, nowMs) {
  if (limit.period === 'run') return 0;
  const off = (limit.utcOffsetMinutes ?? 0) * 60000, t = nowMs + off; // shifted: UTC fields read as local
  if (limit.period === 'hour') return t - (t % HOUR + HOUR) % HOUR - off;
  const midnight = t - (t % DAY + DAY) % DAY;
  if (limit.period === 'day') return midnight - off;
  const { weekday = 0, hour = 0 } = limit.weekStart ?? {};
  const back = (new Date(t).getUTCDay() - weekday + 7) % 7;
  let s = midnight + hour * HOUR - back * DAY;
  if (s > t) s -= WEEK;
  return s - off;
}

/** Highest cumulative usage allowed right now: tokens, or the sum of shares so far this week. */
export function ceilingAt(limit, nowMs) {
  if (limit.period !== 'week' || !limit.shares) return limit.tokens;
  const wd = limit.weekStart?.weekday ?? 0;
  const k = Math.min(6, Math.floor((nowMs - windowStart(limit, nowMs)) / DAY));
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += limit.shares[(wd + i) % 7] ?? 0;
  return Math.round(limit.tokens * sum);
}

function validate(limits) {
  if (!Array.isArray(limits)) fail('limits must be an array');
  const names = new Set();
  for (const l of limits) {
    if (!l || typeof l !== 'object') fail('each limit must be an object');
    if (typeof l.name !== 'string' || !l.name) fail('limit name must be a non-empty string');
    if (names.has(l.name)) fail(`duplicate limit name "${l.name}"`);
    names.add(l.name);
    if (!Number.isFinite(l.tokens) || l.tokens < 0) fail(`${l.name}: tokens must be a finite number >= 0`);
    if (!PERIODS.includes(l.period)) fail(`${l.name}: period must be one of ${PERIODS.join(', ')}`);
    if (l.utcOffsetMinutes !== undefined && !isInt(l.utcOffsetMinutes, -1440, 1440)) fail(`${l.name}: utcOffsetMinutes must be an integer within a day`);
    if (l.tag !== undefined && (!l.tag || typeof l.tag.key !== 'string' || !l.tag.key || !('value' in l.tag))) fail(`${l.name}: tag needs {key, value}`);
    if ((l.weekStart || l.shares) && l.period !== 'week') fail(`${l.name}: weekStart and shares need period 'week'`);
    if (l.weekStart && (!isInt(l.weekStart.weekday, 0, 6) || !isInt(l.weekStart.hour ?? 0, 0, 23))) fail(`${l.name}: weekStart needs weekday 0-6 and hour 0-23`);
    if (l.shares) {
      const v = Object.entries(l.shares);
      if (!v.every(([d, f]) => isInt(+d, 0, 6) && Number.isFinite(f) && f >= 0 && f <= 1)) fail(`${l.name}: shares need weekday keys 0-6 and fractions 0-1`);
      if (v.reduce((a, [, f]) => a + f, 0) > 1 + 1e-9) fail(`${l.name}: shares add up to more than 1`);
    }
  }
  return limits.map((l) => structuredClone(l));
}

const count = (n, what) => { if (!Number.isFinite(n) || n < 0) fail(`${what} must be a finite number >= 0`); return n; };

export function createBudget({ clock, store, limits }) {
  assertShape('clock', clock, ['now']);
  assertShape('store', store, ['load', 'save']);
  let lim = validate(limits);
  let used = {}; // name -> {start, used}
  const mine = []; // this instance's holds
  let holds = []; // in-flight reservations {id, pid, n, tags}, shared through the store so other processes see them
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  // Reload shared state; holds of dead processes are dropped so a crash never pins room.
  const sync = () => {
    const s = store.load();
    if (s) used = { ...(s.windows ?? {}) }; // a store with nothing saved (or that never saves) leaves in-memory usage alone
    // own holds stay in memory (a store that does not persist must still see them); others come from the file
    holds = [...mine, ...(s?.holds ?? []).filter((h) => !mine.some((m) => m.id === h.id) && (h.pid === process.pid || alive(h.pid)))];
  };
  // load-modify-save under the store's lock when it has one (file stores shared by several processes)
  const txn = (fn) => (store.withLock ?? ((f) => f()))(() => { sync(); const r = fn(); store.save({ windows: used, holds }); return r; });
  sync();

  // A window whose start moved since last seen starts again at zero; 'run' windows are one slot per runId.
  const slot = (l, tags) => (l.period === 'run' ? `${l.name}\0${tags?.runId ?? ''}` : l.name);
  const view = (l, now, tags) => {
    const start = windowStart(l, now), w = used[slot(l, tags)];
    return { start, used: w && w.start === start ? w.used : 0 };
  };
  const applies = (l, tags) => !l.tag || tags?.[l.tag.key] === l.tag.value;
  const held = (l, tags) => {
    let n = 0;
    for (const h of holds) if (applies(l, h.tags) && (l.period !== 'run' || (h.tags?.runId ?? '') === (tags?.runId ?? ''))) n += h.n;
    return n;
  };

  function peek(estimate, tags) {
    count(estimate, 'estimate');
    const now = clock.now();
    let tight = null;
    for (const l of lim) {
      if (!applies(l, tags)) continue;
      const room = ceilingAt(l, now) - view(l, now, tags).used - held(l, tags);
      if (!tight || room < tight.room) tight = { l, room };
    }
    if (!tight) return { allow: true, remaining: Infinity };
    const remaining = Math.max(0, tight.room);
    if (estimate <= remaining) return { allow: true, remaining };
    return { allow: false, remaining, reason: `Window "${tight.l.name}" (${tight.l.period}) has ${remaining} tokens left and this needs ${estimate}.` };
  }
  function add(usage, tags) {
    if (!usage || typeof usage !== 'object') fail('usage must be an object');
    const n = count(usage.inputTokens, 'inputTokens') + count(usage.outputTokens, 'outputTokens');
    const now = clock.now();
    for (const l of lim) if (applies(l, tags)) { const v = view(l, now, tags); used[slot(l, tags)] = { start: v.start, used: v.used + n }; }
  }
  const check = (estimate, tags) => { sync(); return peek(estimate, tags); };
  const record = (usage, tags) => txn(() => add(usage, tags));
  // check + hold in one locked step, so parallel callers (threads or processes) cannot all pass the same peek
  function reserve(estimate, tags) {
    const h = { id: `${process.pid}-${Math.random().toString(36).slice(2)}`, pid: process.pid, n: estimate, tags };
    const d = txn(() => { const r = peek(estimate, tags); if (r.allow) { mine.push(h); holds.push(h); } return r; });
    if (!d.allow) return { ...d, release() {}, settle() {}, extend: () => false, held: 0 };
    const drop = (usage) => txn(() => {
      const i = holds.findIndex((x) => x.id === h.id);
      if (i < 0) return;
      holds.splice(i, 1);
      mine.splice(mine.findIndex((x) => x.id === h.id), 1);
      if (usage) add(usage, tags);
    });
    // extend: grow this hold under the lock while the window has room, so a long run keeps reserving as it spends
    const extend = (more) => txn(() => { const r = peek(more, tags); if (r.allow) h.n += more; return r.allow; });
    return { ...d, release: () => drop(), settle: (usage) => drop(usage), extend, get held() { return h.n; } };
  }

  return {
    check, record, reserve,
    status() {
      sync();
      const now = clock.now();
      return lim.map((l) => {
        const ceiling = ceilingAt(l, now), u = view(l, now).used, h = held(l);
        return { name: l.name, period: l.period, tokens: l.tokens, ceiling, used: u, held: h, remaining: Math.max(0, ceiling - u - h) }; // remaining is what a new run can still reserve
      });
    },
    setLimits(next) { // keeps usage of windows whose name survives
      lim = validate(next);
      txn(() => { used = Object.fromEntries(Object.entries(used).filter(([k]) => lim.some((l) => k === l.name || k.startsWith(`${l.name}\0`)))); });
    },
  };
}

export function createFileStore(path, { tries = 2000 } = {}) {
  const lockDir = `${path}.lock`, nap = new Int32Array(new SharedArrayBuffer(4));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  const owner = (dir) => { try { return fs.readFileSync(`${dir}/owner`, 'utf8'); } catch { return null; } };
  // A lock is stale only when its holder process is gone; a holder that is merely paused (SIGSTOP, thermal guard) keeps it. Ownerless dirs are legacy locks, stale after 60 s.
  const stale = (dir) => {
    const o = owner(dir);
    if (o) return !alive(parseInt(o, 10));
    try { return Date.now() - fs.statSync(dir).mtimeMs > 60000; } catch { return false; }
  };
  // The directory is built complete (owner file inside), then renamed into place: rename onto a non-empty dir fails, so the owner is never missing and two takers never both win.
  const take = (dir, token) => {
    const tmp = `${dir}.${token}.tmp`;
    fs.mkdirSync(tmp); fs.writeFileSync(`${tmp}/owner`, token);
    try { fs.renameSync(tmp, dir); return true; } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      if (e.code === 'EEXIST' || e.code === 'ENOTEMPTY') return false;
      throw e;
    }
  };
  const drop = (dir, token) => { if (owner(dir) === token) fs.rmSync(dir, { recursive: true, force: true }); };
  const away = (dir, token) => { const dead = `${dir}.${token}.dead`; fs.renameSync(dir, dead); fs.rmSync(dead, { recursive: true, force: true }); };
  // Only the holder of the break mutex removes a stale lock, and nobody else can create the lock while the stale dir stands, so a live lock is never removed.
  // shortcut: a break mutex whose owner died is renamed away unguarded; a pid reused by a stranger would keep a lock until that process exits, upgrade if pids get reused on the hosts.
  const breakStale = (token) => {
    const brk = `${lockDir}.brk`;
    if (!take(brk, token)) { if (stale(brk)) away(brk, token); return; }
    try { if (stale(lockDir)) away(lockDir, token); } finally { drop(brk, token); }
  };
  return {
    load() {
      try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    save(state) { // temp + rename so a crash never leaves half a file
      const tmp = `${path}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, path);
    },
    withLock(fn) {
      const token = `${process.pid}-${Math.random().toString(36).slice(2)}`;
      for (let n = 0; !take(lockDir, token); n++) {
        try { if (stale(lockDir)) breakStale(token); } catch {}
        if (n > tries) throw new Error('budget: lock busy');
        Atomics.wait(nap, 0, 0, 5);
      }
      try { return fn(); } finally { try { drop(lockDir, token); } catch {} }
    },
  };
}
