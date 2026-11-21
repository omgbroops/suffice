// Auto mode: one cheap Luna call classifies the task, then dispatches to the
// right arm — repairs go cheap-first with escalation, features go to the
// strong model directly, anything ambiguous gets the race. The classifier
// costs ~$0.0002 and routes the ~$0.03-per-task decision.
import { resolve } from 'node:path';
import { runAgent } from './harness.mjs';
import { runEco } from './eco.mjs';
import { runRace, workspacePrefill } from './race.mjs';
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

export async function runAuto({ runtime, task, variant, workspace, runDir, thinkingLevel = 'low', timeoutMs = 240_000 }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const classify = createReadOnlyAssistant({ kind: 'luna', mode: 'select', runtime, timeoutMs: 15_000, maxCalls: 1 });
    const prefill = await workspacePrefill(task.workspaceDir);
    const decision = await classify({
      objective: `Classify this coding task.\n\nTask: ${task.title ?? ''}\n${task.prompt}\n\n${prefill}`.slice(0, 8000),
      latestEvidence: 'Choose the single route that fits the task best.',
      candidates: CANDIDATES,
    }, { signal: controller.signal });
    const route = CANDIDATES.some(c => c.id === decision.selectedId) ? decision.selectedId : 'other';
    const remaining = Math.max(30_000, timeoutMs - (Date.now() - started));
    let outcome;
    if (route === 'repair') {
      outcome = await runEco({ runtime, task, variant, runDir, thinkingLevel, timeoutMs: remaining,
        eco: { cheapModel: 'gpt-6-luna', cheapEffort: 'low', prefill: true, cheapRetries: 2 } });
    } else if (route === 'feature') {
      outcome = await runAgent({ runtime, workspace, runDir: resolve(runDir, 'agent'), task, variant, thinkingLevel, timeoutMs: remaining, signal: controller.signal });
      outcome.winnerWorkspace = workspace;
    } else {
      const raced = await runRace({ runtime, task, variant, n: 3, selection: 'first', attemptSpecs: RACE_ATTEMPTS, runDir, thinkingLevel, timeoutMs: remaining });
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
