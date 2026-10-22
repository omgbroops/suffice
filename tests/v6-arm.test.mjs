import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runV6Task, v6DefaultBudget, V6_WRITER_SYSTEM_PROMPT, V6_PLANNER_SYSTEM_PROMPT, V6_EXEC_SYSTEM_PROMPT, fileTree, planFileBlock } from '../src/v6-arm.mjs';
import { makeClaudeAdapter } from '../src/v4-claude.mjs';
import { armTiers } from '../src/v4-config.mjs';
import { openLedger } from '../src/v4-ledger.mjs';
import { runBench } from '../scripts/v4-bench.mjs';

// Fake claude: the writer (recognised by its system prompt) writes check.mjs; candidates write impl.mjs from `impls`, in call order.
const CHECK = `import { add } from './impl.mjs';
let p = 0, f = 0; const t = c => c ? p++ : f++;
t(add(1, 2) === 3); t(add(0, 0) === 0);
console.log('# pass ' + p); if (f) process.exitCode = 1;
`;
const GOOD = 'export const add = (a, b) => a + b;\n';
const BAD = 'export const add = (a, b) => a - b;\n';

async function setup({ impls = [], repairImpl = null, escalateImpl = null, costs = {}, writerText = 'SELFTEST: node check.mjs', writerFiles = { 'check.mjs': CHECK }, plannerText = 'PLAN: edit impl.mjs add' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'v6-test-'));
  const original = join(root, 'orig');
  await mkdir(original);
  await writeFile(join(original, 'impl.mjs'), 'export const add = () => { throw new Error("stub"); };\n');
  const calls = [];
  let cand = 0;
  const claude = async ({ model, workspace, system, prompt }) => {
    calls.push({ model, system: system ?? null, prompt });
    const cost = costs[calls.length - 1] ?? 0.01;
    if (system === V6_PLANNER_SYSTEM_PROMPT) return { costUsd: cost, text: plannerText };
    if (system === V6_WRITER_SYSTEM_PROMPT) {
      for (const [name, body] of Object.entries(writerFiles)) await writeFile(join(workspace, name), body);
      return { costUsd: cost, text: writerText };
    }
    if (prompt.startsWith('The tests failed')) {
      const body = model === armTiers('v6')[1].model ? escalateImpl : repairImpl;
      if (body) await writeFile(join(workspace, 'impl.mjs'), body);
      return { costUsd: cost, text: 'fixed' };
    }
    const body = impls[cand++] ?? BAD;
    await writeFile(join(workspace, 'impl.mjs'), body);
    return { costUsd: cost, text: 'done' };
  };
  // Hidden verdict: impl.mjs must add correctly. Records the files it saw so the writer-leak test can inspect them.
  const seen = [];
  const verify = async ws => {
    seen.push((await readdir(ws)).sort());
    return (await readFile(join(ws, 'impl.mjs'), 'utf8')) === GOOD;
  };
  const out = join(root, 'rows.jsonl');
  const task = { id: 't1', prompt: 'Implement add(a, b).', workspaceDir: original };
  const cleanup = () => rm(root, { recursive: true, force: true });
  return { root, task, out, claude, calls, verify, seen, cleanup, original };
}

// plan defaults off so the legacy call-order assertions hold; planner tests pass plan: true.
const run = (s, extra = {}) => runV6Task({ task: s.task, budgetUsd: 1, out: s.out, verify: s.verify, claude: s.claude, plan: false, ...extra });

test('v6DefaultBudget covers writer + K candidates + repair + top', () => {
  const tiers = armTiers('v6');
  assert.equal(v6DefaultBudget(tiers, 2, false), 4 * tiers[0].costEstimateUsd + tiers[1].costEstimateUsd);
  assert.equal(v6DefaultBudget(tiers, 2), 5 * tiers[0].costEstimateUsd + tiers[1].costEstimateUsd);
});

