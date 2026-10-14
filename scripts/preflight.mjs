import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRuntime, loadEnvironment, stateDir } from '../src/runtime.mjs';

loadEnvironment();
const runtime = await createRuntime();
const requested = ['gpt-6.1-sol', 'gpt-6-luna'];
const report = { at: new Date().toISOString(), pi: '1.2.0', subscription: runtime.isUsingSubscription('openai'), models: [] };
for (const id of requested) {
  const model = runtime.getModel('openai', id);
  report.models.push({ id, catalogPresent: !!model, api: model?.api, cost: model?.cost });
}
if (report.subscription) {
  const credentials = await runtime.getAuth('openai');
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${credentials.auth.apiKey}` }, signal: AbortSignal.timeout(30_000),
  });
  report.accountCatalogStatus = response.status;
  if (response.ok) {
    const body = await response.json();
    report.accountModels = (body.models ?? body.data ?? []).filter(m => requested.includes(m.slug ?? m.id)).map(m => ({ id: m.slug ?? m.id, name: m.display_name, visibility: m.visibility }));
  }
}
const routerResponse = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(30_000) });
report.openrouterStatus = routerResponse.status;
if (routerResponse.ok) {
  const { data } = await routerResponse.json();
  const wanted = ['google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-lightning:free', 'nvidia/nemotron-3-super-120b-a12b:free'];
  report.openrouterModels = wanted.map(id => {
    const model = data.find(m => m.id === id);
    return { id, available: !!model, pricing: model?.pricing, contextLength: model?.context_length };
  });
}
await mkdir(stateDir, { recursive: true });
await writeFile(resolve(stateDir, 'preflight.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
