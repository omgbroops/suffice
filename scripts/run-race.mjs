// Race N identical trajectories against one benchmark task.
// Usage: node scripts/run-race.mjs --task=T --variant=fast --n=3 --selection=first|best
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tasks } from '../benchmarks/tasks.mjs';
import { createRuntime, loadEnvironment, stateDir } from '../src/runtime.mjs';
import { variants } from '../src/harness.mjs';
import { runRace } from '../src/race.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(s => { const at = s.indexOf('='); return at < 0 ? [s, true] : [s.slice(0, at), s.slice(at + 1)]; }));
const task = tasks.find(t => t.id === args['--task']);
if (!task) throw new Error(`Unknown task: ${args['--task']}`);
const variant = variants.find(v => v.id === (args['--variant'] ?? 'fast'));
if (!variant) throw new Error(`Unknown variant: ${args['--variant']}`);
const n = Number(args['--n'] ?? 3);
if (!Number.isInteger(n) || n < 2 || n > 8) throw new Error('n must be 2-8.');
const campaign = String(args['--campaign'] ?? `race-${new Date().toISOString().replace(/[:.]/g, '-')}`);
if (!/^[a-zA-Z0-9_-]+$/.test(campaign)) throw new Error('Invalid campaign name.');
loadEnvironment();
const runtime = await createRuntime();
if (!runtime.isUsingSubscription('openai')) throw new Error('Run node scripts/login.mjs first.');
const runDir = resolve(stateDir, 'races', campaign, `${task.id}-${variant.id}`);
await mkdir(runDir, { recursive: true });
console.log(JSON.stringify({ event: 'race_start', task: task.id, variant: variant.id, n, selection: args['--selection'] ?? 'first', runDir }));
const result = await runRace({
  runtime, task, variant, n, runDir,
  thinkingLevel: args['--effort'] ?? 'low',
  timeoutMs: Number(args['--timeout-ms'] ?? 240000),
  selection: args['--selection'] ?? 'first',
});
console.log(JSON.stringify({ event: 'race_end', status: result.status, chosen: result.chosen, latencyMs: result.latencyMs,
  attempts: result.attempts.map(a => ({ index: a.index, status: a.status, passed: a.passed, diffLines: a.diffLines, latencyMs: a.latencyMs })),
  estimatedUsd: result.usage?.estimatedApiUsd ?? null }));
process.exitCode = result.status === 'completed' ? 0 : 2;
