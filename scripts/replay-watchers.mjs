import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRuntime, loadEnvironment, root, stateDir } from '../src/runtime.mjs';
import { createWatcher, OPENROUTER_MODELS } from '../src/watchers.mjs';
import { hash } from '../src/workspace.mjs';

const campaign = process.argv[2];
if (!campaign || !/^[a-zA-Z0-9_-]+$/.test(campaign)) throw new Error('Supply a valid source campaign.');
const requested = (process.argv[3] ?? 'luna,jev,gemma,lightning,nemotron').split(',');
const kinds = { luna: 'luna', jev: 'jev', gemma: OPENROUTER_MODELS[0], lightning: OPENROUTER_MODELS[1], nemotron: OPENROUTER_MODELS[2] };
if (requested.some(id => !kinds[id])) throw new Error('Unknown watcher.');
loadEnvironment();
const runtime = await createRuntime();
const directory = resolve(stateDir, 'runs', campaign);
const selected = new Map();
for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  try {
    const result = JSON.parse(await readFile(resolve(directory, entry.name, 'result.json'), 'utf8'));
    if (selected.has(result.task)) continue;
    const content = await readFile(resolve(directory, entry.name, 'watcher-state-1.json'), 'utf8');
    selected.set(result.task, { state: JSON.parse(content), hash: hash(content), sourceRun: entry.name });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!selected.size) throw new Error('No frozen watcher inputs available.');
const report = { sourceCampaign: campaign, at: new Date().toISOString(), purpose: 'Same-input decision and availability comparison; no downstream success or accuracy inference.', rows: [] };
const id = `watcher-replay-${Date.now()}`;
await mkdir(resolve(root, 'reports'), { recursive: true });
for (const [task, input] of selected) {
  for (const watcher of requested) {
    const decide = createWatcher({ kind: kinds[watcher], runtime, ledgerPath: resolve(stateDir, 'jev-budget.jsonl'), timeoutMs: 30_000 });
    const result = await decide(input.state);
    const row = { task, watcher, sourceRun: input.sourceRun, inputHash: input.hash, ...result };
    report.rows.push(row);
    await writeFile(resolve(root, `reports/${id}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(row));
  }
}
