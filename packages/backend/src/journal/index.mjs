import fs from 'node:fs/promises';
import path from 'node:path';
import { assertShape } from '../contract.mjs';

// Parse JSONL: skip corrupt lines, count them; `partial` is the byte length of an unparseable final line with no newline.
function parse(text) {
  const lines = text.split('\n');
  const last = lines.pop();
  const events = [];
  let skipped = 0, partial = 0;
  for (const line of lines) {
    if (line === '') continue;
    try { events.push(JSON.parse(line)); } catch { skipped++; }
  }
  if (last) { try { events.push(JSON.parse(last)); } catch { partial = Buffer.byteLength(last); } }
  return { events, skipped, partial, needsNl: !!last && !partial };
}

// Reject what JSON.stringify would silently change (undefined, functions, symbols, NaN/Infinity).
function check(v) {
  if (v === undefined || typeof v === 'function' || typeof v === 'symbol' || (typeof v === 'number' && !Number.isFinite(v))) throw new TypeError('journal.append: data holds a value JSON cannot keep');
  if (v && typeof v === 'object' && typeof v.toJSON !== 'function') Object.values(v).forEach(check);
}

const shared = new Map(); // abs file -> {queue, seq}; instances on one file share both

const load = (file) => fs.readFile(file, 'utf8').catch((e) => { if (e.code === 'ENOENT') return ''; throw e; });

export function createJournal({ dir, runId, clock }) {
  if (typeof dir !== 'string' || !dir) throw new TypeError('journal: dir must be a non-empty string');
  if (typeof runId !== 'string' || !/^[^/\\\0]+$/.test(runId) || runId === '.' || runId === '..')
    throw new TypeError('journal: runId must be a non-empty string without path separators');
  assertShape('clock', clock, ['now']);
  const file = path.join(dir, `${runId}.jsonl`);
  const key = path.resolve(file);
  if (!shared.has(key)) shared.set(key, { queue: Promise.resolve(), seq: null });
  const sh = shared.get(key);

  const serial = (fn) => { const p = sh.queue.then(fn); sh.queue = p.catch(() => {}); return p; };

  async function init() {
    const size = await fs.stat(file).then((x) => x.size, () => 0);
    if (sh.seq !== null && size === sh.size) return; // size drift = someone else wrote (or crashed mid-line): re-scan
    const text = await load(file);
    const { events, partial, needsNl } = parse(text);
    if (partial) await fs.truncate(file, Buffer.byteLength(text) - partial); // only a crashed final line is dropped
    else if (needsNl) await fs.appendFile(file, '\n');
    sh.size = Buffer.byteLength(text) - partial + (needsNl ? 1 : 0);
    sh.seq = events.reduce((m, e) => Math.max(m, Number.isInteger(e?.seq) ? e.seq : 0), 0);
  }

  async function read() {
    return serial(async () => parse(await load(file)).events);
  }

  const stats = () => serial(async () => ({ skipped: parse(await load(file)).skipped }));

  async function append(e) {
    if (!e || typeof e.type !== 'string' || !e.type) throw new TypeError('journal.append: type must be a non-empty string');
    // Serialise up front so a bad payload throws before anything is written.
    const base = { ts: clock.now(), runId, type: e.type };
    if (e.stepKey !== undefined) base.stepKey = e.stepKey;
    if (e.data !== undefined) base.data = e.data;
    try { JSON.stringify(base.data); } catch (err) { throw new TypeError(`journal.append: data is not JSON-serialisable (${err.message})`); }
    if (base.data !== undefined) check(base.data);
    return serial(async () => {
      await fs.mkdir(dir, { recursive: true });
      await init();
      const ev = { seq: sh.seq + 1, ...base };
      const line = JSON.stringify(ev) + '\n';
      await fs.appendFile(file, line);
      sh.seq++;
      sh.size += Buffer.byteLength(line);
      return ev;
    });
  }

  async function lookup(stepKey) {
    const last = (await read()).filter((e) => e.stepKey === stepKey && (e.type === 'step.result' || e.type === 'step.error')).pop();
    return last?.type === 'step.result' ? { hit: true, value: last.data } : { hit: false };
  }

  return { append, read, lookup, stats, runId };
}

export async function step(journal, stepKey, fn) {
  assertShape('journal', journal, ['append', 'lookup']);
  if (typeof stepKey !== 'string' || !stepKey) throw new TypeError('step: stepKey must be a non-empty string');
  if (typeof fn !== 'function') throw new TypeError('step: fn must be a function');
  const hit = await journal.lookup(stepKey);
  if (hit.hit) return hit.value;
  await journal.append({ type: 'step.start', stepKey });
  try {
    const value = await fn();
    await journal.append({ type: 'step.result', stepKey, data: value });
    return value;
  } catch (err) {
    await journal.append({ type: 'step.error', stepKey, data: String(err?.message ?? err) });
    throw err;
  }
}

export function createBus() {
  const subs = new Map();
  return {
    on(type, fn) {
      if (typeof fn !== 'function') throw new TypeError('bus.on: listener must be a function');
      if (!subs.has(type)) subs.set(type, new Set());
      subs.get(type).add(fn);
      return () => subs.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of [...(subs.get(type) ?? [])]) { try { fn(payload); } catch { /* isolate listeners */ } }
    },
  };
}

export async function listRuns(dir) {
  const names = await fs.readdir(dir).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
  const runs = [];
  for (const n of names.filter((x) => x.endsWith('.jsonl'))) {
    const { events } = parse(await load(path.join(dir, n)));
    if (!events.length) continue;
    runs.push({ runId: n.slice(0, -6), first: events[0].ts, last: events.at(-1).ts, ended: events.some((e) => e.type === 'run.end') });
  }
  return runs;
}
