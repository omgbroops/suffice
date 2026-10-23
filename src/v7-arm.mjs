import { appendFile, cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { armTiers, effortFor } from './v4-config.mjs';
import { V4Error } from './v4-escalation.mjs';
import { runProcess } from './v4-claude.mjs';
import { changedPaths, parseSelfTest, testsRan } from './v4-selfsignal.mjs';
import { guardAttempt } from './v4-ledger.mjs';
import { STATUS_BY_CODE } from './v4-runner.mjs';
import { V6_WRITER_SYSTEM_PROMPT, V6_WRITER_TOOLS, V6_PLANNER_SYSTEM_PROMPT, V6_PLANNER_TOOLS, V6_PLANNER_TURNS, V6_EXEC_SYSTEM_PROMPT, V6_EXEC_TURNS,
  defaultClaude, fileTree, planFileBlock, materialize, copyRels } from './v6-arm.mjs';

// v7: test-first pipeline with per-stage scoring (docs/V7-PIPELINE.md). Stages: plan, blind, coder, probe, sblind, review.
// Gate = every test stage's cmd exits 0 with a runner summary (>=1 test) AND review PASS. Failed gate: 2 cheap fix rounds, then 1 top round.
// The hidden verdict is taken at every checkpoint for logging only; no decision reads it.
export const V7_STAGES = ['plan', 'blind', 'coder', 'probe', 'sblind', 'review'];
export const V7_TEST_STAGES = ['blind', 'probe', 'sblind'];
// r27 (reports/v7/OVERNIGHT.md): sblind and review caught nothing blind+probe missed at 70% of spend, so they are off by default.
export const V7_DEFAULT_STAGES = ['plan', 'blind', 'coder', 'probe'];
const BUILD_JUNK = /(^|\/)(node_modules|build|target|dist|out|bin|\.gradle|__pycache__|\.pytest_cache|CMakeFiles)(\/|$)|\.(o|class|pyc)$/;
// Haiku ran out of 6 turns mid-task in r27 run 1 (PROVIDER_ERROR); 12 leaves room to write, run and fix.
const V7_EXEC_TURNS = 12;
const V7_RESCUE_TURNS = 30;
export const V7_REVIEW_SYSTEM_PROMPT = 'You review a code change. Read only: do not edit or run anything. Check the code in the current directory against the task. Reply with at most 5 concrete defects (file and what is wrong), then a last line `VERDICT: PASS` or `VERDICT: FAIL`.';
export const V7_PROBE_SYSTEM_PROMPT = 'You attack a finished implementation. Do not edit any existing file. Read the code, then write one test file aimed at its weakest spots: boundaries, empty input, error paths and the exact formats the task states. Name it with the infix `.probe.` before the extension. Run it once. End your reply with one final line `SELFTEST: <command>`.';
export const V7_FIX_SYSTEM_PROMPT = `${V6_EXEC_SYSTEM_PROMPT} A test may be wrong. You may edit a test file only if your reply also has \`TESTBUG: <file>: <reason citing the task text>\`; untagged test edits are discarded.`;

// Test writers (blind, sblind) get the v6 writer prompt plus a per-stage file infix so files from different stages never clash.
export const testSystem = stage => `${V6_WRITER_SYSTEM_PROMPT} Name your test file with the infix \`.${stage}.\` before the extension, e.g. check.${stage}.mjs.`;

// Stage list from --v7-stages. coder is required: nothing else produces code.
export function parseV7Stages(text) {
  const names = String(text ?? V7_DEFAULT_STAGES.join(',')).split(',').map(x => x.trim()).filter(Boolean);
  const bad = names.filter(n => !V7_STAGES.includes(n));
  if (bad.length) throw new Error(`unknown v7 stage: ${bad.join(', ')}`);
  if (!names.includes('coder')) throw new Error('--v7-stages must include coder');
  return new Set(names);
}

// Budget at estimates: cheap calls = plan, blind, probe, coder, 2 fix rounds; top calls = sblind, one review per checkpoint (up to 4), one top fix.
export function v7DefaultBudget(tiers, stages = new Set(V7_DEFAULT_STAGES)) {
  const [cheap, top] = tiers;
  const on = s => (stages.has(s) ? 1 : 0);
  const cheapCalls = on('plan') + on('blind') + on('probe') + 1 + 2;
  const topCalls = on('sblind') + on('review') * 4 + 1;
  return cheapCalls * cheap.costEstimateUsd + topCalls * top.costEstimateUsd;
}

// Exit 0 and a runner summary with >=1 test. A clean exit with no summary is a fail: that is how 0-test runs passed before.
async function runCmd(cmd, cwd) {
  const out = await runProcess('/bin/sh', ['-c', `${cmd} 2>&1`], { cwd, timeoutMs: 120_000 });
  const text = String(out.stdout ?? '');
  return { ok: !out.timedOut && out.code === 0 && testsRan(text), tail: text.slice(-1500) };
}

// Last VERDICT line wins; a missing verdict counts as FAIL.
export function parseVerdict(text = '') {
  const v = [...String(text).matchAll(/^VERDICT:\s*(PASS|FAIL)\b/gm)].map(m => m[1]).at(-1);
  return v === 'PASS';
}

// `TESTBUG: <file>: <reason>` lines from a fixer's reply.
export function parseTestbugs(text = '') {
  return [...String(text).matchAll(/^TESTBUG:\s*([^:\n]+?):\s*(.+?)\s*$/gm)].map(m => ({ file: m[1].trim(), reason: m[2] }));
}

const fixPrompt = (task, failures) =>
  `${task}\n\nThe checks failed. Fix the code. Failures (last 1500 chars each):\n${failures.join('\n---\n')}\n\nA test may be wrong: you may edit a test file only if you also write \`TESTBUG: <file>: <reason citing the task text>\`.`;

// Same contract as runV6Task: appends one row to `out` and never throws. Each check is { checkpoint, check, flagged, hiddenPass, costUsd }.
export async function runV7Task({ task, budgetUsd, out, bin, timeoutMs, tiers = armTiers('v7'), verify, ledger: globalLedger, meta = {}, stages = new Set(V7_DEFAULT_STAGES), agree = false, sblindCheap = false, rescue = null, claude = defaultClaude({ bin, timeoutMs }) }) {
  const ledger = { spentUsd: 0, costKnown: true };
  const on = s => stages.has(s);
  const base = { ...meta, task: task.id, variant: 'v7', budgetUsd, stages: [...stages] };
  const [cheap, top] = tiers;
  const original = task.workspaceDir;
  const scratch = [];
  const s = { agree, sblindCheap, rescued: false, planText: null, calls: [], stageCosts: {}, checks: [], gates: [], testbugClaims: [], testRels: [], fixRounds: 0, skipped: [],
    selfFinalPass: false, finalPass: false };
  const tests = new Map(); // stage -> { cmd, rels }
  let row;
  const raw = async ({ role, model, effort, prompt, workspace, tools, system, maxTurns }) => {
    const r = await claude({ model, effort, prompt, workspace, tools, system, maxTurns, remainingBudgetUsd: budgetUsd - ledger.spentUsd });
    const cost = Number.isFinite(r?.costUsd) ? r.costUsd : null;
    s.calls.push({ role, model, costUsd: cost, numTurns: r?.numTurns ?? null, usage: r?.usage ?? null });
    if (cost === null) { ledger.costKnown = false; return { costUsd: null, text: '' }; }
    ledger.spentUsd += cost;
    return { costUsd: cost, text: String(r.text ?? '') };
  };
  const reserved = globalLedger ? guardAttempt(globalLedger, rescue ? [...tiers, rescue] : tiers, raw) : raw;
  // args.role is the stage name. Defaults: the tier's effort and tools, the exec system prompt. Callers override per stage.
  const call = async (tier, args) => {
    const r = await reserved({ tier: tier.name, model: tier.model, effort: effortFor(tier, 1), tools: tier.tools, maxTurns: V7_EXEC_TURNS, system: V6_EXEC_SYSTEM_PROMPT, ...args });
    if (!Number.isFinite(r.costUsd)) throw new V4Error('COST_UNKNOWN');
    s.stageCosts[args.role] = (s.stageCosts[args.role] ?? 0) + r.costUsd;
    return r;
  };
  const fits = tier => ledger.spentUsd + tier.costEstimateUsd <= budgetUsd;
  const skip = stage => { s.skipped.push(stage); };
  const emptyDir = async tag => { const dir = await realpath(await mkdtemp(join(tmpdir(), `v7-${task.id}-${tag}-`))); scratch.push(dir); return dir; };
  const copyOf = async (tag, from) => { const dir = await emptyDir(tag); await cp(from, dir, { recursive: true, verbatimSymlinks: true }); return dir; };
  // New files only: test stages may not change existing code (the probe's "no source edits" rule).
  // New files only, expanded out of new dirs; build output is not a test (EISDIR on java/python r27 run 1).
  const newFiles = async (base, dir) => {
    const files = [];
    for (const r of (await changedPaths(base, dir)).filter(r => !existsSync(join(base, r)))) {
      const st = await lstat(join(dir, r));
      if (st.isFile()) files.push(r);
      else if (st.isDirectory()) for (const f of await readdir(join(dir, r), { recursive: true, withFileTypes: true })) if (f.isFile()) files.push(relative(dir, join(f.parentPath, f.name)));
    }
    return files.filter(r => !BUILD_JUNK.test(r));
  };
  const record = (checkpoint, check, flagged, hiddenPass, costUsd = 0) => s.checks.push({ checkpoint, check, flagged, hiddenPass, costUsd });
  const testsDir = await emptyDir('tests');

  // Checkpoint: hidden verdict on the clean code (logging only), then every enabled check in a gate copy with all test files.
  const checkpoint = async (name, code) => {
    const hidden = (await verify(code)) === true;
    const gate = await copyOf(`gate-${name}`, code);
    await copyRels(testsDir, gate, s.testRels);
    const failures = [];
    const testStages = V7_TEST_STAGES.filter(on);
    for (const stage of testStages) {
      const t = tests.get(stage);
      const r = t?.cmd ? await runCmd(t.cmd, gate) : { ok: false, tail: 'no test file or no SELFTEST command' };
      if (!r.ok) failures.push(`${stage}: ${r.tail}`);
      record(name, stage, !r.ok, hidden, name === 'coder' ? (s.stageCosts[stage] ?? 0) : 0);
    }
    // Agreement gate (opt-in, --v7-agree=on): with 2+ writers the tests block only when at least 2 suites fail.
    // Off by default: on r27 it scored 15/27 vs 17 strict; both Haiku suites share the plan and fail correct code together. shortcut: counts failing suites, not the same behavior; upgrade with test-name matching.
    let pass = failures.length < (agree && testStages.length >= 2 ? 2 : 1);
    let review = '';
    if (on('review') && fits(top)) {
      const rv = await call(top, { role: 'review', tools: ['Read'], system: V7_REVIEW_SYSTEM_PROMPT, workspace: gate, prompt: `Task:\n${task.prompt}` });
      const ok = parseVerdict(rv.text);
      review = rv.text;
      pass &&= ok;
      if (!ok) failures.push(`review:\n${rv.text.slice(-1500)}`);
      record(name, 'review', !ok, hidden, rv.costUsd);
    } else if (on('review')) {
      skip('review');
      pass = false;
      failures.push('review: not run (budget)');
      record(name, 'review', true, hidden, 0);
    }
    s.gates.push({ checkpoint: name, pass });
    return { pass, hidden, failures, review };
  };

  try {
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new V4Error('BUDGET_REQUIRED');
    if (!on('coder')) throw new Error('coder stage is required');

    // 1. Planner (read-only), once per task. Its plan and the named files reach blind, coder and probe.
    let prompt = task.prompt;
    if (on('plan') && fits(cheap)) {
      const tree = await fileTree(original);
      const p = await call(cheap, { role: 'plan', effort: null, tools: V6_PLANNER_TOOLS, maxTurns: V6_PLANNER_TURNS, system: V6_PLANNER_SYSTEM_PROMPT,
        workspace: await copyOf('plan', original), prompt: `${task.prompt}\n\nFile tree (paths only):\n${tree.join('\n')}` });
      s.planText = p.text.trim().slice(0, 1800);
      const files = await planFileBlock(original, s.planText, tree);
      prompt = `${task.prompt}\n\nPlan:\n${s.planText}${files ? `\n\nFiles named in the plan:\n${files}` : ''}`;
    } else if (on('plan')) skip('plan');

    // 2. Blind test writer (task + plan, no solution). Its new files are the tests.
    const addTests = async (stage, base, dir, text) => {
      const rels = await newFiles(base, dir);
      await copyRels(dir, testsDir, rels);
      tests.set(stage, { cmd: parseSelfTest(text), rels });
      s.testRels = [...new Set([...s.testRels, ...rels])];
    };
    if (on('blind') && fits(cheap)) {
      const dir = await copyOf('blind', original);
      const w = await call(cheap, { role: 'blind', prompt: `${prompt}\n\nWrite the tests only; do not implement.`, workspace: dir, tools: V6_WRITER_TOOLS, system: testSystem('blind') });
      await addTests('blind', original, dir, w.text);
    } else if (on('blind')) skip('blind');

    // 3. Coder (task + plan, test file A present). Code is what the coder changed, minus test files.
    const coderWs = await copyOf('coder', original);
    await copyRels(testsDir, coderWs, s.testRels);
    if (fits(cheap)) await call(cheap, { role: 'coder', prompt, workspace: coderWs, tools: cheap.tools, system: V6_EXEC_SYSTEM_PROMPT });
    else skip('coder');
    let code = await emptyDir('code');
    await materialize(code, original, coderWs, new Set(s.testRels));

    // 4. Probe (fresh chat, task + code, no source edits) and sblind (Sonnet, task only).
    if (on('probe') && fits(cheap)) {
      const dir = await copyOf('probe', code);
      const p = await call(cheap, { role: 'probe', prompt: `${prompt}\n\nWrite the test file only; do not edit existing files.`, workspace: dir, tools: V6_WRITER_TOOLS, system: V7_PROBE_SYSTEM_PROMPT });
      await addTests('probe', code, dir, p.text);
    } else if (on('probe')) skip('probe');
    // sblindCheap: a task-only Haiku writer, independent of the plan and code that blind and the coder share.
    const sTier = sblindCheap ? cheap : top;
    if (on('sblind') && fits(sTier)) {
      const dir = await copyOf('sblind', original);
      const sb = await call(sTier, { role: 'sblind', prompt: `${task.prompt}\n\nWrite the tests only; do not implement.`, workspace: dir, tools: V6_WRITER_TOOLS, system: testSystem('sblind') });
      await addTests('sblind', original, dir, sb.text);
    } else if (on('sblind')) skip('sblind');

    // 5. Checkpoints: coder, then fix rounds (2 cheap, 1 top) while the gate fails. The gate re-runs at each checkpoint.
    let g = await checkpoint('coder', code);
    // With rescue on, one cheap fix round only: later rounds cost most of the fix spend and Opus covers what they would catch.
    for (const [name, tier] of rescue ? [['fix1', cheap]] : [['fix1', cheap], ['fix2', cheap], ['fix3', top]]) {
      if (g.pass) break;
      if (!fits(tier)) { skip(name); break; }
      const dir = await copyOf(name, code);
      await copyRels(testsDir, dir, s.testRels);
      const r = await call(tier, { role: 'fix', prompt: fixPrompt(task.prompt, g.failures), workspace: dir, tools: tier.tools, system: V7_FIX_SYSTEM_PROMPT });
      const claims = parseTestbugs(r.text);
      for (const rel of s.testRels) {
        const edited = (await readFile(join(dir, rel), 'utf8').catch(() => null)) !== (await readFile(join(testsDir, rel), 'utf8')); // null = fixer deleted it
        if (!edited) continue;
        const claim = claims.find(c => c.file === rel);
        s.testbugClaims.push({ checkpoint: name, file: rel, reason: claim?.reason ?? null, applied: Boolean(claim) });
        if (claim && existsSync(join(dir, rel))) await copyRels(dir, testsDir, [rel]); // a deleted test is never accepted, only fixed
      }
      const next = await emptyDir(`code-${name}`);
      await materialize(next, original, dir, new Set(s.testRels));
      code = next;
      s.fixRounds += 1;
      g = await checkpoint(name, code);
    }
    // Rescue (opt-in, --v7-rescue=opus): if the gate still fails, the top model solves from the original workspace with the task only.
    // Its code ships without our tests: on r27 they flag correct code ~80% of the time, so they can't veto a stronger model.
    if (!g.pass && rescue && fits(rescue)) {
      const dir = await copyOf('rescue', original);
      await call(rescue, { role: 'rescue', prompt: task.prompt, workspace: dir, tools: rescue.tools, effort: null, maxTurns: V7_RESCUE_TURNS });
      code = await emptyDir('code-rescue');
      await materialize(code, original, dir, new Set());
      s.rescued = true;
      g = { pass: true, hidden: (await verify(code)) === true };
      s.checks.push({ checkpoint: 'rescue', check: 'none', flagged: false, hiddenPass: g.hidden, costUsd: s.stageCosts.rescue ?? 0 });
    } else if (!g.pass && rescue) skip('rescue');
    s.selfFinalPass = g.pass;
    s.finalPass = g.hidden;
    row = { ...base, status: 'completed', ...s, costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } catch (error) {
    const code = error instanceof V4Error ? error.code : undefined;
    row = { ...base, ...s, status: STATUS_BY_CODE[code] ?? 'harness_error', error: String(error?.message ?? error).slice(0, 200),
      costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } finally {
    await mkdir(join(out, '..'), { recursive: true });
    await appendFile(out, JSON.stringify(row) + '\n');
    for (const dir of scratch) await rm(dir, { recursive: true, force: true });
  }
  return row;
}
