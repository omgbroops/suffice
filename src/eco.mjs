// Eco mode: the cheap model attempts the repair first; the strong model only
// runs when the cheap path provably failed (no verified patch). Unlike
// review-on-success, escalation pays for Sol only when needed — the strong
// model's quality ceiling is preserved whenever Luna actually fails.
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runAgent } from './harness.mjs';
import { filesIn, readText, hash, runNodeTests } from './workspace.mjs';

async function verified(workspace, task, baseline, signal) {
  const acceptance = await runNodeTests(workspace, task.acceptancePath, { signal });
  if (acceptance.status !== 'passed') return false;
  for (const path of (await filesIn(baseline)).filter(p => !p.startsWith('src/'))) {
    if (hash(await readText(workspace, path)) !== hash(await readText(baseline, path))) return false;
  }
  return true;
}

// eco = { cheapModel, cheapEffort, cheapTurns, cheapTimeoutMs }
export async function runEco({ runtime, task, variant, runDir, thinkingLevel = 'low', timeoutMs = 240_000, eco = {}, runAgentImpl = runAgent }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Phase A: cheap-model attempt on its own workspace copy.
    const cheapDir = resolve(runDir, 'cheap');
    const cheapWorkspace = resolve(cheapDir, 'workspace');
    await mkdir(cheapDir, { recursive: true });
    await cp(task.workspaceDir, cheapWorkspace, { recursive: true });
    const cheap = await runAgentImpl({
      runtime, workspace: cheapWorkspace, runDir: cheapDir, task,
      variant: { ...variant, model: eco.cheapModel ?? 'gpt-6-luna' },
      thinkingLevel: eco.cheapEffort ?? 'low', maxTurns: eco.cheapTurns,
      timeoutMs: eco.cheapTimeoutMs ?? 120_000, signal: controller.signal });
    const cheapPassed = cheap.status === 'completed' && await verified(cheapWorkspace, task, task.workspaceDir, controller.signal);
    let strong = null;
    if (!cheapPassed) {
      // Phase B: escalate — fresh copy, fresh session, strong model.
      const strongDir = resolve(runDir, 'strong');
      const strongWorkspace = resolve(strongDir, 'workspace');
      await mkdir(strongDir, { recursive: true });
      await cp(task.workspaceDir, strongWorkspace, { recursive: true });
      strong = await runAgentImpl({
        runtime, workspace: strongWorkspace, runDir: strongDir, task, variant,
        thinkingLevel: eco.strongEffort ?? thinkingLevel, timeoutMs, signal: controller.signal });
    }
    const winner = cheapPassed ? cheap : strong;
    const usage = {};
    for (const a of [cheap, strong].filter(Boolean)) {
      for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'totalTokens', 'estimatedApiUsd']) usage[k] = (usage[k] ?? 0) + (a.usage?.[k] ?? 0);
    }
    const result = {
      status: cheapPassed ? 'completed' : (strong?.status ?? 'provider_error'),
      providerFailureKind: cheapPassed ? undefined : strong?.providerFailureKind,
      eco: { escalated: !cheapPassed,
        cheap: { status: cheap.status, verified: cheapPassed, turns: cheap.turns, latencyMs: cheap.latencyMs },
        strong: strong ? { status: strong.status, turns: strong.turns, latencyMs: strong.latencyMs } : null },
      winnerWorkspace: cheapPassed ? cheapWorkspace : strong ? resolve(runDir, 'strong', 'workspace') : null,
      usage, usageCostUnknown: cheap.usageCostUnknown || strong?.usageCostUnknown,
      turns: (cheap.turns ?? 0) + (strong?.turns ?? 0), latencyMs: Date.now() - started, final: winner?.final };
    await writeFile(resolve(runDir, 'eco.json'), JSON.stringify(result, null, 2));
    return result;
  } finally { clearTimeout(timer); }
}
