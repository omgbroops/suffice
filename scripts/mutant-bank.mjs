// Systematic wrong-patch bank: mutate lines around the reference fix, keep only mutants that FAIL hidden acceptance
// (labelled wrong), then report each blind spec's kill rate with Wilson 95% CI. Usage: node scripts/mutant-bank.mjs [specsDir]
import { readdir, readFile, writeFile, cp, rm, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stateDir } from '../src/runtime.mjs';
import { runNodeTests } from '../src/workspace.mjs';
import { validateSpecSource } from '../src/spec-gate.mjs';
const specsDir = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../../overnight-2026-10-16/tracks/harness/research/specs'));
const tmp = resolve(stateDir, 'tmp'); await mkdir(tmp, { recursive: true });
const F = 'src/lib/parse.js', WINDOW = 25, CAP = 120;
const OPS = [[/===/, '!=='], [/!==/, '==='], [/&&/, '||'], [/\|\|/, '&&'], [/\btrue\b/, 'false'], [/\bfalse\b/, 'true'], [/>=/, '>'], [/\s>\s/, ' >= '], [/ < /, ' <= '], [/\b0\b/, '1'], [/!(?=[\w(])/, '']];
export function wilson(k, n, z = 1.96) { if (!n) return [0, 1]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; }
export function mutate(lines, targets) {
  const out = new Map();
  for (const i of targets) for (const [re, to] of OPS) {
    const m = re.exec(lines[i]); if (!m || /^\s*(\/\/|\*)/.test(lines[i])) continue;
    const l = lines.slice(); l[i] = lines[i].slice(0, m.index) + to + lines[i].slice(m.index + m[0].length);
    out.set(`L${i + 1}:${re.source}`, l.join('\n'));
  }
  return out;
}
const specs = (await readdir(specsDir)).filter(f => /^picomatch-\d+\..*\.spec\.mjs$/.test(f)).sort();
const summary = {};
for (const id of ['picomatch-142', 'picomatch-99', 'picomatch-187']) {
  const dir = resolve(stateDir, 'real-tasks', id), ref = resolve(dir, 'reference'), base = resolve(dir, 'workspace');
  const refText = (await readFile(resolve(ref, F), 'utf8')), baseText = await readFile(resolve(base, F), 'utf8');
  await writeFile(resolve(tmp, 'a'), baseText); await writeFile(resolve(tmp, 'b'), refText);
  const d = spawnSync('diff', ['-U0', resolve(tmp, 'a'), resolve(tmp, 'b')], { encoding: 'utf8' }).stdout;
  const changed = [...d.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)].flatMap(m => Array.from({ length: Math.max(Number(m[2] ?? 1), 1) }, (_, k) => Number(m[1]) - 1 + k));
  const lines = refText.split('\n'), targets = new Set(changed.flatMap(c => Array.from({ length: 2 * WINDOW + 1 }, (_, k) => c - WINDOW + k)).filter(i => i >= 0 && i < lines.length));
  const mutants = [...mutate(lines, [...targets]).entries()].slice(0, CAP);
  const accPath = resolve(import.meta.dirname, `../benchmarks/real/${id}.test.mjs`);
  const runSpec = async (ws, file, name) => { const p = resolve(tmp, `${id}-${name}-${file}`); await writeFile(p, await readFile(resolve(specsDir, file))); return (await runNodeTests(ws, p)).status; };
  const mine = specs.filter(f => f.startsWith(id + '.'));
  const refOk = {}; for (const f of mine) refOk[f] = await runSpec(ref, f, 'ref') === 'passed'; // sequential: runSpec reuses one temp path
  const wrong = [], rows = [];
  for (const [name, text] of mutants) {
    const m = resolve(tmp, `m-${id}`); await rm(m, { recursive: true, force: true }); await cp(ref, m, { recursive: true }); await writeFile(resolve(m, F), text);
    if ((await runNodeTests(m, accPath)).status === 'passed') continue; // equivalent or untested by acceptance: not labelled wrong
    const row = { name }; for (const f of mine) row[f] = (await runSpec(m, f, 'mut')) === 'passed' ? 'ESCAPE' : 'killed'; rows.push(row);
  }
  summary[id] = { generated: mutants.length, labelledWrong: rows.length, specs: Object.fromEntries(mine.map(f => { const k = rows.filter(r => r[f] === 'killed').length; return [f, { referencePasses: refOk[f], killed: k, of: rows.length, wilson95: wilson(k, rows.length).map(x => +x.toFixed(2)) }]; })) };
  summary[id].rows = rows; console.log(JSON.stringify({ ...summary[id], rows: undefined }));
}
await writeFile(resolve(stateDir, 'mutant-bank-results.json'), JSON.stringify(summary, null, 2));