test('exec tiers run at low effort with only Read, Edit, Bash', () => {
  for (const t of armTiers('v6')) { assert.equal(t.effort, 'low'); assert.deepEqual(t.tools, ['Read', 'Edit', 'Bash']); }
});

test('planner runs first, read-only, and its plan and named files reach writer and candidates', async () => {
  const s = await setup({ impls: [GOOD] });
  await writeFile(join(s.original, 'notes.txt'), 'UNIQUE-NOTE-42');
  try {
    const row = await run(s, { plan: true });
    assert.equal(row.status, 'completed');
    const [planner, writer, cand] = s.calls;
    assert.equal(planner.system, V6_PLANNER_SYSTEM_PROMPT);
    assert.equal(writer.system, V6_WRITER_SYSTEM_PROMPT);
    assert.equal(cand.system, V6_EXEC_SYSTEM_PROMPT);
    assert.match(writer.prompt, /PLAN: edit impl.mjs add/);
    assert.match(cand.prompt, /PLAN: edit impl.mjs add/);
    assert.match(cand.prompt, /--- impl.mjs/);
    assert.deepEqual(row.calls.map(c => c.role), ['planner', 'writer', 'cand', 'cand']);
    assert.equal(row.plan, true);
    assert.equal(row.planText, 'PLAN: edit impl.mjs add');
    assert.equal(row.writerPassCounts[0], 2);
  } finally { await s.cleanup(); }
});

test('planFileBlock includes only tree files the plan names, capped', async () => {
  const s = await setup();
  try {
    await writeFile(join(s.original, 'notes.txt'), 'hello');
    const tree = await fileTree(s.original);
    assert.ok(tree.includes('impl.mjs') && tree.includes('notes.txt'));
    const block = await planFileBlock(s.original, 'edit impl.mjs', tree);
    assert.match(block, /--- impl.mjs/);
    assert.doesNotMatch(block, /notes/);
    assert.equal((await planFileBlock(s.original, 'impl.mjs', tree, 3)).length, 12);
  } finally { await s.cleanup(); }
});

