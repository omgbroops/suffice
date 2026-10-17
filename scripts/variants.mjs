// Shared eval runner for harness variants on one task. `collect` runs real `claude -p` attempts (cost/tokens from its JSON) into a pool;
// `table` replays variant policies over the pool, so every variant is priced from measured attempts, not simulated ones.
// Usage: node scripts/variants.mjs collect <model> <n> [tag] | node scripts/variants.mjs table
// shortcut: one task (path-to-regexp-425), policies are offline replays over pooled attempts; upgrade to live per-variant runs when a task has >1 non-saturated case.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { stateDir } from '../src/runtime.mjs';
import { runNodeTests } from '../src/workspace.mjs';
import { violations } from './property-gate.mjs';
const ID = 'path-to-regexp-425', POOL = resolve(import.meta.dirname, '../reports/variants-pool.json');
const base = resolve(stateDir, 'real-tasks', ID, 'workspace'), tdir = f => resolve(import.meta.dirname, '../benchmarks/real', f);
const prompt = readFileSync(resolve(import.meta.dirname, '../reports/ptr-prompts/symptom-only.md'), 'utf8').replace('SUFFICE_WORKSPACE=<workspace>', 'SUFFICE_WORKSPACE=$PWD');
const pass = async (ws, f) => (await runNodeTests(ws, f)).status === 'passed';
const load = () => existsSync(POOL) ? JSON.parse(readFileSync(POOL, 'utf8')) : [];
const fresh = model => { const ws = mkdtempSync(resolve(stateDir, 'tmp', `var-${model}-`)); cpSync(base, ws, { recursive: true }); return ws; };
const run = (model, ws, text) => new Promise(done => {
  const p = spawn('claude', ['-p', text, '--model', model, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read Edit Write Bash Glob Grep', '--max-turns', '30'], { cwd: ws });
  let out = ''; p.stdout.on('data', d => out += d); p.on('close', () => {
    let j = {}; try { j = JSON.parse(out); } catch {}
    const u = j.usage ?? {};
    done({ usd: j.total_cost_usd ?? 0, tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0) });
  });
});
const score = async ws => ({ visible: await pass(ws, resolve(ws, 'tests/visible.test.mjs')), example: await pass(ws, tdir('path-to-regexp-example.test.mjs')), property: violations(ws).length === 0, acceptance: await pass(ws, tdir(`${ID}.test.mjs`)) });
const attempt = async (model, tag, i) => { const ws = fresh(model), r = await run(model, ws, prompt); return { id: `${model}-${tag}${i}`, model, ...r, ...await score(ws) }; };
// V4 counterexample-driven repair: free property gate -> feed the violating probe back to the same cheap model, up to 2 rounds.
const repair = async (model, tag, i) => { const ws = fresh(model); let r = await run(model, ws, prompt), s = await score(ws), rounds = 0;
  while (rounds < 2 && !s.property) { const v = violations(ws)[0]; rounds++; const x = await run(model, ws, `${prompt}\n\nYour current patch in this workspace is still wrong: ${v.replace(' ~ ', '.exec on ')} succeeds and a captured parameter starts with the separator that precedes it in the pattern. Fix src so no such match exists, keeping the smoke test green.`); r = { usd: r.usd + x.usd, tokens: r.tokens + x.tokens }; s = await score(ws); }
  return { id: `${model}-repair-${tag}${i}`, model: `${model}-repair`, rounds, ...r, ...s }; };
if (process.argv[2] === 'collect') { // POOL path: reports/variants-pool.json, or ..-repair.json when mode=repair
  const [, , , model, n, tag = 'v', mode] = process.argv, pool = load(), go = mode === 'repair' ? repair : attempt;
  for (let i = 0; i < +n; i += 4) { // 4 at a time
    const r = await Promise.all(Array.from({ length: Math.min(4, n - i) }, (_, k) => go(model, tag, i + k + 1)));
    pool.push(...r); writeFileSync(POOL, JSON.stringify(pool, null, 1)); console.log(r.map(x => JSON.stringify(x)).join('\n'));
  }
} else if (process.argv[2] === 'table') {
  const pool = load(), H = pool.filter(r => r.model === 'haiku'), S = pool.filter(r => r.model === 'sonnet');
  const mean = (a, f) => a.length ? a.reduce((s, r) => s + f(r), 0) / a.length : NaN, sr = (a, f = r => r.acceptance) => `${a.filter(f).length}/${a.length}`;
  const cH = mean(H, r => r.usd), cS = mean(S, r => r.usd), tH = mean(H, r => r.tokens), tS = mean(S, r => r.tokens), pS = mean(S, r => +r.acceptance);
  const rows = [];
  rows.push({ variant: 'V0 haiku solo', pass: sr(H), usd: cH, tokens: tH });
  rows.push({ variant: 'V0 sonnet solo', pass: sr(S), usd: cS, tokens: tS });
  // V2: speculative parallel — every k-window of haiku attempts runs; free gate (visible+example) picks the first that passes, else first attempt.
  for (const k of [3]) { const w = []; for (let i = 0; i + k <= H.length; i += k) w.push(H.slice(i, i + k));
    const gate = r => r.visible && r.example && (process.env.PROP !== '0' ? r.property : true), pick = g => g.find(gate) ?? g[0];
    rows.push({ variant: `V2 haiku x${k} parallel + free gate pick`, pass: sr(w.map(pick)), usd: k * cH, tokens: k * tH });
    rows.push({ variant: `V2 haiku x${k} oracle best-of (upper bound)`, pass: sr(w, g => g.some(r => r.acceptance)), usd: k * cH, tokens: k * tH }); }
  // V3: cascade — haiku, escalate to sonnet when free gate rejects. Escalated success = measured sonnet pass rate.
  const acc = H.filter(r => r.visible && r.example && r.property), esc = (H.length - acc.length) / H.length, wrong = acc.filter(r => !r.acceptance).length / H.length;
  rows.push({ variant: 'V3 haiku -> sonnet if free gate rejects', pass: `${((acc.length - wrong * H.length + esc * H.length * pS)).toFixed(1)}/${H.length} (expected)`, usd: cH + esc * cS, tokens: tH + esc * tS, note: `escalated ${(esc * 100).toFixed(0)}%, shipped-wrong ${(wrong * 100).toFixed(0)}%` });
  const R = pool.filter(r => r.model === 'haiku-repair');
  if (R.length) rows.push({ variant: 'V4 haiku + property gate + counterexample repair (<=2 rounds)', pass: sr(R), usd: mean(R, r => r.usd), tokens: mean(R, r => r.tokens), note: `mean rounds ${mean(R, r => r.rounds).toFixed(2)}, still-flagged ${R.filter(r => !r.property).length}` });
  const ok = r => parseFloat(r.pass) / parseFloat(r.pass.split('/')[1]); // pass string 'a/b' -> rate
  console.table(rows.map(r => ({ ...r, usd: +r.usd?.toFixed(4), tokens: Math.round(r.tokens), usdPerSuccess: ok(r) ? +(r.usd / ok(r)).toFixed(3) : null })));
}
