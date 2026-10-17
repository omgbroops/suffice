// Score real cheap-model attempts (.suffice/attempts/<task>-aN) against hidden acceptance and each blind spec.
// Gate agreement = spec verdict equals hidden-acceptance verdict. Usage: node scripts/score-attempts.mjs [specsDir]
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stateDir } from '../src/runtime.mjs';
import { runNodeTests } from '../src/workspace.mjs';
const specsDir = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../../overnight-2026-10-16/tracks/harness/research/specs'));
const specs = (await readdir(specsDir)).filter(f => /\.spec\.mjs$/.test(f)).sort();
const rows = [];
for (const dir of (await readdir(resolve(stateDir, 'attempts'))).sort()) {
  const [, id] = /^([a-z]+-\d+)-[as]\d+$/.exec(dir) ?? []; if (!id) continue;
  const ws = resolve(stateDir, 'attempts', dir), base = resolve(stateDir, 'real-tasks', id, 'workspace');
  const status = async p => (await runNodeTests(ws, p)).status === 'passed';
  const row = { attempt: dir, acceptance: await status(resolve(import.meta.dirname, `../benchmarks/real/${id}.test.mjs`)), visible: await status(resolve(ws, 'tests/visible.test.mjs')) };
  row.diffLines = (spawnSync('diff', ['-r', '-U0', resolve(base, 'src'), resolve(ws, 'src')], { encoding: 'utf8' }).stdout.match(/^[+-](?![+-])/gm) ?? []).length;
  for (const f of specs.filter(f => f.startsWith(id + '.'))) row[f.split('.')[1]] = await status(resolve(specsDir, f));
  rows.push(row); console.log(JSON.stringify(row));
}
await writeFile(resolve(stateDir, 'attempt-scores.json'), JSON.stringify(rows, null, 2));
