import { execFile } from 'node:child_process';
import { appendFile, cp, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runV4Task, GATES } from '../src/v4-runner.mjs';
import { openLedger } from '../src/v4-ledger.mjs';
import { armTiers } from '../src/v4-config.mjs';
import { readPolyglotDocs } from '../src/v4-docs.mjs';
import { buildBundle, v5Prompt } from '../src/v5-bundle.mjs';
import { runV6Task, v6DefaultBudget } from '../src/v6-arm.mjs';
import { runV7Task, v7DefaultBudget, parseV7Stages } from '../src/v7-arm.mjs';
import { transcriptStore } from '../src/v4-claude.mjs';

const exec = promisify(execFile);
export const MAX_WORKERS = 16;

// macOS prints "System-wide memory free percentage: 85%". Any probe failure resolves as unknown, which the scheduler treats as unsafe.
export async function probeFreePct() {
  const { stdout } = await exec('memory_pressure', []);
  const m = /free percentage:\s*(\d+)%/i.exec(stdout);
  if (!m) throw new Error('memory_pressure: unparsed output');
  return Number(m[1]);
}

// runItem must write its own row (runV4Task does). Only items that never reached it get a row here.
// Once free memory drops below minFreePct (V4_MIN_FREE_PCT, default 30; a local model server needs it lower) or the probe fails, no new item starts; the rest get 'aborted_memory'.
export async function schedule({ items, workers = 2, runItem, probe = probeFreePct, minFreePct = Number(process.env.V4_MIN_FREE_PCT ?? 30), out, write = appendFile }) {
  if (!Number.isInteger(workers) || workers < 1 || workers > MAX_WORKERS) throw new Error(`workers must be 1..${MAX_WORKERS}`);
  const rows = [];
  let next = 0, aborted = false;
  const emit = async row => { rows.push(row); await write(out, JSON.stringify(row) + '\n'); };
  async function lane() {
    while (next < items.length) {
      const item = items[next++];
      if (!aborted) {
        const free = await probe().catch(() => null);
        if (free === null || free < minFreePct) aborted = true;
      }
      if (aborted) { await emit({ task: item.taskId, status: 'aborted_memory' }); continue; }
      try { rows.push(await runItem(item)); } catch (error) {
        await emit({ task: item.taskId, status: 'harness_error', error: String(error?.message ?? error).slice(0, 200) });
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, lane));
  return rows;
}

export function loadManifest(path) {
  const items = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(items) || !items.every(i => typeof i.taskId === 'string')) throw new Error('manifest must be an array of {taskId}');
  return items;
}

// Usage: nice -n 19 node scripts/v4-bench.mjs --manifest=<json> --arm=v4|single:<model> --global-cap-usd=<USD> --results=<new.jsonl> [--workers=2] [--budget-usd=<USD per run>] [--gate=self|oracle] [--v5-top=sonnet|opus] [--v5-cheap=haiku|sonnet] [--v5-strict] [--protocol=pass1|pass2 (polyglot only)]
const FLAGS = ['provider', 'manifest', 'arm', 'workers', 'global-cap-usd', 'results', 'budget-usd', 'gate', 'v5-top', 'v5-cheap', 'v5-strict', 'protocol', 'v6-k', 'v6-plan', 'v7-stages', 'v7-agree', 'v7-sblind'];
export function parseArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    if (arg === '--v5-strict') { opts['v5-strict'] = true; continue; } // boolean: presence only
    const m = /^--([a-z0-9-]+)=(.*)$/.exec(arg); // digits: --v6-k
    if (!m || !FLAGS.includes(m[1])) throw new Error(`unknown argument: ${arg}`);
    opts[m[1]] = m[2];
  }
  return opts;
}

// Append-only results: a second run must start from empty files, so rows and spend never mix.
export function assertFresh(file) {
  if (existsSync(file) && statSync(file).size > 0) throw new Error(`refusing to append: ${file} is not empty`);
}

// Per-run budget default: every round of the arm's ladder at its estimate, so no single run can exceed it.
export function defaultBudgetUsd(tiers) { return tiers.reduce((s, t) => s + t.rounds * t.costEstimateUsd, 0); }

