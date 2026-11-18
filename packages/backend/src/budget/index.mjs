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
  const saved = store.load();
  let used = { ...(saved?.windows ?? {}) }; // name -> {start, used}

  // A window whose start moved since last seen starts again at zero; 'run' windows are one slot per runId.
  const slot = (l, tags) => (l.period === 'run' ? `${l.name}\0${tags?.runId ?? ''}` : l.name);
  const view = (l, now, tags) => {
    const start = windowStart(l, now), w = used[slot(l, tags)];
    return { start, used: w && w.start === start ? w.used : 0 };
  };
  const applies = (l, tags) => !l.tag || tags?.[l.tag.key] === l.tag.value;
  // Windows are shared by every window on one data dir: apply this instance's deltas to what is on disk under the store's lock, never overwrite it with a stale copy.
  const refresh = () => { if (store.update) used = { ...(store.load()?.windows ?? {}) }; };
  const persist = (deltas) => {
    if (!store.update) return store.save({ windows: used });
    used = store.update((s) => {
      const w = { ...(s?.windows ?? {}) };
      if (!deltas) return { windows: { ...used } };
      for (const [k, d] of deltas) w[k] = { start: d.start, used: (w[k]?.start === d.start ? w[k].used : 0) + d.n };
      return { windows: w };
    }).windows;
  };
  const holds = new Set(); // in-flight reservations: {n, tags}
  const held = (l, tags) => {
    let n = 0;
    for (const h of holds) if (applies(l, h.tags) && (l.period !== 'run' || (h.tags?.runId ?? '') === (tags?.runId ?? ''))) n += h.n;
    return n;
  };

  function check(estimate, tags) {
    count(estimate, 'estimate');
    refresh();
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
  function record(usage, tags) {
    if (!usage || typeof usage !== 'object') fail('usage must be an object');
    const n = count(usage.inputTokens, 'inputTokens') + count(usage.outputTokens, 'outputTokens');
    const now = clock.now();
    const deltas = [];
    for (const l of lim) if (applies(l, tags)) { const v = view(l, now, tags); used[slot(l, tags)] = { start: v.start, used: v.used + n }; deltas.push([slot(l, tags), { start: v.start, n }]); }
    persist(deltas);
  }
  // check + hold in one synchronous step, so parallel callers cannot all pass the same peek
  function reserve(estimate, tags) {
    const d = check(estimate, tags);
    if (!d.allow) return { ...d, release() {}, settle() {} };
    const h = { n: estimate, tags };
    holds.add(h);
    return { ...d, release: () => { holds.delete(h); }, settle(usage) { if (holds.delete(h)) record(usage, tags); } };
  }

  return {
    check, record, reserve,
    status() {
      const now = clock.now();
      return lim.map((l) => {
        const ceiling = ceilingAt(l, now), u = view(l, now).used;
        return { name: l.name, period: l.period, tokens: l.tokens, ceiling, used: u, remaining: Math.max(0, ceiling - u) };
      });
    },
    setLimits(next) { // keeps usage of windows whose name survives
      lim = validate(next);
      used = Object.fromEntries(Object.entries(used).filter(([k]) => lim.some((l) => k === l.name || k.startsWith(`${l.name}\0`))));
      persist();
    },
  };
}

export function createFileStore(path) {
  return {
    load() {
      try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    save(state) { // temp + rename so a crash never leaves half a file
      const tmp = `${path}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, path);
    },
    // load, change, save under a lock file so several processes on one file never lose each other's writes
    update(fn) {
      const lock = `${path}.lock`, wait = new Int32Array(new SharedArrayBuffer(4));
      for (let i = 0; ; i++) {
        try { fs.closeSync(fs.openSync(lock, 'wx')); break; } catch (e) {
          if (e.code !== 'EEXIST') throw e;
          try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.rmSync(lock, { force: true }); } catch { /* released meanwhile */ } // a crashed holder
          if (i > 2000) throw new Error('budget: store is locked');
          Atomics.wait(wait, 0, 0, 5);
        }
      }
      try { const next = fn(this.load()); this.save(next); return next; } finally { fs.rmSync(lock, { force: true }); }
    },
  };
}
