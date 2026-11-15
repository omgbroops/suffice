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

  // A window whose start moved since last seen starts again at zero.
  const view = (l, now) => {
    const start = windowStart(l, now), w = used[l.name];
    return { start, used: w && w.start === start ? w.used : 0 };
  };
  const applies = (l, tags) => !l.tag || tags?.[l.tag.key] === l.tag.value;
  const persist = () => store.save({ windows: used });

  return {
    check(estimate, tags) {
      count(estimate, 'estimate');
      const now = clock.now();
      let tight = null;
      for (const l of lim) {
        if (!applies(l, tags)) continue;
        const room = ceilingAt(l, now) - view(l, now).used;
        if (!tight || room < tight.room) tight = { l, room };
      }
      if (!tight) return { allow: true, remaining: Infinity };
      const remaining = Math.max(0, tight.room);
      if (estimate <= remaining) return { allow: true, remaining };
      return { allow: false, remaining, reason: `Window "${tight.l.name}" (${tight.l.period}) has ${remaining} tokens left and this needs ${estimate}.` };
    },
    record(usage, tags) {
      if (!usage || typeof usage !== 'object') fail('usage must be an object');
      const n = count(usage.inputTokens, 'inputTokens') + count(usage.outputTokens, 'outputTokens');
      const now = clock.now();
      for (const l of lim) if (applies(l, tags)) { const v = view(l, now); used[l.name] = { start: v.start, used: v.used + n }; }
      persist();
    },
    status() {
      const now = clock.now();
      return lim.map((l) => {
        const ceiling = ceilingAt(l, now), u = view(l, now).used;
        return { name: l.name, period: l.period, tokens: l.tokens, ceiling, used: u, remaining: Math.max(0, ceiling - u) };
      });
    },
    setLimits(next) { // keeps usage of windows whose name survives
      lim = validate(next);
      used = Object.fromEntries(Object.entries(used).filter(([k]) => lim.some((l) => l.name === k)));
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
  };
}
