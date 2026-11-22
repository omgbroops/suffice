// Auto mode: one cheap Luna call classifies the task, then dispatches to the
// right arm — repairs go cheap-first with escalation, features go to the
// strong model directly, anything ambiguous gets the race. The classifier
// costs ~$0.0002 and routes the ~$0.03-per-task decision.
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { runAgent } from './harness.mjs';
import { runEco } from './eco.mjs';
import { runRace, workspacePrefill, immutableIntact } from './race.mjs';
import { materializeWorkspace } from './workspace.mjs';
import { runTaskAcceptance } from './deepswe-verify.mjs';
import { createReadOnlyAssistant } from './control-policy.mjs';

const CANDIDATES = [
  { id: 'repair', path: 'routes/repair', description: 'Bug fix, patch, or repair of existing behavior', excerpt: 'Fix a failing test, a regression, or incorrect behavior in existing code.' },
  { id: 'feature', path: 'routes/feature', description: 'New functionality or behavior that does not exist yet', excerpt: 'Add a capability, endpoint, option, or API that is currently absent.' },
  { id: 'other', path: 'routes/other', description: 'Anything ambiguous: refactor, docs, analysis, or unclear intent', excerpt: 'Tasks that are neither a clear repair nor a clear feature, or where the intent is ambiguous.' },
];

const RACE_ATTEMPTS = [
  { thinkingLevel: 'low', prefill: true },
  { thinkingLevel: 'low', prefill: true, promptSuffix: 'Prefer the smallest correct change. Do not refactor or reformat unrelated code.' },
  { thinkingLevel: 'low', prefill: true, promptSuffix: 'Check edge cases and the full contract before finishing.' },
];

export async function runAuto({ runtime, task, variant, workspace, runDir, thinkingLevel = 'low', timeoutMs = 240_000, maxTurns = 24 }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const classify = createReadOnlyAssistant({ kind: 'luna', mode: 'select', runtime, timeoutMs: 15_000, maxCalls: 1 });
    const prefill = await workspacePrefill(task.workspaceDir);
    const decision = await classify({
      objective: `Classify this coding task.\n\nTask: ${task.title ?? ''}\n${task.prompt}\n\n${prefill}`.slice(0, 8000),
      latestEvidence: 'Choose the single route that fits the task best. repair = fixing existing behavior: tasks phrased as fix/repair/bug/regression, or describing incorrect behavior to correct — even when the fix adds a parameter or new code path. feature = a purely new capability not framed as a fix. When unsure between repair and feature, choose repair; when unsure otherwise, choose other.',
      candidates: CANDIDATES,
    }, { signal: controller.signal });
    const route = CANDIDATES.some(c => c.id === decision.selectedId) ? decision.selectedId : 'other';
    const remaining = Math.max(30_000, timeoutMs - (Date.now() - started));
    let outcome;
    if (route === 'repair') {
      outcome = await runEco({ runtime, task, variant, runDir, thinkingLevel, timeoutMs: remaining,
        eco: { cheapModel: 'gpt-6-luna', cheapEffort: 'low', prefill: true, cheapRetries: 2 }, maxTurns });
    } else if (route === 'feature') {
      outcome = await runAgent({ runtime, workspace, runDir: resolve(runDir, 'agent'), task, variant, thinkingLevel, timeoutMs: remaining, maxTurns, signal: controller.signal });
      outcome.winnerWorkspace = workspace;
    } else {
      const raced = await runRace({ runtime, task, variant, n: 3, selection: 'first', attemptSpecs: RACE_ATTEMPTS, runDir, thinkingLevel, timeoutMs: remaining, maxTurns });
      const winner = raced.attempts?.find(a => a.index === raced.chosen);
      outcome = { ...raced, winnerWorkspace: winner?.workspace ?? null,
        turns: raced.attempts?.reduce((s, a) => s + (a.turns ?? 0), 0) ?? 0 };
    }
    const usage = outcome.usage ?? {};
    usage.estimatedApiUsd = (usage.estimatedApiUsd ?? 0) + (decision.costUsd ?? 0);
    return { ...outcome, usage,
      auto: { route, classify: { status: decision.status, latencyMs: decision.latencyMs, costUsd: decision.costUsd } },
      latencyMs: Date.now() - started };
  } finally { clearTimeout(timer); }
}