test('exclude-dynamic flag, per-call max-turns and num_turns reach the claude argv', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v6-fake-bin-'));
  const bin = join(dir, 'fake-claude.mjs');
  await writeFile(bin, '#!/usr/bin/env node\nconsole.log(JSON.stringify({ result: JSON.stringify(process.argv.slice(2)), total_cost_usd: 0.01, num_turns: 3, usage: { input_tokens: 1 } }));\n');
  await chmod(bin, 0o755);
  try {
    const adapter = makeClaudeAdapter({ bin, lean: true, systemPrompt: V6_PLANNER_SYSTEM_PROMPT });
    const r = await adapter({ model: 'm', effort: null, prompt: 'p', workspace: dir, tools: ['Read'], maxTurns: 3, remainingBudgetUsd: 1 });
    const args = JSON.parse(r.text);
    assert.ok(args.includes('--exclude-dynamic-system-prompt-sections'));
    assert.equal(args[args.indexOf('--max-turns') + 1], '3');
    assert.equal(args.includes('--effort'), false);
    assert.equal(r.numTurns, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('picks the candidate that passes the most writer tests', async () => {
  const s = await setup({ impls: [BAD, GOOD] });
  try {
    const row = await run(s);
    assert.equal(row.status, 'completed');
    assert.equal(row.pickedIndex, 1);
    assert.deepEqual(row.writerPassCounts, [1, 2]);
    assert.equal(row.firstAttemptPass, true);
    assert.equal(row.finalPass, true);
    assert.equal(row.repaired, false);
  } finally { await s.cleanup(); }
});

test('ties on writer passes go to the cheaper candidate', async () => {
  const s = await setup({ impls: [GOOD, GOOD], costs: { 1: 0.05, 2: 0.01 } });
  try {
    // calls: 0 writer (cost default), 1 candidate0 (0.05), 2 candidate1 (0.01)
    const row = await run(s);
    assert.equal(row.pickedIndex, 1);
    assert.deepEqual(row.candidateCosts, [0.05, 0.01]);
  } finally { await s.cleanup(); }
});

test('a failing candidate gets one cheap repair that fixes it', async () => {
  const s = await setup({ impls: [BAD, BAD], repairImpl: GOOD });
  try {
    const row = await run(s);
    assert.equal(row.repaired, true);
    assert.equal(row.escalated, false);
    assert.equal(row.firstAttemptPass, false);
    assert.equal(row.finalPass, true);
    assert.equal(s.calls.filter(c => c.prompt.startsWith('The tests failed')).length, 1);
  } finally { await s.cleanup(); }
});

test('repair that still fails escalates once to the top rung', async () => {
  const s = await setup({ impls: [BAD, BAD], repairImpl: BAD, escalateImpl: GOOD });
  try {
    const row = await run(s);
    const top = armTiers('v6')[1];
    assert.equal(row.escalated, true);
    assert.equal(row.finalPass, true);
    assert.equal(s.calls.at(-1).model, top.model);
    assert.equal(row.selfTests.at(-1).stage, 'escalate');
  } finally { await s.cleanup(); }
});

test('no repair when the writer tests already pass on the picked candidate', async () => {
  const s = await setup({ impls: [GOOD, GOOD] });
  try {
    const row = await run(s);
    assert.equal(row.repaired, false);
    assert.equal(s.calls.length, 3); // writer + 2 candidates
  } finally { await s.cleanup(); }
});

test('no fix possible: row records no pass and no escalation when the budget is spent', async () => {
  const s = await setup({ impls: [BAD, BAD], repairImpl: BAD });
  try {
    const row = await run(s, { budgetUsd: 0.07 });
    assert.equal(row.finalPass, false);
    assert.equal(row.escalated, false);
    assert.equal(row.escalationSkipped, 'budget');
  } finally { await s.cleanup(); }
});

test('writer test files never reach the real workspace', async () => {
  const s = await setup({ impls: [GOOD, GOOD] });
  try {
    await run(s);
    assert.equal(s.seen.length, 1);
    assert.equal(s.seen[0].includes('check.mjs'), false);
    assert.equal(s.seen[0].includes('impl.mjs'), true);
  } finally { await s.cleanup(); }
});

test('unknown cost fails closed as cost_unknown', async () => {
  const s = await setup({ impls: [GOOD, GOOD] });
  try {
    const claude = async args => (args.system === V6_WRITER_SYSTEM_PROMPT ? s.claude(args) : { costUsd: null, text: '' });
    const row = await run(s, { claude });
    assert.equal(row.status, 'cost_unknown');
    assert.equal(row.costKnown, false);
    assert.equal(row.finalPass, false);
  } finally { await s.cleanup(); }
});

test('zero budget is refused and still writes one row', async () => {
  const s = await setup();
  try {
    const row = await run(s, { budgetUsd: 0 });
    assert.equal(row.status, 'refused');
    const lines = (await readFile(s.out, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(s.calls.length, 0);
  } finally { await s.cleanup(); }
});

test('global ledger reserves every call and refuses when the cap is too small', async () => {
  const s = await setup({ impls: [GOOD, GOOD] });
  try {
    const ledger = openLedger({ file: join(s.root, 'ledger.jsonl'), globalCapUsd: 0.01 });
    const row = await run(s, { ledger });
    assert.equal(row.status, 'global_cap_refused');
    assert.equal(s.calls.length, 0);
  } finally { await s.cleanup(); }
});

test('runBench refuses v6 with the oracle gate', async () => {
  const s = await setup();
  try {
    await assert.rejects(runBench({ items: [], arm: 'v6', gate: 'oracle', globalCapUsd: 1, results: join(s.root, 'r.jsonl'), provider: {} }), /requires --gate=self/);
    assert.equal(existsSync(join(s.root, 'r.jsonl')), false);
  } finally { await s.cleanup(); }
});
