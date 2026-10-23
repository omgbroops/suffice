import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runV7Task, parseV7Stages, testSystem, V7_PROBE_SYSTEM_PROMPT, V7_REVIEW_SYSTEM_PROMPT, V7_FIX_SYSTEM_PROMPT } from '../src/v7-arm.mjs';
import { V6_PLANNER_SYSTEM_PROMPT, V6_EXEC_SYSTEM_PROMPT } from '../src/v6-arm.mjs';
import { armTiers } from '../src/v4-config.mjs';

// Fake claude: each stage is recognised by its system prompt and writes its files into the workspace.
const CHECK = `import { add } from './impl.mjs';
let p = 0, f = 0; const t = c => c ? p++ : f++;
t(add(1, 2) === 3); t(add(0, 0) === 0);
console.log('# pass ' + p); if (f) process.exitCode = 1;
`;
const EMPTY = '// no tests here\n'; // exits 0 and prints no runner summary
const GOOD = 'export const add = (a, b) => a + b;\n';
const BAD = 'export const add = (a, b) => a - b;\n';
const ROLES = {
  [V6_PLANNER_SYSTEM_PROMPT]: 'plan', [V6_EXEC_SYSTEM_PROMPT]: 'coder', [V7_PROBE_SYSTEM_PROMPT]: 'probe',
  [V7_REVIEW_SYSTEM_PROMPT]: 'review', [V7_FIX_SYSTEM_PROMPT]: 'fix', [testSystem('blind')]: 'blind', [testSystem('sblind')]: 'sblind',
};

async function fixture({ blind = { 'check.blind.mjs': CHECK }, blindCmd = 'SELFTEST: node check.blind.mjs', coder = [GOOD], reviews = ['VERDICT: PASS'], hidden = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'v7-test-'));
  const original = join(root, 'orig');
  await mkdir(original);
  await writeFile(join(original, 'impl.mjs'), 'export const add = () => { throw new Error("stub"); };\n');
  const calls = [];
  let coderIdx = 0, reviewIdx = 0;
  const claude = async ({ model, workspace, system, prompt }) => {
    const role = ROLES[system] ?? 'other';
    calls.push({ role, model, prompt });
    const cost = 0.01;
    if (role === 'plan') return { costUsd: cost, text: 'PLAN: edit impl.mjs' };
    if (role === 'blind') { for (const [n, b] of Object.entries(blind)) await writeFile(join(workspace, n), b); return { costUsd: cost, text: blindCmd }; }
    if (role === 'sblind') { await writeFile(join(workspace, 'check.sblind.mjs'), CHECK); return { costUsd: cost, text: 'SELFTEST: node check.sblind.mjs' }; }
    if (role === 'probe') { await writeFile(join(workspace, 'check.probe.mjs'), CHECK); return { costUsd: cost, text: 'SELFTEST: node check.probe.mjs' }; }
    if (role === 'coder') { await writeFile(join(workspace, 'impl.mjs'), coder[coderIdx++] ?? BAD); return { costUsd: cost, text: 'done' }; }
    if (role === 'review') return { costUsd: cost, text: reviews[Math.min(reviewIdx++, reviews.length - 1)] };
    return { costUsd: cost, text: 'fixed' };
  };
  const root2 = { root, original, calls, claude, out: join(root, 'rows.jsonl'), task: { id: 't1', prompt: 'Implement add(a, b).', workspaceDir: original },
    verify: async () => hidden, cleanup: () => rm(root, { recursive: true, force: true }) };
  return root2;
}

const run = async (f, stages = 'coder,review') => {
  await runV7Task({ task: f.task, budgetUsd: 100, out: f.out, verify: f.verify, claude: f.claude, stages: parseV7Stages(stages) });
  return JSON.parse((await readFile(f.out, 'utf8')).trim());
};

test('gate fails when a test cmd runs 0 tests', async () => {
  const f = await fixture({ blind: { 'empty.blind.mjs': EMPTY }, blindCmd: 'SELFTEST: node empty.blind.mjs' });
  const row = await run(f, 'blind,coder,review');
  assert.equal(row.gates[0].pass, false);
  assert.equal(row.checks.find(c => c.checkpoint === 'coder' && c.check === 'blind').flagged, true);
  await f.cleanup();
});

