import { appendFile, cp, mkdir, mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { armTiers, effortFor } from './v4-config.mjs';
import { V4Error } from './v4-escalation.mjs';
import { makeClaudeAdapter, runProcess } from './v4-claude.mjs';
import { changedPaths, parseSelfTest } from './v4-selfsignal.mjs';
import { guardAttempt } from './v4-ledger.mjs';
import { STATUS_BY_CODE } from './v4-runner.mjs';

// v6: plan-then-execute. One cheap planner (read-only, file tree + task) writes a plan once; the blind test writer and K cheap candidates
// get the task, the plan and the full files the plan names. Candidates are picked by writer-test pass count (ties: lower cost), then one cheap
// repair and one top-rung escalation, each only if the writer's cmd still fails. The hidden verdict is taken on the real workspace after the
// picked candidate's edits are copied in (firstAttemptPass), and again after any repair. Every claude call is recorded in row.calls.
export const V6_WRITER_SYSTEM_PROMPT = 'You write tests only. Do not implement the task and do not edit any existing source or stub file. From the task text, write one independent test file covering the spec: boundaries, empty input, error cases, and the exact formats the text states. Use the repo\'s test runner if it has one, otherwise a plain script. Do not explore with ls, cat or find. Run it once. End your reply with one final line `SELFTEST: <command>` naming the command that runs your test file.';
export const V6_WRITER_TOOLS = ['Read', 'Write', 'Bash'];
export const V6_PLANNER_SYSTEM_PROMPT = 'You plan a code change. Do not edit files or run commands. Read only the files you need, with line ranges. Reply with a plan of at most 300 words: the files and functions to change, edge cases, and the exact formats the task states. No preamble.';
export const V6_PLANNER_TOOLS = ['Read'];
export const V6_PLANNER_TURNS = 3;
export const V6_EXEC_SYSTEM_PROMPT = 'You are a coding agent. Make the requested change with a minimal correct edit in the current directory, following the plan. Do not explore: never run ls, cat, find or grep, and do not create scratch or temp dirs. Edit in place with Edit; never rewrite a whole file. Run only the SELFTEST command. Be terse: no explanations. Use only Read, Edit and Bash. End your reply with one final line `SELFTEST: <command>` naming the command you ran, or `SELFTEST: none`.';
export const V6_EXEC_TURNS = 6;
export const V6_K_DEFAULT = 2;
export const V6_PLAN_FILES_TOKENS = 4000;
const TREE_SKIP = new Set(['node_modules', 'build', 'dist', 'target', 'out', 'coverage', '__pycache__', 'vendor']);

// Budget for one run at estimates: planner (when on) + writer + K candidates + one cheap repair + one top-rung escalation.
export function v6DefaultBudget(tiers, k = V6_K_DEFAULT, plan = true) {
  const [cheap, top] = tiers;
  return (k + 2 + (plan ? 1 : 0)) * cheap.costEstimateUsd + top.costEstimateUsd;
}

export const v6RepairPrompt = (cmd, tail) =>
  `The tests failed: ${cmd}\n\nTest output (last 1500 chars):\n${String(tail).slice(-1500)}\n\nThe test may be wrong; fix test or code.`;

// Runs the writer's command in cwd. Passed count is the runner's own summary (TAP "# pass N" or "N passed"); without one, a clean exit counts as one pass.
// shortcut: the summary regexes cover node TAP and pytest/jest/cargo-style lines only, upgrade per runner if a suite prints otherwise.
export async function runWriterCmd(cmd, cwd) {
  const out = await runProcess('/bin/sh', ['-c', `${cmd} 2>&1`], { cwd, timeoutMs: 60_000 });
  const text = String(out.stdout ?? '');
  const all = !out.timedOut && out.code === 0;
  const counted = /# pass (\d+)/.exec(text) ?? /(\d+) passed/.exec(text);
  return { all, passed: counted ? Number(counted[1]) : (all ? 1 : 0), tail: text.slice(-1500) };
}

// Default model call: one fresh claude session per call (no --resume across workspaces). Returns { costUsd, text, numTurns, usage }.
export function defaultClaude({ bin, timeoutMs } = {}) {
  return ({ model, effort, prompt, workspace, tools, system, maxTurns, remainingBudgetUsd }) =>
    makeClaudeAdapter({ bin, timeoutMs, lean: true, systemPrompt: system })({ model, effort, prompt, workspace, tools, maxTurns, remainingBudgetUsd });
}

// Paths only, depth <= 3; skips dot entries, node_modules and build dirs. Sorted, capped.
export async function fileTree(dir, { depth = 3, cap = 400 } = {}) {
  const out = [];
  const walk = async (rel, d) => {
    const entries = (await readdir(join(dir, rel), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= cap) return;
      if (e.name.startsWith('.') || TREE_SKIP.has(e.name)) continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && d < depth) await walk(p, d + 1);
      else if (e.isFile()) out.push(p);
    }
  };
  await walk('', 1);
  return out;
}

