// Eco mode: the cheap model attempts the repair first; the strong model only
// runs when the cheap path provably failed (no verified patch). Unlike
// review-on-success, escalation pays for Sol only when needed — the strong
// model's quality ceiling is preserved whenever Luna actually fails.
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runAgent } from './harness.mjs';
import { workspacePrefill } from './race.mjs';
import { filesIn, readText, hash, materializeWorkspace } from './workspace.mjs';
import { runTaskAcceptance } from './deepswe-verify.mjs';

// Returns { passed } plus a compact failure digest the cheap model can retry against.
async function check(workspace, task, baseline, signal, runtime, finalAnswer) {
  const acceptance = await runTaskAcceptance(workspace, task, { signal, runtime, finalAnswer });
  if (acceptance.status !== 'passed') {
    const digest = `${acceptance.status}: ${(acceptance.stdout ?? '').split('\n').filter(l => /not ok|fail|Error/i.test(l)).slice(0, 10).join('\n')}`.slice(0, 3000);
    return { passed: false, detail: `acceptance ${digest}` };
  }
  for (const path of (await filesIn(baseline)).filter(p => !p.startsWith('src/'))) {
    if (hash(await readFile(resolve(workspace, path))) !== hash(await readFile(resolve(baseline, path)))) return { passed: false, detail: `non-source file changed: ${path}` };
  }
  return { passed: true };
}

// eco = { cheapModel, cheapEffort, cheapTurns, cheapTimeoutMs, prefill, cheapRetries }
export async function runEco({ runtime, task, variant, runDir, thinkingLevel = 'low', timeoutMs = 240_000, eco = {}, maxTurns = 24, runAgentImpl = runAgent }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Phase A: cheap-model attempt on its own workspace copy, optionally
    // prefilled with the workspace map, then cheap verdict-retry rounds on the
    // same workspace before paying for an escalation.
    const cheapDir = resolve(runDir, 'cheap');
    const cheapWorkspace = resolve(cheapDir, 'workspace');
    await mkdir(cheapDir, { recursive: true });
    await materializeWorkspace(task, cheapWorkspace);
    const cheapTask = eco.prefill ? { ...task, prompt: `${task.prompt}\n\n${(task.workspaceDir ? await workspacePrefill(task.workspaceDir) : '')}` } : task;
    const cheapVariant = { ...variant, model: eco.cheapModel ?? 'gpt-6-luna' };
    const retries = eco.cheapRetries ?? 0;
    const cheapRuns = [];
    let cheapPassed = false, lastDetail = '';
    for (let attempt = 0; attempt <= retries && !cheapPassed; attempt++) {
      const attemptDir = attempt === 0 ? cheapDir : resolve(runDir, `cheap-retry-${attempt}`);
      const promptTask = attempt === 0 ? cheapTask : { ...cheapTask, prompt: `${cheapTask.prompt}\n\nPrevious attempt failed verification — ${lastDetail}\nKeep fixing until the acceptance tests pass.` };
      const run = await runAgentImpl({
        runtime, workspace: cheapWorkspace, runDir: attemptDir, task: promptTask,
        variant: cheapVariant,
        thinkingLevel: eco.cheapEffort ?? 'low', maxTurns: eco.cheapTurns,
        timeoutMs: eco.cheapTimeoutMs ?? 120_000, signal: controller.signal });
      cheapRuns.push(run);
      if (run.status !== 'completed') break;
      const verdict = await check(cheapWorkspace, task, task.workspaceDir, controller.signal, runtime, run.final);
      cheapPassed = verdict.passed; lastDetail = verdict.detail ?? '';
    }
    const cheap = { status: cheapRuns.at(-1).status,
      turns: cheapRuns.reduce((s, r) => s + (r.turns ?? 0), 0),
      latencyMs: cheapRuns.reduce((s, r) => s + (r.latencyMs ?? 0), 0),
      usageCostUnknown: cheapRuns.some(r => r.usageCostUnknown),
      usage: cheapRuns.reduce((acc, r) => { for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'totalTokens', 'estimatedApiUsd']) acc[k] = (acc[k] ?? 0) + (r.usage?.[k] ?? 0); return acc; }, {}) };
    let strong = null;
    if (!cheapPassed) {
      // Phase B: escalate — fresh copy, fresh session, strong model.
      const strongDir = resolve(runDir, 'strong');
      const strongWorkspace = resolve(strongDir, 'workspace');
      await mkdir(strongDir, { recursive: true });
      await materializeWorkspace(task, strongWorkspace);
      strong = await runAgentImpl({
        runtime, workspace: strongWorkspace, runDir: strongDir, task, variant,
        thinkingLevel: eco.strongEffort ?? thinkingLevel, timeoutMs, maxTurns, signal: controller.signal });
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
        cheap: { status: cheap.status, verified: cheapPassed, retries: cheapRuns.length - 1, turns: cheap.turns, latencyMs: cheap.latencyMs },
        strong: strong ? { status: strong.status, turns: strong.turns, latencyMs: strong.latencyMs } : null },
      winnerWorkspace: cheapPassed ? cheapWorkspace : strong ? resolve(runDir, 'strong', 'workspace') : null,
      usage, usageCostUnknown: Boolean(cheap.usageCostUnknown || strong?.usageCostUnknown),
      turns: cheap.turns + (strong?.turns ?? 0), latencyMs: Date.now() - started, final: winner?.final };
    await writeFile(resolve(runDir, 'eco.json'), JSON.stringify(result, null, 2));
    return result;
  } finally { clearTimeout(timer); }
}