test('review FAIL triggers a fix round', async () => {
  const f = await fixture({ reviews: ['VERDICT: FAIL', 'VERDICT: PASS'] });
  const row = await run(f);
  assert.equal(row.fixRounds, 1);
  assert.equal(row.selfFinalPass, true);
  assert.equal(f.calls.filter(c => c.role === 'fix').length, 1);
  await f.cleanup();
});

test('Sonnet fix round runs after 2 Haiku rounds', async () => {
  const f = await fixture({ reviews: ['VERDICT: FAIL'] });
  const [haiku, sonnet] = armTiers('v7');
  const row = await run(f);
  assert.deepEqual(f.calls.filter(c => c.role === 'fix').map(c => c.model), [haiku.model, haiku.model, sonnet.model]);
  assert.equal(row.selfFinalPass, false);
  await f.cleanup();
});

test('hidden verify never changes control flow', async () => {
  const results = [];
  for (const hidden of [true, false]) {
    const f = await fixture({ coder: [BAD], hidden });
    const row = await run(f);
    results.push({ fixRounds: row.fixRounds, selfFinalPass: row.selfFinalPass, roles: f.calls.map(c => c.role), finalPass: row.finalPass });
    assert.equal(row.finalPass, hidden);
    await f.cleanup();
  }
  assert.deepEqual(results[0].roles, results[1].roles);
  assert.equal(results[0].fixRounds, results[1].fixRounds);
  assert.equal(results[0].selfFinalPass, results[1].selfFinalPass);
});

test('disabled stages are skipped', async () => {
  const f = await fixture();
  await run(f, 'coder,review');
  const roles = f.calls.map(c => c.role);
  assert.deepEqual(roles.filter(r => ['plan', 'blind', 'probe', 'sblind'].includes(r)), []);
  assert.ok(roles.includes('coder') && roles.includes('review'));
  await f.cleanup();
});

test('agreement gate: one failing suite of two ships, two failing suites block', async () => {
  const fail = `console.log('# pass 1'); process.exitCode = 1;\n`;
  const one = await fixture({ blind: { 'check.blind.mjs': fail } });
  await runV7Task({ task: one.task, budgetUsd: 100, out: one.out, verify: one.verify, claude: one.claude, stages: parseV7Stages('blind,coder,probe'), agree: true });
  const r1 = JSON.parse((await readFile(one.out, 'utf8')).trim());
  assert.equal(r1.gates[0].pass, true);
  assert.equal(r1.fixRounds, 0);
  assert.equal(r1.checks.find(c => c.checkpoint === 'coder' && c.check === 'blind').flagged, true);
  await one.cleanup();

  const both = await fixture({ coder: [BAD] });
  await runV7Task({ task: both.task, budgetUsd: 100, out: both.out, verify: both.verify, claude: both.claude, stages: parseV7Stages('blind,coder,probe'), agree: true });
  const r2 = JSON.parse((await readFile(both.out, 'utf8')).trim());
  assert.equal(r2.gates[0].pass, false);
  await both.cleanup();

  const strict = await fixture({ blind: { 'check.blind.mjs': fail } });
  await runV7Task({ task: strict.task, budgetUsd: 100, out: strict.out, verify: strict.verify, claude: strict.claude, stages: parseV7Stages('blind,coder,probe') }); // default = strict
  assert.equal(JSON.parse((await readFile(strict.out, 'utf8')).trim()).gates[0].pass, false);
  await strict.cleanup();
});

test('sblindCheap runs the task-only writer on the cheap tier without the plan', async () => {
  const f = await fixture();
  await runV7Task({ task: f.task, budgetUsd: 100, out: f.out, verify: f.verify, claude: f.claude, stages: parseV7Stages('plan,blind,coder,sblind'), agree: true, sblindCheap: true });
  const sb = f.calls.find(c => c.role === 'sblind');
  assert.equal(sb.model, armTiers('v7')[0].model);
  assert.ok(!sb.prompt.includes('PLAN:'));
  await f.cleanup();
});
