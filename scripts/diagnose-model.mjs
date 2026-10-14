import { createRuntime, stateDir } from '../src/runtime.mjs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const runtime = await createRuntime();
const credentials = await runtime.getAuth('openai');
const response = await runtime.completeSimple(runtime.getModel('openai', 'gpt-6.1-sol'), {
  systemPrompt: 'Reply concisely.', messages: [{ role: 'user', content: 'Say OK.', timestamp: Date.now() }],
}, { reasoning: 'low', maxRetries: 0, signal: AbortSignal.timeout(45_000) });
let diagnostic = String(response.errorMessage ?? '');
if (credentials?.auth?.apiKey) diagnostic = diagnostic.split(credentials.auth.apiKey).join('[redacted]');
diagnostic = diagnostic.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
const result = { at: new Date().toISOString(), stopReason: response.stopReason, diagnostic: diagnostic.slice(0, 1200), usage: response.usage };
await writeFile(resolve(stateDir, 'model-diagnostic.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
