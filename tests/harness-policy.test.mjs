import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRuntime, createAgentSession, createCodemodeExtension, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { selectContext } from '../src/context-policy.mjs';
import { workspaceTools } from '../src/workspace.mjs';
import { aggregateCampaign } from '../scripts/report.mjs';

test('Pi context selection precedes full-context projection and preserves source transcript with codemode', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'suffice-policy-'));
  let session;
  try {
    const workspace = resolve(directory, 'workspace'); await mkdir(workspace);
    const runtime = await ModelRuntime.create({ authPath: resolve(directory, 'auth.json'), modelsPath: null, refreshOnCreate: false });
    const names = ['files', 'file_read', 'search', 'file_edit', 'file_write', 'test', 'codemode'];
    const settings = SettingsManager.inMemory({ defaultTools: names });
    let visible, projected;
    const resourceLoader = new DefaultResourceLoader({ cwd: workspace, agentDir: directory, settingsManager: settings,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [createCodemodeExtension({ mode: 'only', models: false }), pi => {
        pi.on('context', async event => {
          visible = event.messages;
          const result = await selectContext(event.messages, { mode: 'compaction', thresholdCharacters: 0, recentGroups: 1 });
          return { messages: result.messages };
        });
        pi.on('context_with_system', event => { projected = event.messages; });
      }] });
    await resourceLoader.reload();
    ({ session } = await createAgentSession({ cwd: workspace, agentDir: directory, modelRuntime: runtime,
      model: runtime.getModel('openai', 'gpt-6.1-sol'), settingsManager: settings, resourceLoader,
      tools: names, customTools: workspaceTools({ workspace, artifactsDir: resolve(directory, 'artifacts') }), sessionManager: SessionManager.inMemory(workspace) }));
    await session.bindExtensions({});
    const system = { role: 'system', content: '', sections: { instructions: 'initial instructions' },
      toolsAdded: [{ name: 'codemode', description: 'Run code', parameters: { type: 'object' } }], timestamp: 0 };
    const update = { role: 'system', content: '', sections: { instructions: 'updated instructions' }, timestamp: 4 };
    const input = [system, { role: 'user', content: 'initial task', timestamp: 1 },
      { role: 'assistant', content: [{ type: 'text', text: 'old history' }], timestamp: 2 }, update,
      { role: 'assistant', content: [{ type: 'toolCall', id: 'call', name: 'codemode', arguments: { code: 'text(1)' } }], timestamp: 5 },
      { role: 'toolResult', toolCallId: 'call', toolName: 'codemode', content: [{ type: 'text', text: 'Script completed\n1' }], isError: false, timestamp: 6 }];
    session.agent.state.messages = input;
    const before = JSON.stringify(input);
    const result = await session.agent.transformContext(input, new AbortController().signal);
    assert.equal(visible.some(message => message.role === 'system'), false);
    assert.deepEqual(visible.map(message => message.role), ['user', 'assistant', 'assistant', 'toolResult']);
    assert.deepEqual(projected.map(message => message.role), ['system', 'user', 'assistant', 'toolResult']);
    assert.equal(projected[0].sections.instructions, 'updated instructions');
    assert.equal(projected[0].toolsAdded[0].name, 'codemode');
    assert.deepEqual(result.filter(message => message.role !== 'system'), input.filter((_, index) => [1, 4, 5].includes(index)));
    assert.equal(JSON.stringify(session.messages), before);
    assert.equal(JSON.stringify(input), before);
  } finally { session?.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test('report preserves context pruning and selector cost while excluding fail-open treatment', () => {
  const report = aggregateCampaign([{ task: 'fixture', variant: 'select-luna', repetition: 0,
    status: 'completed', success: true, acceptance: { status: 'passed' },
    usage: { estimatedApiUsd: 0.1, totalTokens: 100, cacheRead: 20 },
    watcherCalls: 1, decisions: [{ provider: 'openai', status: 'selected', purpose: 'context_selection',
      dispatched: true, injected: false, costUsd: 0.02, usage: { totalTokens: 10 } }],
    contextTreatmentValid: false,
    contextDecisions: [{ status: 'selected', removedMessages: 2, removedCharacters: 800 },
      { status: 'fail_open', reason: 'selector_error', removedMessages: 0, removedCharacters: 0 }] }]);
  const arm = report.variants[0];
  assert.equal(arm.intentionToTreat.successes, 1);
  assert.equal(arm.treatedValid.denominator, 0);
  assert.equal(arm.treatedValid.exclusions.context_treatment_invalid, 1);
  assert.equal(arm.metrics.totalEstimatedUsd.mean, 0.1 + 0.02);
  assert.equal(arm.metrics.totalTokens.mean, 110);
  assert.deepEqual(report.runs[0].context, { decisions: 2, prunedCalls: 1, removedCharacters: 800, failures: 1 });
});

test('correct patch with timeout remains distinct from operational success and unknown total cost', () => {
  const report = aggregateCampaign([{ task: 'fixture', variant: 'select-luna', repetition: 0,
    status: 'run_timeout', success: false, acceptance: { status: 'passed' },
    usageCostUnknown: true, usage: { estimatedApiUsd: 0.16, totalTokens: 90000, cacheRead: 20000 },
    watcherCalls: 0, decisions: [] }]);
  const arm = report.variants[0];
  assert.equal(arm.acceptedPatches, 1);
  assert.equal(arm.intentionToTreat.successes, 0);
  assert.equal(arm.metrics.totalEstimatedUsd.known, 0);
  assert.equal(arm.metrics.knownEstimatedUsd.sum, 0.16);
});