// Full contents of tree files the plan names, capped at maxTokens (about 4 chars per token). Exact path match.
// shortcut: a plain substring match can pull in an extra file that shares a name suffix, bounded by the token cap.
export async function planFileBlock(dir, plan, tree, maxTokens = V6_PLAN_FILES_TOKENS) {
  let room = maxTokens * 4;
  const parts = [];
  for (const p of tree.filter(p => plan.includes(p))) {
    if (room <= 0) break;
    const block = `--- ${p}\n${await readFile(join(dir, p), 'utf8')}`.slice(0, room);
    parts.push(block);
    room -= block.length;
  }
  return parts.join('\n\n');
}

// Real workspace = pristine task copy + the picked candidate's changed files, minus the writer's test files.
async function materialize(target, original, source, exclude) {
  await rm(target, { recursive: true, force: true });
  await cp(original, target, { recursive: true, verbatimSymlinks: true });
  for (const rel of await changedPaths(original, source)) {
    if (exclude.has(rel)) continue;
    const from = join(source, rel), to = join(target, rel);
    if (existsSync(from)) { await mkdir(dirname(to), { recursive: true }); await cp(from, to, { recursive: true, verbatimSymlinks: true, force: true }); }
    else await rm(to, { recursive: true, force: true });
  }
}

async function copyRels(from, to, rels) {
  for (const rel of rels) { await mkdir(dirname(join(to, rel)), { recursive: true }); await cp(join(from, rel), join(to, rel), { recursive: true, verbatimSymlinks: true, force: true }); }
}

