// Offline check of a spec-test gate: does each blind-written spec fail on the baseline, pass on the reference,
// and reject plausible wrong patches (mutants of the reference)? Usage: node scripts/spec-gate-eval.mjs <specsDir>
import { readdir, readFile, cp, rm, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stateDir } from '../src/runtime.mjs';
import { gateSpec } from '../src/spec-gate.mjs';
import { runNodeTests } from '../src/workspace.mjs';
const specsDir = resolve(process.argv[2] ?? '../overnight-2026-10-16/tracks/harness/research/specs');
const F = 'src/lib/parse.js';
// Wrong patches: each plausible, none equal to the reference. [from, to] applied to the reference parse.js.
const mutants = {
  'picomatch-142': {
    'ignores-negate-guard': ["        && !extglobs.some(extglob => extglob.type === 'negate')\n", '\n'],
    'always-end': ['!afterStar && isEnd) {', '!afterStar) {'],
    'ignores-rest-check': ["        && rest === ')'.repeat(state.parens)\n", '\n'],
  },
  'picomatch-99': { 'bail-returns-never-match': ["if (match[1] === '**') return;", "if (match[1] === '**') return '(?!)';"] },
  'picomatch-187': {
    'drops-literalBrackets-guard': [" && opts.literalBrackets !== true", ''],
    'drops-lone-negation-guard': ['if (!isLoneNegation) {', 'if (true) {'],
  },
};
const tmpdir = () => resolve(stateDir, 'tmp'); await mkdir(tmpdir(), { recursive: true }); // macOS /var symlink breaks --allow-fs-read
const out = [];
for (const file of (await readdir(specsDir)).filter(f => /^picomatch-\d+\..*\.spec\.mjs$/.test(f)).sort()) {
  const id = file.split('.')[0], dir = resolve(stateDir, 'real-tasks', id), source = await readFile(resolve(specsDir, file), 'utf8');
  const specPath = resolve(tmpdir(), `spec-${process.pid}-${file}`);
  const ref = resolve(dir, 'reference');
  const base = await gateSpec({ source, specPath, baseline: resolve(dir, 'workspace'), candidate: ref });
  const row = { spec: file, usable: base.usable, reason: base.reason, baselineFails: base.before === 'failed', referencePasses: base.accepted ?? null, mutants: {} };
  if (base.usable) for (const [name, [from, to]] of Object.entries(mutants[id])) {
    const m = resolve(tmpdir(), `mut-${process.pid}-${id}-${name}`);
    await rm(m, { recursive: true, force: true }); await cp(ref, m, { recursive: true });
    const text = await readFile(resolve(m, F), 'utf8'); if (text.split(from).length !== 2) throw new Error(`mutant anchor missing: ${id}/${name}`);
    await writeFile(resolve(m, F), text.replace(from, () => to));
    const r = await gateSpec({ source, specPath, baseline: resolve(dir, 'workspace'), candidate: m });
    // A mutant only counts if hidden acceptance (the PR test) proves it is really wrong.
    const wrong = (await runNodeTests(m, resolve(import.meta.dirname, `../benchmarks/real/${id}.test.mjs`))).status !== 'passed';
    row.mutants[name] = !wrong ? 'EQUIVALENT(passes acceptance)' : r.accepted ? 'ESCAPES' : 'rejected';
  }
  out.push(row); console.log(JSON.stringify(row));
}