// Auto-ladder: same classify route, but a failed solo attempt escalates to a
// stronger harness *shape* — a 3-way race — rather than another solo try.
// One race lane is seeded with the losing attempt's workspace (the actual
// diff, a lossless handoff) plus the verifier's failure digest; the other
// two start clean for trajectory diversity. Mode switching happens at the
// attempt boundary where the verifier verdict is free.
export async function runAutoLadder({ runtime, task, variant, workspace, runDir, thinkingLevel = 'low', timeoutMs = 240_000, maxTurns = 24 }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const classify = createReadOnlyAssistant({ kind: 'luna', mode: 'select', runtime, timeoutMs: 15_000, maxCalls: 1 });
    const prefill = await workspacePrefill(task.workspaceDir);
    const decision = await classify({
      objective: `Classify this coding task.\n\nTask: ${task.title ?? ''}\n${task.prompt}\n\n${prefill}`.slice(0, 8000),
      latestEvidence: 'Choose the single route that fits the task best. repair = fixing existing behavior: tasks phrased as fix/repair/bug/regression, or describing incorrect behavior to correct — even when the fix adds a parameter or new code path. feature = a purely new capability not framed as a fix. When unsure between repair and feature, choose repair; when unsure otherwise, choose other.',
      candidates: CANDIDATES,
    }, { signal: controller.signal });
    const route = CANDIDATES.some(c => c.id === decision.selectedId) ? decision.selectedId : 'other';
    const remaining = () => Math.max(30_000, timeoutMs - (Date.now() - started));
    const classifyCost = decision.costUsd ?? 0;
    const classifyInfo = { route, classify: { status: decision.status, latencyMs: decision.latencyMs, costUsd: classifyCost } };

    // Ambiguous tasks go straight to the race — there is no cheaper shape
    // worth trying first.
    if (route === 'other') {
      const raced = await runRace({ runtime, task, variant, n: 3, selection: 'first', attemptSpecs: RACE_ATTEMPTS, runDir, thinkingLevel, timeoutMs: remaining(), maxTurns });
      const winner = raced.attempts?.find(a => a.index === raced.chosen);
      const usage = { ...(raced.usage ?? {}), estimatedApiUsd: (raced.usage?.estimatedApiUsd ?? 0) + classifyCost };
      return { ...raced, winnerWorkspace: winner?.workspace ?? null,
        turns: raced.attempts?.reduce((s, a) => s + (a.turns ?? 0), 0) ?? 0,
        usage, auto: classifyInfo, latencyMs: Date.now() - started };
    }

    // Rung 1: one solo attempt — the cheap model for repairs, the session
    // model for features.
    const cheap = route === 'repair';
    const soloDir = resolve(runDir, 'solo');
    const soloWorkspace = resolve(soloDir, 'workspace');
    await mkdir(soloDir, { recursive: true });
    await materializeWorkspace(task, soloWorkspace);
    const solo = await runAgent({
      runtime, workspace: soloWorkspace, runDir: soloDir,
      task: cheap ? { ...task, prompt: `${task.prompt}\n\n${prefill}` } : task,
      variant: cheap ? { ...variant, model: 'gpt-6-luna' } : variant,
      thinkingLevel: 'low', timeoutMs: remaining(), maxTurns, signal: controller.signal });
    let passed = false, detail = '';
    if (solo.status === 'completed') {
      const acceptance = await runTaskAcceptance(soloWorkspace, task, { signal: controller.signal });
      passed = acceptance.status === 'passed' && await immutableIntact(soloWorkspace, task.workspaceDir);
      if (!passed) detail = `${acceptance.status}: ${(acceptance.stdout ?? '').split('\n').filter(l => /not ok|fail|Error/i.test(l)).slice(0, 10).join('\n')}`.slice(0, 1500);
    } else detail = `attempt ${solo.status}`;
    if (passed) {
      const usage = { ...(solo.usage ?? {}), estimatedApiUsd: (solo.usage?.estimatedApiUsd ?? 0) + classifyCost };
      return { status: 'completed', winnerWorkspace: soloWorkspace, turns: solo.turns ?? 0,
        usage, usageCostUnknown: solo.usageCostUnknown, latencyMs: Date.now() - started,
        auto: { ...classifyInfo, solo: { status: solo.status, verified: true, model: cheap ? 'gpt-6-luna' : variant.model } },
        final: solo.final };
    }

    // Rung 2: race-3. Lane 0 inherits the losing workspace + failure digest;
    // lanes 1-2 start clean with the diverse prompts.
    const seedNote = `A previous attempt already modified this workspace but failed verification — ${detail}. Finish the fix: keep what works, repair what does not.`;
    const specs = [
      { thinkingLevel: 'low', prefill: true, seedWorkspace: soloWorkspace, promptSuffix: seedNote },
      { thinkingLevel: 'low', prefill: true, promptSuffix: 'Prefer the smallest correct change. Do not refactor or reformat unrelated code.' },
      { thinkingLevel: 'low', prefill: true, promptSuffix: 'Check edge cases and the full contract before finishing.' },
    ];
    const raced = await runRace({ runtime, task, variant, n: 3, selection: 'first', attemptSpecs: specs, runDir: resolve(runDir, 'ladder'), thinkingLevel, timeoutMs: remaining(), maxTurns });
    const winner = raced.attempts?.find(a => a.index === raced.chosen);
    const usage = {};
    for (const r of [solo, raced]) {
      for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'totalTokens', 'estimatedApiUsd']) usage[k] = (usage[k] ?? 0) + (r.usage?.[k] ?? 0);
    }
    usage.estimatedApiUsd = (usage.estimatedApiUsd ?? 0) + classifyCost;
    return { ...raced, winnerWorkspace: winner?.workspace ?? null,
      turns: (solo.turns ?? 0) + (raced.attempts?.reduce((s, a) => s + (a.turns ?? 0), 0) ?? 0),
      usage, usageCostUnknown: Boolean(solo.usageCostUnknown || raced.usageCostUnknown),
      auto: { ...classifyInfo, solo: { status: solo.status, verified: false, detail: detail.slice(0, 300), model: cheap ? 'gpt-6-luna' : variant.model } },
      latencyMs: Date.now() - started };
  } finally { clearTimeout(timer); }
}
