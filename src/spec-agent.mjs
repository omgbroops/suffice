// SpecAgent-lite: a cheap fast model scouts the workspace read-only, then the
// strong model repairs with the scout's notes in context. Drafting on Luna is
// far cheaper and lower-latency than Sol; the verifier still does the real
// edit and acceptance check.
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runAgent } from './harness.mjs';

const DRAFT_SUFFIX = `

You are the scout in a draft-and-verify team: explore only, you have no edit
tools. Inspect src/, run the test tool if useful, then finish with concrete
findings: which files and functions cause the bug, the evidence, and the
smallest fix you would make. Do not ask questions.`;

export async function runSpecAgent({ runtime, task, variant, runDir, thinkingLevel = 'low', timeoutMs = 240_000, spec = {}, runAgentImpl = runAgent }) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Phase A: draft on the cheap model, read-only, capped turns.
    const draftDir = resolve(runDir, 'draft');
    const draftWorkspace = resolve(draftDir, 'workspace');
    await mkdir(draftDir, { recursive: true, verbatimSymlinks: true });
    await cp(task.workspaceDir, draftWorkspace, { recursive: true, verbatimSymlinks: true });
    const draft = await runAgentImpl({
      runtime, workspace: draftWorkspace, runDir: draftDir,
      task: { ...task, prompt: task.prompt + DRAFT_SUFFIX },
      variant: { ...variant, model: spec.draftModel ?? 'gpt-6-luna', readOnly: true },
      thinkingLevel: spec.draftEffort ?? 'low', maxTurns: spec.draftTurns ?? 8,
      timeoutMs: spec.draftTimeoutMs ?? 90_000, signal: controller.signal });
    // Phase B: verify on the strong model with the scout's notes.
    const workspace = resolve(runDir, 'workspace');
    await mkdir(workspace, { recursive: true, verbatimSymlinks: true });
    await cp(task.workspaceDir, workspace, { recursive: true, verbatimSymlinks: true });
    const notes = (draft.final ?? '').trim();
    const verifyTask = { ...task, prompt: `${task.prompt}\n\nA scout agent already explored this codebase read-only. Use its findings to go straight to the fix, but verify everything yourself before trusting it.\n\n<scout-notes>\n${notes || '(scout produced no summary)'}\n</scout-notes>` };
    const verify = await runAgentImpl({
      runtime, workspace, runDir, task: verifyTask, variant,
      thinkingLevel, timeoutMs, signal: controller.signal });
    const usage = {};
    for (const a of [draft, verify]) {
      for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'totalTokens', 'estimatedApiUsd']) usage[k] = (usage[k] ?? 0) + (a.usage?.[k] ?? 0);
    }
    const result = {
      status: verify.status, providerFailureKind: verify.providerFailureKind,
      spec: { draftModel: spec.draftModel ?? 'gpt-6-luna', draft: { status: draft.status, turns: draft.turns, latencyMs: draft.latencyMs }, verify: { status: verify.status, turns: verify.turns, latencyMs: verify.latencyMs } },
      usage, usageCostUnknown: (draft.usageCostUnknown || verify.usageCostUnknown),
      turns: (draft.turns ?? 0) + (verify.turns ?? 0), latencyMs: Date.now() - started, final: verify.final };
    await writeFile(resolve(runDir, 'spec-agent.json'), JSON.stringify(result, null, 2));
    return result;
  } finally { clearTimeout(timer); }
}
