// Race N identical trajectories in isolated workspace copies. Wall clock is
// max-of-N, not sum-of-N; the first verified winner can stop the rest.
import { cp, mkdir, writeFile } from 'node:fs/promises';
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
export async function runRace({ runtime, task, variant, n = 3, runDir, thinkingLevel = 'low', timeoutMs = 240_000, selection = 'first', runAgentImpl = runAgent }) {
  if (!['first', 'best'].includes(selection)) throw new Error(`Unknown selection: ${selection}`);
  const controller = new AbortController();
  const started = Date.now();
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const index = i;
    jobs.push((async () => {
      const attemptDir = resolve(runDir, `attempt-${index}`);
      const workspace = resolve(attemptDir, 'workspace');
      await mkdir(attemptDir, { recursive: true });
      await cp(task.workspaceDir, workspace, { recursive: true });
      const agent = await runAgentImpl({ runtime, workspace, runDir: attemptDir, task, variant, thinkingLevel, timeoutMs, signal: controller.signal });
      if (controller.signal.aborted) return { index, status: agent.status, providerFailureKind: agent.providerFailureKind, passed: false, usage: agent.usage, usageCostUnknown: agent.usageCostUnknown, turns: agent.turns, latencyMs: agent.latencyMs, workspace, runDir: attemptDir };
      const acceptance = await runNodeTests(workspace, task.acceptancePath, { signal: controller.signal });
      const passed = agent.status === 'completed' && acceptance.status === 'passed' && await immutableIntact(workspace, task.workspaceDir);
      const { diffLines } = passed ? await attemptDiff(workspace, task.workspaceDir) : { diffLines: null };
      return { index, status: agent.status, providerFailureKind: agent.providerFailureKind, passed, diffLines, acceptanceStatus: acceptance.status, usage: agent.usage, usageCostUnknown: agent.usageCostUnknown, turns: agent.turns, latencyMs: agent.latencyMs, workspace, runDir: attemptDir };
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
  const result = {
    status: winner ? 'completed' : uniformFailure ?? 'no_winner', providerFailureKind: uniformFailure === 'provider_error' ? attempts[0].providerFailureKind : undefined,
    chosen: winner?.index ?? null, selection, attempts,
    latencyMs: Date.now() - started,
    usage: attempts.reduce((sum, a) => {
      for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'estimatedApiUsd']) sum[k] = (sum[k] ?? 0) + (a.usage?.[k] ?? 0);
      return sum;
    }, {}),
  };
  await writeFile(resolve(runDir, 'race.json'), JSON.stringify({ ...result, workspace: undefined }, null, 2));
  return result;
}