// provider: { prepWorkspace(item) -> {dir, acceptanceCommand, cleanup}, runAcceptance(prep) -> boolean | {pass} }.
// runTask defaults to runV4Task; tests inject stubs. The first global-cap refusal stops the run: later items get 'aborted_cap' rows.
export async function runBench({ items, arm, workers = 3, globalCapUsd, results, budgetUsd, bin, provider, probe, runTask: runTaskOpt, gate = 'self', v5Top, v5Cheap, v5Strict = false, protocol = 'pass1', v6K, v6Plan = 'on', v7Stages, v7Agree = 'off', v7Sblind = 'sonnet' }) {
  if (!['on', 'off'].includes(v6Plan)) throw new Error('--v6-plan must be on|off');
  const v7Set = arm === 'v7' ? parseV7Stages(v7Stages) : undefined;
  if (!GATES.includes(gate)) throw new Error(`--gate must be one of ${GATES.join('|')}`);
  if (!(globalCapUsd > 0)) throw new Error('--global-cap-usd is required and must be > 0');
  if (!results) throw new Error('--results is required');
  // v6 is self-gated and has no pass2 retry: its verdicts come from the writer's tests only.
  if ((arm === 'v6' || arm === 'v7') && (gate !== 'self' || protocol !== 'pass1')) throw new Error(`--arm=${arm} requires --gate=self and --protocol=pass1`);
  const ledgerFile = `${results}.ledger.jsonl`;
  assertFresh(results);
  assertFresh(ledgerFile);
  const runTask = runTaskOpt ?? (arm === 'v6' ? runV6Task : arm === 'v7' ? runV7Task : runV4Task);
  const tiers = armTiers(arm, undefined, { top: v5Top ?? 'sonnet', cheap: v5Cheap ?? 'haiku' });
  // v5 with the self gate uses the v5 escalation rule; oracle runs keep the v4 rule (their rows carry no self fields).
  const rule = arm === 'v5' && gate === 'self' ? 'v5' : 'v4';
  const budget = budgetUsd ?? (arm === 'v6' ? v6DefaultBudget(tiers, v6K, v6Plan === 'on') : arm === 'v7' ? v7DefaultBudget(tiers, v7Set) : defaultBudgetUsd(tiers));
  const ledger = openLedger({ file: ledgerFile, globalCapUsd });
  const emit = row => appendFile(results, JSON.stringify(row) + '\n');
  let capHit = false;
  const runItem = async item => {
    const hiddenOutputs = new Map(); // hidden failure text per verified workspace, for protocol pass2 only
    const meta = { benchmark: item.benchmark ?? 'unknown', difficulty: item.difficulty ?? 'unknown', arm, contaminated: item.contaminated === true };
    if (capHit) return emit({ ...meta, task: item.taskId, status: 'aborted_cap' });
    let prep;
    try { prep = await provider.prepWorkspace(item); } catch (error) {
      return emit({ ...meta, task: item.taskId, status: 'harness_error', error: String(error?.message ?? error).slice(0, 200) });
    }
    try {
      let prompt = item.prompt ?? await defaultPrompt(prep), rowMeta = meta;
      if (arm === 'v5' || arm === 'v6') {
        // Gold files are only compared against the bundle for the report; they never enter the prompt.
        const b = await buildBundle(prep.dir, prompt);
        prompt = v5Prompt(prompt, b);
        rowMeta = { ...meta, localizedFiles: b.files, bundleTokens: b.bundleTokens,
          goldInBundle: Array.isArray(item.goldFiles) ? item.goldFiles.some(g => b.bundledFiles.includes(g)) : null };
      }
      // Training data (FIXLOG #16): full transcripts of verified passes only, kept outside git; failed runs' transcripts are deleted.
      const store = { dir: join(process.env.V4_TRANSCRIPT_DIR ?? join(homedir(), '.cache', 'v4-transcripts'), 'staging', `${arm}-${item.taskId.replace(/\//g, '_')}-${Date.now()}`), files: [] };
      const row = await transcriptStore.run(store, () => runTask({
        task: { id: item.taskId.replace(/\//g, '_'), prompt, workspaceDir: prep.dir, env: prep.env },
        budgetUsd: budget, out: results, bin, tiers, ledger, meta: rowMeta, gate, rule, strict: v5Strict, protocol, k: v6K, plan: v6Plan === 'on', stages: v7Set, agree: v7Agree === 'on', sblindCheap: v7Sblind === 'haiku',
        verifyOutput: ws => hiddenOutputs.get(ws) ?? '',
        verify: async workspace => {
          // Each verdict gets a pristine copy (provider.cloneForVerify, else a dir copy of prep.dir) plus that snapshot's files, so round-1 leftovers cannot reach the final verdict.
          const clone = provider.cloneForVerify ? await provider.cloneForVerify(prep) : await dirClone(prep.dir);
          try {
            await cp(workspace, clone.dir, { recursive: true, force: true, verbatimSymlinks: true, filter: overlaySymlinkFilter });
            const r = await provider.runAcceptance({ ...prep, ...clone });
            await saveFailure(arm, item.taskId, r);
            hiddenOutputs.set(workspace, r?.output ?? '');
            return r === true || r?.pass === true;
          } finally { await clone.cleanup(); }
        },
      }));
      await keepPassTranscripts(store, row, arm, item.taskId);
      if (row.status === 'global_cap_refused') capHit = true;
      return row;
    } finally { await prep.cleanup?.(); }
  };
  return schedule({ items, workers, runItem, probe, out: results });
}

// Keeps why each verdict failed (kind + output tail) per arm/task; polyglot results rows only hold pass/fail.
// cp resolves an existing dest symlink (EINVAL/ENOENT); drop it first. rm never follows the link.
export async function overlaySymlinkFilter(src, dest) {
  if (/^selftest/i.test(basename(src))) return false; // agent's own tests stay re-runnable in the workspace but never reach grading
  if ((await lstat(src)).isSymbolicLink()) await rm(dest, { force: true });
  return true;
}

export async function dirClone(src) {
  const dir = await mkdtemp(join(tmpdir(), 'v4-verify-'));
  await cp(src, dir, { recursive: true, verbatimSymlinks: true });
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function saveFailure(arm, taskId, r) {
  if (!r || r === true || r.pass) return;
  const dir = join('reports', 'v4', 'failures', process.env.V4_RUN_LABEL ?? arm.replace(/[^\w.-]/g, '_'));
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, `${taskId.replace(/\//g, '_')}.log`), `--- ${r.kind}\n${r.output ?? ''}\n`);
}

// The hidden tests are not in the workspace; the agent gets the exercise statement and the stub files.
async function defaultPrompt(prep) {
  const doc = await readPolyglotDocs(prep.dir);
  // Names the hidden suite's origin: r27 misses were mostly wrong API shape (missing constants, non-generic types) and canonical edge cases.
  const name = basename(prep.dir);
  // V4_HINT: exercism (default, leans on recall of the public suite) | generic (statement only, for unseen sets) | off (pre-6934d20 prompt)
  const mode = process.env.V4_HINT ?? 'exercism';
  const hint = !prep.lang || mode === 'off' ? ''
    : mode === 'generic' ? '\n\nThe hidden tests check the whole statement, not only its examples. Match the API the stub and statement define exactly: names and constants, static vs instance methods, types, and whether errors throw or return a value. Your self-test must cover every edge and error case the statement states or implies, not only the examples below.'
    : `\n\nThe hidden tests are the Exercism ${prep.lang} track's test suite for "${name}". Match that track's expected API exactly: exported names and constants, static vs instance methods, parameter types (keep the stub's concrete types; a template can break brace-initialized calls), and whether errors throw or return a value. Your self-test must cover the cases from Exercism's canonical test data for "${name}" as you recall them, including every edge and error case, not only the examples below.`;
  // r27 hint run: 15 of 15 escalations came from SELFTEST commands that could not re-run (scratch file gone, /tmp blocked, placeholders, no runner summary), not from wrong code.
  const self = !prep.lang || mode === 'off' ? '' : `\n\nSelf-test rules: put your test in the current directory in a new file or folder whose name starts with "selftest" (e.g. selftest_test.py, selftest.spec.js, selftest_test.go, tests/selftest.rs, selftest.cpp); it is excluded from grading. Never use /tmp (blocked) and never delete it. Your SELFTEST line is re-run verbatim by /bin/sh from the current directory after you finish, so it must be one complete command with no placeholders, and its output must include a pass count: use the real runner (pytest, jest, go test, cargo test, gradle test), or for C++ print "<N> passed" from your own main().`;
  return `Solve this programming exercise in the current directory by editing the stub source file(s) so the hidden tests pass. Do not edit test files or build config.${hint}${self}\n\n${doc}`;
}

export async function main(argv) {
  const o = parseArgs(argv);
  if (!o.manifest || !o.arm || !o['global-cap-usd'] || !o.results) {
    throw new Error('usage: --manifest --arm --global-cap-usd --results [--workers=2] [--budget-usd]');
  }
  const protocol = o.protocol ?? 'pass1';
  if (!['pass1', 'pass2'].includes(protocol)) throw new Error('--protocol must be pass1|pass2');
  // pass2 mirrors the Aider polyglot 2-attempt rule; swebpro has no such rule.
  if (protocol === 'pass2' && o.provider === 'swebpro') throw new Error('--protocol=pass2 is polyglot-only; refused for provider swebpro');
  assertFresh(o.results);
  assertFresh(`${o.results}.ledger.jsonl`);
  const workers = o.workers === undefined ? 2 : Number(o.workers);
  const items = loadManifest(o.manifest);
  // Dynamic import: the workspace provider is a separate module that may not exist yet. Failing here spends nothing.
  const mod = await import(o.provider === 'swebpro' ? '../src/v4-swebpro.mjs' : '../src/v4-polyglot.mjs').catch(error => { throw new Error(`workspace provider src/v4-polyglot.mjs unavailable (${error.code ?? error.message})`); });
  const provider = mod.default ?? mod.polyglotProvider ?? (mod.prepWorkspace && mod.runAcceptance ? mod : null);
  if (!provider) throw new Error('src/v4-polyglot.mjs exports no provider (expected default or polyglotProvider)');
  const rows = await runBench({
    items, arm: o.arm, workers, globalCapUsd: Number(o['global-cap-usd']), results: o.results, gate: o.gate ?? 'self',
    budgetUsd: o['budget-usd'] === undefined ? undefined : Number(o['budget-usd']), provider, probe: probeFreePct, v5Top: o['v5-top'], v5Cheap: o['v5-cheap'], v5Strict: o['v5-strict'] === true, protocol,
    v6K: o['v6-k'] === undefined ? undefined : Number(o['v6-k']), v6Plan: o['v6-plan'], v7Stages: o['v7-stages'], v7Agree: o['v7-agree'], v7Sblind: o['v7-sblind'],
  });
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(n => console.log(`${n} rows`), error => { console.error(error.message); process.exit(2); });
}

// Moves a passing item's transcripts to <root>/pass/<arm>/<task>/<run>/ with the row beside them; drops the rest.
export async function keepPassTranscripts(store, row, arm, taskId) {
  if (!store.files.length) return;
  if (row?.finalPass === true) {
    const dest = join(dirname(dirname(store.dir)), 'pass', arm.replace(/[^\w.:-]/g, '_'), taskId.replace(/\//g, '_'), basename(store.dir));
    await mkdir(dirname(dest), { recursive: true });
    await rename(store.dir, dest);
    await writeFile(join(dest, 'row.json'), JSON.stringify(row) + '\n');
  } else if (process.env.V4_KEEP_FAIL === '1') { // failure traces for step analysis
    const dest = join(dirname(dirname(store.dir)), 'fail', arm.replace(/[^\w.:-]/g, '_'), taskId.replace(/\//g, '_'), basename(store.dir));
    await mkdir(dirname(dest), { recursive: true });
    await rename(store.dir, dest);
    await writeFile(join(dest, 'row.json'), JSON.stringify(row) + '\n');
  } else await rm(store.dir, { recursive: true, force: true });
}
