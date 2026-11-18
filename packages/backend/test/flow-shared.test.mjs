import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBackend } from '../src/app/backend.mjs';
import { createBudget, createFileStore } from '../src/budget/index.mjs';
import { createFakeRunner } from '../src/runner/index.mjs';

const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-shared-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const clock = { now: () => 1000 };
const usage = { inputTokens: 5, outputTokens: 5 };

test('budget: two instances on one file keep each other\'s usage', (t) => {
  const file = path.join(tmp(t), 'budget.json');
  const limits = [{ name: 'run', period: 'run', tokens: 1000 }, { name: 'day', period: 'day', tokens: 10000 }];
  const a = createBudget({ clock, store: createFileStore(file), limits }), b = createBudget({ clock, store: createFileStore(file), limits });
  a.record(usage, { runId: 'ra' }); b.record(usage, { runId: 'rb' }); a.record(usage, { runId: 'ra' });
  const c = createBudget({ clock, store: createFileStore(file), limits });
  assert.equal(c.status().find((s) => s.name === 'day').used, 30);
  assert.equal(c.check(990, { runId: 'ra' }).allow, false); // ra spent 20 of its 1000
  assert.equal(c.check(980, { runId: 'ra' }).allow, true);
});

test('budget: parallel processes never lose a write', (t) => {
  const file = path.join(tmp(t), 'budget.json');
  const mod = fileURLToPath(new URL('../src/budget/index.mjs', import.meta.url));
  const code = `import {createBudget,createFileStore} from ${JSON.stringify(mod)};
const b=createBudget({clock:{now:()=>1000},store:createFileStore(${JSON.stringify(file)}),limits:[{name:'day',period:'day',tokens:1e9}]});
for(let i=0;i<40;i++)b.record({inputTokens:1,outputTokens:0},{});`;
  const kids = Array.from({ length: 4 }, () => import('node:child_process').then((m) => new Promise((res) => m.spawn(process.execPath, ['--input-type=module', '-e', code]).on('exit', res))));
  return Promise.all(kids).then((codes) => {
    assert.deepEqual(codes, [0, 0, 0, 0]);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).windows.day.used, 160);
  });
});

const hold = () => { let release; const gate = new Promise((r) => { release = r; }); return { gate, release }; };
const mk = (dir, gate) => createBackend({ dataDir: dir, runners: { default: createFakeRunner(async () => { await gate; return { ok: true, text: 'x', usage }; }) }, approve: () => true, limits: [] });
const flow = async (api) => { await api.agent('hi', { key: 'a' }); };

test('runs: a second window cannot resume or cancel a run the first owns, and sees it as running', async (t) => {
  const dir = tmp(t), runs = path.join(dir, 'runs'), h = hold();
  const a = mk(dir, h.gate), b = mk(dir, h.gate);
  t.after(async () => { h.release(); await a.dispose(); await b.dispose(); });
  a.startRun((api) => flow(api));
  const id = (await a.listRuns())[0]?.runId ?? await new Promise((r) => setTimeout(async () => r((await a.listRuns())[0].runId), 50));
  fs.writeFileSync(path.join(runs, `${id}.meta.json`), JSON.stringify({ workflow: 'plan-build-review', args: {} }));
  await assert.rejects(b.resumeRun(id), /another Suffice window/);
  assert.equal(b.cancelRun(id), false);
  assert.equal((await b.listRuns()).find((r) => r.runId === id).state, 'running');
  h.release(); await a.wait(id);
  assert.equal((await b.listRuns()).find((r) => r.runId === id).state, 'ended');
});

test('runs: a dead window\'s lock does not block resume, and its run shows as interrupted', async (t) => {
  const dir = tmp(t), runs = path.join(dir, 'runs');
  const b = mk(dir, Promise.resolve());
  t.after(() => b.dispose());
  const dead = spawnSync(process.execPath, ['-e', '']).pid; // an exited pid
  fs.writeFileSync(path.join(runs, 'rdead.jsonl'), JSON.stringify({ seq: 1, ts: 1, runId: 'rdead', type: 'run.start' }) + '\n');
  fs.writeFileSync(path.join(runs, 'rdead.lock'), JSON.stringify({ pid: dead, owner: 'gone' }));
  fs.writeFileSync(path.join(runs, 'rdead.meta.json'), JSON.stringify({ workflow: 'research-relay', args: { topic: 't' } }));
  assert.equal((await b.listRuns())[0].state, 'interrupted');
  await b.resumeRun('rdead'); await b.wait('rdead');
  assert.equal((await b.listRuns())[0].state, 'ended');
  assert.equal(fs.existsSync(path.join(runs, 'rdead.lock')), false);
});
