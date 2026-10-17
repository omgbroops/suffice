// Free selector for N parallel attempts: cluster by behaviour on enumerated probes (no oracle, no LLM), pick the largest cluster.
// Usage: node scripts/consensus-select.mjs <attemptsJson> <dirTemplate with {id}> ; attemptsJson rows: {attempt, acceptance}
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const [data, tpl] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(data, 'utf8'));
const atoms = ['/a', '/:a', '/*', ':a', '-:b', '-:c', '*', '/x.y', '?', '+'];
const pats = new Set(['/:a-:b-:c', '/:a-:b', '/a*-:b-:c', '/*-:a-:b', '/:a']);
for (const x of atoms) for (const y of atoms) pats.add('/' + x.replace(/^\//, '') + y.replace(/^\//, ''));
for (const x of atoms) for (const y of atoms) for (const z of atoms) pats.add('/' + x.replace(/^\//, '') + y + z);
const strs = ['/1', '/1-2', '/1-2-3', '/1--2', '/1-2--3', '/1-2-3--4', '/ab-1-2--3', '/a/b-1-2--3', '/p/q-1-2--3', '/x.y-1-2', '/1-2-3-4'];
const behave = f => [...pats].map(p => { try { return strs.map(s => JSON.stringify(f(p).exec(s))).join('|'); } catch (e) { return 'ERR'; } }).join('\n');
const sig = {};
for (const r of rows) {
  try { const f = require(tpl.replace('{id}', r.attempt) + '/src/index.js'); sig[r.attempt] = behave(f); } catch (e) { sig[r.attempt] = 'LOADERR'; }
}
const cl = {}; for (const r of rows) (cl[sig[r.attempt]] ??= []).push(r);
const cs = Object.values(cl).sort((a, b) => b.length - a.length);
console.log(`${pats.size} probes; ${cs.length} behaviour clusters over ${rows.length} attempts`);
for (const c of cs) console.log(c.length, c.map(r => r.attempt + (r.acceptance ? '+' : '-')).join(' '));
// leave-one-pool-out: random N-subsets, pick largest cluster (ties: first), report P(correct)
let tot = 0, ok = 0;
const idx = rows.map((_, i) => i);
for (const N of [3, 5]) { tot = ok = 0;
  const rec = (s, start) => { if (s.length === N) { const g = {}; for (const i of s) (g[sig[rows[i].attempt]] ??= []).push(rows[i]);
    const m = Math.max(...Object.values(g).map(a => a.length)), top = Object.values(g).filter(a => a.length === m).flat();
    tot++; ok += top.filter(r => r.acceptance).length / top.length; return; }
    for (let i = start; i < idx.length; i++) rec([...s, i], i + 1); };
  rec([], 0);
  const base = rows.filter(r => r.acceptance).length / rows.length;
  console.log(`N=${N}: consensus picks correct ${(ok / tot).toFixed(3)} vs random single ${base.toFixed(3)} (${tot} subsets, ties split evenly)`); }
