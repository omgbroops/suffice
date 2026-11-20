// Race N identical trajectories in isolated workspace copies. Wall clock is
// max-of-N, not sum-of-N; the first verified winner can stop the rest.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runAgent } from './harness.mjs';
import { filesIn, readText, hash, runNodeTests } from './workspace.mjs';
import { workflowPatch } from './workflow-agent.mjs';

async function attemptDiff(workspace, baseline) {
  const sourceFiles = (await filesIn(baseline)).filter(p => p.startsWith('src/'));
  const patch = await workflowPatch(workspace, baseline, sourceFiles);
  const diffLines = patch.text.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length;
  return { patch, diffLines };
}

async function immutableIntact(workspace, baseline) {
  for (const path of (await filesIn(baseline)).filter(p => !p.startsWith('src/'))) {
    if (hash(await readText(workspace, path)) !== hash(await readText(baseline, path))) return false;
  }
  return true;
}

// selection: 'first' = first verified pass wins, losers are aborted.
// 'best' = wait for every attempt, then pick the smallest accepted diff.
// attemptSpecs[i] (optional) diversifies attempt i: thinkingLevel, variant,
// or a promptSuffix appended to the task prompt.
export async function runRace({ runtime, task, variant, n = 3, runDir, thinkingLevel = 'low', timeoutMs = 240_000, selection = 'first', attemptSpecs = [], iterate = false, runAgentImpl = runAgent }) {
  if (!['first', 'best'].includes(selection)) throw new Error(`Unknown selection: ${selection}`);
  const controller = new AbortController();
  const started = Date.now();
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const index = i;
    const spec = attemptSpecs[index] ?? {};
    const attemptTask = spec.promptSuffix ? { ...task, prompt: `${task.prompt}\n\n${spec.promptSuffix}` } : task;
    const attemptThinking = spec.thinkingLevel ?? thinkingLevel;
    jobs.push((async () => {
      const attemptDir = resolve(runDir, `attempt-${index}`);
      const workspace = resolve(attemptDir, 'workspace');
      await mkdir(attemptDir, { recursive: true });
      await cp(task.workspaceDir, workspace, { recursive: true });
      const agent = await runAgentImpl({ runtime, workspace, runDir: attemptDir, task: attemptTask, variant: spec.variant ?? variant, thinkingLevel: attemptThinking, timeoutMs, signal: controller.signal });
      if (controller.signal.aborted) return { index, spec, status: agent.status, providerFailureKind: agent.providerFailureKind, passed: false, usage: agent.usage, usageCostUnknown: agent.usageCostUnknown, turns: agent.turns, latencyMs: agent.latencyMs, workspace, runDir: attemptDir };
      const acceptance = await runNodeTests(workspace, task.acceptancePath, { signal: controller.signal });
      const passed = agent.status === 'completed' && acceptance.status === 'passed' && await immutableIntact(workspace, task.workspaceDir);
      const { diffLines } = passed ? await attemptDiff(workspace, task.workspaceDir) : { diffLines: null };
      return { index, spec, status: agent.status, providerFailureKind: agent.providerFailureKind, passed, diffLines, acceptanceStatus: acceptance.status, usage: agent.usage, usageCostUnknown: agent.usageCostUnknown, turns: agent.turns, latencyMs: agent.latencyMs, workspace, runDir: attemptDir };
    })().then(
      attempt => ({ settled: true, attempt }),
      error => ({ settled: true, attempt: { index, status: 'harness_error', passed: false, error: String(error?.message ?? error) } }),
    ));
  }
  const attempts = [];
  let winner = null;
  if (selection === 'first') {
    const done = new Set();
    while (done.size < jobs.length && !winner) {
      const r = await Promise.race(jobs.filter((_, i) => !done.has(i)));
      done.add(r.attempt.index);
      attempts.push(r.attempt);
      if (r.attempt?.passed) winner = r.attempt;
    }
  } else {
    for (const r of await Promise.all(jobs)) attempts.push(r.attempt);
    const passing = attempts.filter(a => a.passed).sort((a, b) => (a.diffLines ?? Infinity) - (b.diffLines ?? Infinity) || a.index - b.index);
    winner = passing[0] ?? null;
  }
  if (winner) controller.abort();
  // Collect the rest of the attempts for the record after the winner is known.
  for (const r of await Promise.all(jobs)) if (!attempts.includes(r.attempt)) attempts.push(r.attempt);
  attempts.sort((a, b) => a.index - b.index);
  // Surface a uniform failure kind so callers can gate on provider health:
  // when every attempt failed the same way, that is the race's status. A
  // uniform 'completed' means every agent finished but none verified, which
  // is a plain 'no_winner', not a success.
  const settledStatuses = new Set(attempts.map(a => a.status));
  const uniformFailure = !winner && settledStatuses.size === 1 && attempts[0].status !== 'completed' ? attempts[0].status : null;
  // Iterate-on-winner: one refinement pass on the chosen workspace. If the
  // refined state fails verification, revert to the pre-iteration winner.
  let iteration = null;
  if (winner && iterate) {
    const backup = resolve(runDir, 'winner-backup');
    await mkdir(backup, { recursive: true });
    await cp(winner.workspace, backup, { recursive: true });
    const refineTask = { ...task, prompt: `${task.prompt}\n\nA verified fix already exists in this workspace. Tighten it: the smallest correct change only — remove any unrelated edits, do not refactor or reformat. Run the test tool once at the end, then stop.` };
    // The race controller is already aborted to kill the losers; the
    // refinement gets a fresh signal so it is not born cancelled.
    const iterAgent = await runAgentImpl({ runtime, workspace: winner.workspace, runDir: resolve(runDir, 'iterate'), task: refineTask, variant, thinkingLevel, timeoutMs });
    const acceptance = await runNodeTests(winner.workspace, task.acceptancePath);
    const ok = iterAgent.status === 'completed' && acceptance.status === 'passed' && await immutableIntact(winner.workspace, task.workspaceDir);
    if (!ok) { await rm(winner.workspace, { recursive: true, force: true }); await cp(backup, winner.workspace, { recursive: true }); }
    iteration = { accepted: ok, agentStatus: iterAgent.status, latencyMs: iterAgent.latencyMs, turns: iterAgent.turns, usage: iterAgent.usage };
  }
  const result = {
    status: winner ? 'completed' : uniformFailure ?? 'no_winner', providerFailureKind: uniformFailure === 'provider_error' ? attempts[0].providerFailureKind : undefined,
    chosen: winner?.index ?? null, selection, attempts, iteration,
    latencyMs: Date.now() - started,
    usage: [...attempts, ...(iteration ? [iteration] : [])].reduce((sum, a) => {
      for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'estimatedApiUsd']) sum[k] = (sum[k] ?? 0) + (a.usage?.[k] ?? 0);
      return sum;
    }, {}),
  };
  await writeFile(resolve(runDir, 'race.json'), JSON.stringify({ ...result, workspace: undefined }, null, 2));
  return result;
}