// Same contract as runV4Task: appends one row to `out` and never throws. claude({ model, effort, prompt, workspace, tools, system, maxTurns, remainingBudgetUsd }) -> { costUsd, text, numTurns, usage }.
// Unknown cost fails closed (COST_UNKNOWN). Every call reserves its tier estimate in `ledger` when given.
export async function runV6Task({ task, budgetUsd, out, bin, timeoutMs, tiers = armTiers('v6'), verify, ledger: globalLedger, meta = {}, k = V6_K_DEFAULT, plan = true, claude = defaultClaude({ bin, timeoutMs }) }) {
  const ledger = { spentUsd: 0, costKnown: true };
  const base = { ...meta, task: task.id, variant: 'v6', budgetUsd, k, plan };
  const [cheap, top] = tiers;
  const original = task.workspaceDir;
  const scratch = [];
  const s = { planText: null, calls: [], writerCost: null, writerCmd: null, candidateCosts: [], pickedIndex: null, writerPassCounts: [], firstAttemptPass: false,
    repaired: false, escalated: false, escalationSkipped: null, finalPass: false, selfTests: [] };
  let row;
  const raw = async ({ role, model, effort, prompt, workspace, tools, system, maxTurns }) => {
    const r = await claude({ model, effort, prompt, workspace, tools, system, maxTurns, remainingBudgetUsd: budgetUsd - ledger.spentUsd });
    const cost = Number.isFinite(r?.costUsd) ? r.costUsd : null;
    s.calls.push({ role, model, costUsd: cost, numTurns: r?.numTurns ?? null, usage: r?.usage ?? null });
    if (cost === null) { ledger.costKnown = false; return { costUsd: null, text: '' }; }
    ledger.spentUsd += cost;
    return { costUsd: cost, text: String(r.text ?? '') };
  };
  const reserved = globalLedger ? guardAttempt(globalLedger, tiers, raw) : raw;
  // Execution defaults: effort from the tier (low), capped turns, the exec system prompt. Callers override per role.
  const call = async (tier, args) => {
    const r = await reserved({ tier: tier.name, model: tier.model, effort: effortFor(tier, 1), tools: tier.tools, maxTurns: V6_EXEC_TURNS, system: V6_EXEC_SYSTEM_PROMPT, ...args });
    if (!Number.isFinite(r.costUsd)) throw new V4Error('COST_UNKNOWN');
    return r;
  };
  const fits = tier => ledger.spentUsd + tier.costEstimateUsd <= budgetUsd;
  const fresh = async tag => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), `v6-${task.id}-${tag}-`)));
    scratch.push(dir);
    await cp(original, dir, { recursive: true, verbatimSymlinks: true });
    return dir;
  };
  try {
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new V4Error('BUDGET_REQUIRED');
    if (!Number.isInteger(k) || k < 1) throw new Error('k must be an integer >= 1');
    const workspace = await fresh('real');

    // 0. Planner, once per task: read-only, sees the task, the bundle and the file tree. Its plan and the named files go to every later call.
    let prompt = task.prompt;
    if (plan && fits(cheap)) {
      const tree = await fileTree(original);
      const p = await call(cheap, { role: 'planner', effort: null, tools: V6_PLANNER_TOOLS, maxTurns: V6_PLANNER_TURNS, system: V6_PLANNER_SYSTEM_PROMPT,
        workspace, prompt: `${task.prompt}\n\nFile tree (paths only):\n${tree.join('\n')}` });
      s.planText = p.text.trim().slice(0, 1800);
      const files = await planFileBlock(original, s.planText, tree);
      prompt = `${task.prompt}\n\nPlan:\n${s.planText}${files ? `\n\nFiles named in the plan:\n${files}` : ''}`;
    }

    // 1. Blind test writer in a scratch copy; its new or changed files are the tests every candidate must face.
    const writerDir = await fresh('writer');
    let writerRels = [];
    if (!fits(cheap)) s.escalationSkipped = 'budget';
    else {
      const w = await call(cheap, { role: 'writer', prompt: `${prompt}\n\nWrite the tests only; do not implement.`, workspace: writerDir, tools: V6_WRITER_TOOLS, system: V6_WRITER_SYSTEM_PROMPT });
      s.writerCost = w.costUsd;
      s.writerCmd = parseSelfTest(w.text);
      writerRels = await changedPaths(original, writerDir);
    }
    const exclude = new Set(writerRels);

    // 2. K candidates, each in its own fresh copy that already holds the writer's tests.
    const cands = [];
    for (let i = 0; i < k && fits(cheap) && s.writerCost !== null; i++) {
      const dir = await fresh(`cand${i}`);
      await copyRels(writerDir, dir, writerRels);
      const c = await call(cheap, { role: 'cand', prompt, workspace: dir, tools: cheap.tools });
      const score = s.writerCmd ? await runWriterCmd(s.writerCmd, dir) : { all: false, passed: 0, tail: '' };
      cands.push({ index: i, dir, costUsd: c.costUsd, ...score });
      s.selfTests.push({ stage: `candidate:${i}`, model: cheap.model, cmd: s.writerCmd, signal: s.writerCmd ? (score.all ? 'pass' : 'fail') : 'unverified', tail: score.tail.slice(-400) });
    }

    // 3. Pick by writer passes, ties to lower cost; hidden verdict before any repair.
    if (!cands.length) { if (!s.escalationSkipped) s.escalationSkipped = 'budget'; }
    else {
      s.candidateCosts = cands.map(c => c.costUsd);
      s.writerPassCounts = cands.map(c => c.passed);
      const best = [...cands].sort((a, b) => b.passed - a.passed || a.costUsd - b.costUsd)[0];
      s.pickedIndex = best.index;
      await materialize(workspace, original, best.dir, exclude);
      s.firstAttemptPass = (await verify(workspace)) === true;
      s.finalPass = s.firstAttemptPass;

      // 4. Repair (cheap), then escalation (top) on the same candidate, each only while the writer's cmd still fails.
      if (s.writerCmd && !best.all) {
        if (!fits(cheap)) s.escalationSkipped = 'budget';
        else {
          s.repaired = true;
          await call(cheap, { role: 'repair', prompt: v6RepairPrompt(s.writerCmd, best.tail), workspace: best.dir, tools: cheap.tools });
          let res = await runWriterCmd(s.writerCmd, best.dir);
          s.selfTests.push({ stage: 'repair', model: cheap.model, cmd: s.writerCmd, signal: res.all ? 'pass' : 'fail', tail: res.tail.slice(-400) });
          if (!res.all) {
            if (!fits(top)) s.escalationSkipped = 'budget';
            else {
              s.escalated = true;
              await call(top, { role: 'escalate', prompt: v6RepairPrompt(s.writerCmd, res.tail), workspace: best.dir, tools: top.tools });
              res = await runWriterCmd(s.writerCmd, best.dir);
              s.selfTests.push({ stage: 'escalate', model: top.model, cmd: s.writerCmd, signal: res.all ? 'pass' : 'fail', tail: res.tail.slice(-400) });
            }
          }
          await materialize(workspace, original, best.dir, exclude);
          s.finalPass = (await verify(workspace)) === true;
        }
      }
    }
    row = { ...base, status: 'completed', ...s, costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } catch (error) {
    const code = error instanceof V4Error ? error.code : undefined;
    row = { ...base, ...s, status: STATUS_BY_CODE[code] ?? 'harness_error', error: String(error?.message ?? error).slice(0, 200),
      costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } finally {
    await mkdir(dirname(out), { recursive: true });
    await appendFile(out, JSON.stringify(row) + '\n');
    for (const dir of scratch) await rm(dir, { recursive: true, force: true });
  }
  return row;
}
