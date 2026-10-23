import { appendFile, cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { armTiers } from './v4-config.mjs';
import { V4Error } from './v4-escalation.mjs';
import { runProcess } from './v4-claude.mjs';
import { parseSelfTest, testsRan } from './v4-selfsignal.mjs';
import { guardAttempt } from './v4-ledger.mjs';
import { STATUS_BY_CODE } from './v4-runner.mjs';
import { defaultClaude, materialize, copyRels } from './v6-arm.mjs';
import { parseTestbugs } from './v7-arm.mjs';

// v8: test ladder. Haiku codes and self-tests; each passed level hands the code to a stronger test writer (Sonnet, then Opus).
// Haiku fixes every failure (deciding test vs code), up to 2 rounds per level; a level that stays red ships the last code that passed the level below.
// Writers see the task only, never the code, so their tests can't inherit the coder's misreading. The hidden verdict is logged per check, never read.
export const V8_LEVELS = ['self', 'sonnet', 'opus'];
const V8_FIXES = 2;
export const V8_CODER_SYSTEM_PROMPT = 'You are a coding agent. Solve the task in the current directory with a minimal correct change. Write your own test as the task says, run it, and fix until it passes. Do not explore beyond the files you need. Be terse. End your reply with one final line `SELFTEST: <command>`.';
export const V8_FIX_SYSTEM_PROMPT = 'You are a coding agent fixing a failing check. First decide whether the test or the code is wrong, by the task text. Fix the code if it is wrong. Test files from earlier checks, including your own, are locked: edit one only if your reply also has `TESTBUG: <file>: <reason citing the task text>`; untagged edits are discarded. Be terse. End your reply with one final line `SELFTEST: <command>` for your own test.';
// Writers get no tools and one turn (tool-using writers cost $0.05-0.10 per call on r27, ~90% of a task): the file comes back in the reply.
// Opus is the last and priciest rung: a handful of targeted tests.
export const v8WriterSystem = level => `You write tests only, from the task text alone; you cannot see or run any code. Write one test file with ${level === 'opus' ? 'at most 6 tests on the edge cases and error modes a typical implementation gets wrong' : 'at most 10 tests: the stated examples first, then boundaries, empty input and error cases'}, using the project's test runner so the output shows a pass count. Output is billed: no comments, no helpers beyond what the runner needs. Name it with \`${level}\` in the file name next to the stub (e.g. two_bucket.${level}.spec.js, ${level}_test.go). Reply with exactly: a line \`FILE: <relative path>\`, the file in one fenced code block, then a final line \`SELFTEST: <command>\`. No other text.`;

// FILE: <path> followed by a fenced block. Relative paths inside the workspace only.
export function parseWriterFile(text = '') {
  const m = /^FILE:\s*(\S+)\s*\n+```[^\n]*\n([\s\S]*?)\n```/m.exec(String(text));
  if (!m || m[1].startsWith('/') || m[1].split('/').includes('..')) return null;
  return { rel: m[1], body: `${m[2]}\n` };
}

export function v8DefaultBudget(tiers) {
  const [cheap, sonnet, opus] = tiers;
  return (1 + V8_FIXES * 3) * cheap.costEstimateUsd + sonnet.costEstimateUsd + opus.costEstimateUsd;
}

async function runCmd(cmd, cwd) {
  if (!cmd) return { ok: false, tail: 'no SELFTEST command' };
  const out = await runProcess('/bin/sh', ['-c', `${cmd} 2>&1`], { cwd, timeoutMs: 120_000 });
  const text = String(out.stdout ?? '');
  const ok = !out.timedOut && out.code === 0 && testsRan(text);
  return { ok, tail: ok || testsRan(text) ? text.slice(-1500) : `${text.slice(-1300)}\nno runner summary with >=1 test` };
}

const fixPrompt = (task, failures) => `${task}\n\nA check failed. Failures (last 1500 chars each):\n${failures.join('\n---\n')}`;

// Same contract as runV7Task: appends one row to `out` and never throws.
export async function runV8Task({ task, budgetUsd, out, bin, timeoutMs, tiers = armTiers('v8'), verify, ledger: globalLedger, meta = {}, claude = defaultClaude({ bin, timeoutMs }) }) {
  const ledger = { spentUsd: 0, costKnown: true };
  const base = { ...meta, task: task.id, variant: 'v8', budgetUsd };
  const [cheap, ...writers] = tiers;
  const original = task.workspaceDir;
  const scratch = [];
  const s = { calls: [], stageCosts: {}, checks: [], testbugClaims: [], promoted: false, shippedLevel: null, finalPass: false };
  let row;
  const raw = async ({ role, model, effort, prompt, workspace, tools, system, maxTurns }) => {
    const r = await claude({ model, effort, prompt, workspace, tools, system, maxTurns, remainingBudgetUsd: budgetUsd - ledger.spentUsd });
    const cost = Number.isFinite(r?.costUsd) ? r.costUsd : null;
    s.calls.push({ role, model, costUsd: cost, numTurns: r?.numTurns ?? null });
    if (cost === null) { ledger.costKnown = false; return { costUsd: null, text: '' }; }
    ledger.spentUsd += cost;
    return { costUsd: cost, text: String(r.text ?? '') };
  };
  const reserved = globalLedger ? guardAttempt(globalLedger, tiers, raw) : raw;
  const call = async (tier, args) => {
    const r = await reserved({ tier: tier.name, model: tier.model, effort: tier.effort ?? null, tools: tier.tools, maxTurns: 12, ...args });
    if (!Number.isFinite(r.costUsd)) throw new V4Error('COST_UNKNOWN');
    s.stageCosts[args.role] = (s.stageCosts[args.role] ?? 0) + r.costUsd;
    return r;
  };
  const fits = tier => ledger.spentUsd + tier.costEstimateUsd <= budgetUsd;
  const emptyDir = async tag => { const dir = await realpath(await mkdtemp(join(tmpdir(), `v8-${task.id}-${tag}-`))); scratch.push(dir); return dir; };
  const copyOf = async (tag, from) => { const dir = await emptyDir(tag); await cp(from, dir, { recursive: true, verbatimSymlinks: true }); return dir; };
  const testsDir = await emptyDir('tests');
  const suites = []; // { level, cmd, rels } from the writers, in ladder order
  const writerRels = () => new Set(suites.flatMap(t => t.rels));

  // Check = Haiku's own SELFTEST in its workspace, plus every writer suite so far in a copy of it (earlier levels must stay green).
  const check = async (level, attempt, ws, selfCmd) => {
    const failures = [];
    if (!suites.length) {
      const own = await runCmd(selfCmd, ws);
      if (!own.ok) failures.push(`your own SELFTEST (${selfCmd ?? 'none'}): ${own.tail}`);
    }
    if (suites.length) {
      const gate = await copyOf(`gate-${level}${attempt}`, ws);
      await copyRels(testsDir, gate, [...writerRels()]);
      for (const t of suites) {
        const r = await runCmd(t.cmd, gate);
        if (!r.ok) failures.push(`${t.level} tests (${t.cmd}): ${r.tail}`);
      }
    }
    const code = await emptyDir(`code-${level}${attempt}`);
    await materialize(code, original, ws, writerRels());
    const hidden = (await verify(code)) === true;
    s.checks.push({ level, attempt, pass: failures.length === 0, hidden, failed: failures.map(f => f.split(' ')[0]) });
    return { pass: failures.length === 0, failures, code };
  };

  try {
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new V4Error('BUDGET_REQUIRED');
    const ws = await copyOf('ws', original);
    let selfCmd = parseSelfTest((await call(cheap, { role: 'coder', prompt: task.prompt, workspace: ws, system: V8_CODER_SYSTEM_PROMPT })).text);
    let shipped = null; // code dir of the last level that passed
    for (const [i, level] of V8_LEVELS.entries()) {
      if (i > 0) {
        const tier = writers[i - 1];
        if (!fits(tier)) { s.skipped = level; break; }
        const dir = await emptyDir(`w-${level}`);
        const w = await call(tier, { role: `write-${level}`, prompt: `${task.prompt}\n\nWrite the tests only; do not implement.`, workspace: dir, tools: [], system: v8WriterSystem(level), maxTurns: 1 });
        const file = parseWriterFile(w.text);
        if (file && !existsSync(join(original, file.rel))) {
          await mkdir(join(testsDir, file.rel, '..'), { recursive: true });
          await writeFile(join(testsDir, file.rel), file.body);
        }
        // A malformed reply or a path that would overwrite a task file gives a suite with no files; its check fails and Haiku sees why.
        suites.push({ level, cmd: parseSelfTest(w.text), rels: file && !existsSync(join(original, file.rel)) ? [file.rel] : [] });
      }
      let g = await check(level, 0, ws, selfCmd);
      for (let a = 1; !g.pass && a <= V8_FIXES && fits(cheap); a++) {
        await copyRels(testsDir, ws, [...writerRels()]);
        const r = await call(cheap, { role: `fix-${level}`, prompt: fixPrompt(task.prompt, g.failures), workspace: ws, system: V8_FIX_SYSTEM_PROMPT });
        selfCmd = parseSelfTest(r.text) ?? selfCmd;
        const claims = parseTestbugs(r.text);
        for (const rel of writerRels()) {
          const now = await readFile(join(ws, rel), 'utf8').catch(() => null); // null = fixer deleted it
          if (now === (await readFile(join(testsDir, rel), 'utf8'))) continue;
          const claim = claims.find(c => c.file === rel);
          s.testbugClaims.push({ level, attempt: a, file: rel, reason: claim?.reason ?? null, applied: Boolean(claim && now !== null) });
          if (claim && now !== null) await copyRels(ws, testsDir, [rel]);
        }
        g = await check(level, a, ws, selfCmd);
      }
      if (!g.pass) break;
      shipped = { level, code: g.code };
      // Freeze Haiku's passing self-test: r27 alphametics had correct code bent to fit a wrong Sonnet test. Bending now also breaks this anchor.
      if (level === 'self') {
        const rels = (await readdir(ws, { withFileTypes: true })).filter(e => e.isFile() && /^selftest/.test(e.name) && !existsSync(join(original, e.name))).map(e => e.name); // java_all-your-base had a selftest/ dir: EISDIR
        await copyRels(ws, testsDir, rels);
        suites.push({ level: 'self', cmd: selfCmd, rels });
      }
    }
    s.promoted = shipped?.level === V8_LEVELS.at(-1);
    s.shippedLevel = shipped?.level ?? null;
    // Nothing passed even the self level: ship Haiku's last attempt anyway (graded like every other arm).
    s.finalPass = shipped ? s.checks.filter(c => c.level === shipped.level && c.pass).at(-1).hidden : s.checks.at(-1).hidden;
    row = { ...base, status: 'completed', ...s, costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } catch (error) {
    const code = error instanceof V4Error ? error.code : undefined;
    row = { ...base, ...s, status: STATUS_BY_CODE[code] ?? 'harness_error', error: String(error?.message ?? error).slice(0, 200), costUsd: ledger.spentUsd, costKnown: ledger.costKnown };
  } finally {
    await mkdir(join(out, '..'), { recursive: true });
    await appendFile(out, JSON.stringify(row) + '\n');
    for (const dir of scratch) await rm(dir, { recursive: true, force: true });
  }
  return row;
}
