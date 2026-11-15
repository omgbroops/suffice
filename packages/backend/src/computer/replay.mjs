// §4.3: a successful run is stored as templated steps so the same goal replays with zero model calls.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function keyOf(goal, surface, start) {
  const g = String(goal ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  let s;
  try { const u = new URL(start); s = (u.origin + u.pathname).replace(/\/$/, ''); } catch { s = String(start ?? '').toLowerCase(); }
  return createHash('sha256').update(JSON.stringify([g, surface, s])).digest('hex');
}

// Secrets and secure fields never reach disk; inputs become {{name}} placeholders.
export function template(text, { inputs = {}, secrets = [], secure = false } = {}) {
  if (text === undefined) return undefined;
  if (secure || secrets.some((s) => s && text.includes(s))) return '{{secret}}';
  let t = text;
  for (const [k, v] of Object.entries(inputs)) if (v) t = t.split(String(v)).join(`{{${k}}}`);
  return t;
}

export function fill(tpl, inputs = {}) {
  if (tpl === undefined) return undefined;
  let bad = false;
  const out = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (inputs[k] === undefined) { bad = true; return ''; } return String(inputs[k]); });
  return bad ? null : out;
}

export function createReplayCache({ dir, invalidateAfter = 3 }) {
  const file = (k) => join(dir, `${k}.json`);
  const get = async (k) => { try { return JSON.parse(await readFile(file(k), 'utf8')); } catch { return null; } };
  const save = async (k, e) => { await mkdir(dir, { recursive: true }); const tmp = `${file(k)}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(e)); await rename(tmp, file(k)); };
  return {
    get,
    put: (k, steps, answer) => save(k, { steps, answer: answer ?? null, fails: 0 }),
    async fail(k) { const e = await get(k); if (!e) return; e.fails++; if (e.fails >= invalidateAfter) await rm(file(k), { force: true }); else await save(k, e); },
    async ok(k) { const e = await get(k); if (e && e.fails) { e.fails = 0; await save(k, e); } },
  };
}
