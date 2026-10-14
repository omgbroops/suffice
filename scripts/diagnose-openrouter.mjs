import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvironment, stateDir } from '../src/runtime.mjs';
import { OPENROUTER_MODELS } from '../src/watchers.mjs';

loadEnvironment();
const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('MISSING_CREDENTIAL');
const secrets = [key, process.env.JEV_API_KEY].filter(Boolean);
function redact(value) {
  let text = String(value ?? '');
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text.replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-|eyJ)[A-Za-z0-9_.-]{8,}\b/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[REDACTED]').slice(0, 500);
}
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const catalogResponse = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(45000), redirect: 'error' });
if (!catalogResponse.ok) throw new Error('CATALOG_UNAVAILABLE');
const catalog = await catalogResponse.json();
const firstModel = OPENROUTER_MODELS[0];
const metadata = catalog.data?.find((entry) => entry.id === firstModel);
if (!metadata || metadata.pricing?.prompt !== '0' || metadata.pricing?.completion !== '0') throw new Error('PRICING_UNKNOWN');
const reportPath = resolve(stateDir, 'openrouter-diagnosis.json');
let results = [];
try { results = JSON.parse(await readFile(reportPath, 'utf8')).results; }
catch (error) { if (error.code !== 'ENOENT') throw new Error('DIAGNOSIS_REPORT_UNREADABLE'); }
if (!Array.isArray(results) || results.length > 5) throw new Error('DIAGNOSIS_REPORT_INVALID');
async function probe(name, model, extra = {}) {
  const existing = results.find((entry) => entry.probe === name && entry.model === model);
  if (existing) return existing.status >= 200 && existing.status < 300;
  if (results.length >= 5) throw new Error('PROBE_LIMIT_REACHED');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 16, ...extra }),
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  const raw = body.error?.metadata?.raw;
  let upstream;
  try { upstream = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { upstream = null; }
  const safe = { probe: name, model, status: response.status,
    ...(body.error ? { error: { code: redact(body.error.code), message: redact(body.error.message),
      provider: redact(body.error.metadata?.provider_name),
      ...(upstream?.error ? { upstreamCode: redact(upstream.error.code), upstreamMessage: redact(upstream.error.message) } : {}) } } : {}),
    ...(body.choices ? { hasText: typeof body.choices[0]?.message?.content === 'string',
      finishReason: redact(body.choices[0]?.finish_reason) } : {}),
    ...(typeof body.usage?.cost === 'number' ? { costUsd: body.usage.cost } : {}) };
  results.push(safe);
  await mkdir(stateDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(safe));
  if (typeof body.usage?.cost === 'number' && body.usage.cost > 0) throw new Error('UNEXPECTED_CHARGE');
  return response.ok;
}

// Exact :free models only; no model list or paid fallback is supplied.
const minimalWorks = await probe('minimal', firstModel, { provider: { allow_fallbacks: false } });
if (minimalWorks) {
  await probe('price-filter', firstModel, { provider: { max_price: { prompt: 0, completion: 0 }, allow_fallbacks: false } });
  await probe('full-watcher-options', firstModel, { temperature: 0, reasoning: { enabled: false },
    provider: { max_price: { prompt: 0, completion: 0 }, allow_fallbacks: false } });
} else {
  for (const model of OPENROUTER_MODELS.slice(1)) {
    const entry = catalog.data?.find((candidate) => candidate.id === model);
    if (entry?.pricing?.prompt === '0' && entry?.pricing?.completion === '0') await probe('minimal-other-model', model, { provider: { allow_fallbacks: false } });
  }
}
if (!minimalWorks) {
  await probe('minimal-without-provider-filter', firstModel);
  await probe('minimal-with-only-price-filter', firstModel, { provider: { max_price: { prompt: 0, completion: 0 } } });
}
await mkdir(stateDir, { recursive: true });
await writeFile(reportPath, `${JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)}\n`, { mode: 0o600 });
