import { createRuntime, stateDir } from '../src/runtime.mjs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const runtime = await createRuntime();
if (!runtime.isUsingSubscription('openai')) throw new Error('Subscription authentication required; API-key fallback is disabled.');
const results = [];
for (const id of ['gpt-6.1-sol', 'gpt-6-luna']) {
  const started = Date.now();
  const response = await runtime.completeSimple(runtime.getModel('openai', id), {
    systemPrompt: 'Reply concisely.',
    messages: [{ role: 'user', content: 'Reply with exactly OK.', timestamp: Date.now() }],
  }, { reasoning: 'low', signal: AbortSignal.timeout(60_000), maxRetries: 0 });
  const text = response.content.filter(c => c.type === 'text').map(c => c.text).join('');
  const result = { id, stopReason: response.stopReason, ok: text.trim() === 'OK', usage: response.usage, latencyMs: Date.now() - started };
  results.push(result);
  console.log(JSON.stringify(result));
}
await writeFile(resolve(stateDir, 'model-smoke.json'), JSON.stringify(results, null, 2));
