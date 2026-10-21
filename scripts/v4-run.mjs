// Usage: nice -n 19 node scripts/v4-run.mjs --budget-usd=<USD per run> [--tasks=a,b] [--repeats=N] [--out=rows.jsonl]
import { resolve } from 'node:path';
import { tasks } from '../benchmarks/tasks.mjs';
import { stateDir } from '../src/runtime.mjs';
import { runV4Task } from '../src/v4-runner.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(s => { const at = s.indexOf('='); return at < 0 ? [s, true] : [s.slice(0, at), s.slice(at + 1)]; }));
const budgetUsd = Number(args['--budget-usd']);
if (typeof args['--budget-usd'] !== 'string' || !(budgetUsd > 0)) {
  console.error('Refusing to run: --budget-usd=<USD per run> is required and must be greater than 0.');
  process.exit(2);
}
const pilot = tasks.filter(t => t.split === 'pilot').map(t => t.id);
const ids = typeof args['--tasks'] === 'string' ? args['--tasks'].split(',') : pilot;
const selected = ids.map(id => tasks.find(t => t.id === id) ?? (() => { throw new Error(`Unknown task: ${id}`); })());
const repeats = Number(args['--repeats'] ?? 1);
if (!Number.isInteger(repeats) || repeats < 1) throw new Error('--repeats must be a positive integer.');
const out = resolve(typeof args['--out'] === 'string' ? args['--out'] : resolve(stateDir, 'v4/rows.jsonl'));

for (const task of selected) {
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const row = await runV4Task({ task, repeat, budgetUsd, out });
    console.log(JSON.stringify(row));
  }
}
