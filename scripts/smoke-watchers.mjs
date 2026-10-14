import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createWatcher, OPENROUTER_MODELS } from '../src/watchers.mjs';
import { createBudgetLedger } from '../src/budget.mjs';
import { createRuntime, loadEnvironment, root, stateDir } from '../src/runtime.mjs';

// One availability call per provider, using only artificial code. Re-running
// intentionally consumes another permanent Jev reservation; never reset it.
const newOpenRouterKey = process.argv.includes('--new-openrouter-key');
let env = process.env;
if (newOpenRouterKey) {
  // Explicitly prefer the freshly edited repository key over inherited env.
  const parsed = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
  env = { OPENROUTER_API_KEY: parsed.OPENROUTER_API_KEY };
  if (!env.OPENROUTER_API_KEY) throw new Error('MISSING_CREDENTIAL');
  const receiptTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const name of ['watcher-smoke', 'openrouter-diagnosis']) {
    try { await copyFile(resolve(stateDir, `${name}.json`), resolve(stateDir, `${name}-${receiptTimestamp}.json`)); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('REPORT_ARCHIVE_FAILED'); }
  }
} else loadEnvironment();
const runtime = newOpenRouterKey ? null : await createRuntime();
const ledgerPath = resolve(stateDir, 'jev-budget.jsonl');
const state = {
  objective: 'Verify add(2, 3) returns 5. Verification already succeeded; there is no remaining action. Abstain.',
  latestEvidence: 'The artificial add function returned 5 for inputs 2 and 3. The requested check is complete.',
  candidates: [
    { id: 'add', path: 'artificial/add.mjs', description: 'Artificial addition function', excerpt: 'export const add = (a, b) => a + b;' },
    { id: 'upper', path: 'artificial/upper.mjs', description: 'Artificial uppercase helper', excerpt: 'export const upper = (text) => text.toUpperCase();' },
  ],
  recentActions: ['Executed add(2, 3)', 'Observed expected value 5'],
};
const results = [];
const reportPath = resolve(stateDir, newOpenRouterKey ? 'watcher-smoke-new-key.json' : 'watcher-smoke.json');
async function save() {
  const report = { timestamp: new Date().toISOString(), expectedDecision: 'abstain',
    ...(newOpenRouterKey ? { credentialsSource: 'fresh repository .env', routing: 'free model IDs; max_price zero; allow_fallbacks false',
      priorProbeInterpretation: 'Key changed during earlier probes; routing comparison was confounded.' } : {}),
    results, jevBudget: await createBudgetLedger(ledgerPath).snapshot() };
  await mkdir(stateDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
for (const kind of newOpenRouterKey ? OPENROUTER_MODELS : ['luna', 'jev', ...OPENROUTER_MODELS]) {
  const maxAttempts = newOpenRouterKey ? 3 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const result = await createWatcher({ kind, runtime, ledgerPath, timeoutMs: 45000, env })(state);
  const safe = { kind, provider: result.provider, model: result.model, status: result.status,
    selectedId: result.selectedId, usage: result.usage, costUsd: result.costUsd,
    latencyMs: result.latencyMs, ...(result.errorCode ? { errorCode: result.errorCode } : {}) };
  results.push({ ...safe, attempt });
  await save();
  console.log(JSON.stringify(safe));
  if (result.errorCode !== 'HTTP_429' || attempt === maxAttempts) break;
  await delay(attempt === 1 ? 5000 : 15000);
  }
}
await save();
