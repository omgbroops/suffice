import fs from 'node:fs/promises';
import path from 'node:path';
import { assertShape } from '../contract.mjs';

// Parse JSONL, dropping any unparseable line; `good` is the byte length of the valid prefix.
function parse(text) {
  const events = [];
  let good = 0;
  for (const line of text.split('\n')) {
    if (line === '') { good += 1; continue; }
    try { events.push(JSON.parse(line)); } catch { break; } // a bad line can only be the crashed tail
    good += Buffer.byteLength(line) + 1;
  }
  return { events, good: Math.min(good, Buffer.byteLength(text)) };
}

const load = (file) => fs.readFile(file, 'utf8').catch((e) => { if (e.code === 'ENOENT') return ''; throw e; });

export function createJournal({ dir, runId, clock }) {
  if (typeof dir !== 'string' || !dir) throw new TypeError('journal: dir must be a non-empty string');
  if (typeof runId !== 'string' || !/^[^/\\\0]+$/.test(runId) || runId === '.' || runId === '..')
    throw new TypeError('journal: runId must be a non-empty string without path separators');
  assertShape('clock', clock, ['now']);
  const file = path.join(dir, `${runId}.jsonl`);
  let seq = null;
  let queue = Promise.resolve();

  const serial = (fn) => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };

  async function init() {
    if (seq !== null) return;
    const text = await load(file);
    const { events, good } = parse(text);
    if (good < Buffer.byteLength(text)) await fs.truncate(file, good); // drop the crashed partial line
    seq = events.length ? events[events.length - 1].seq : 0;
  }

  async function read() {
    return serial(async () => parse(await load(file)).events);
  }

  async function append(e) {
    if (!e || typeof e.type !== 'string' || !e.type) throw new TypeError('journal.append: type must be a non-empty string');
    // Serialise up front so a bad payload throws before anything is written.
    const base = { ts: clock.now(), runId, type: e.type };
    if (e.stepKey !== undefined) base.stepKey = e.stepKey;
    if (e.data !== undefined) base.data = e.data;
    let probe;
    try { probe = JSON.stringify(base.data); } catch (err) { throw new TypeError(`journal.append: data is not JSON-serialisable (${err.message})`); }
    if (base.data !== undefined && probe === undefined) throw new TypeError('journal.append: data is not JSON-serialisable');
    return serial(async () => {
      await fs.mkdir(dir, { recursive: true });
      await init();
      const ev = { seq: seq + 1, ...base };
      await fs.appendFile(file, JSON.stringify(ev) + '\n');
      seq++;
      return ev;
    });
  }

  async function lookup(stepKey) {
    const last = (await read()).filter((e) => e.stepKey === stepKey && (e.type === 'step.result' || e.type === 'step.error')).pop();
    return last?.type === 'step.result' ? { hit: true, value: last.data } : { hit: false };
  }

  return { append, read, lookup, runId };
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
