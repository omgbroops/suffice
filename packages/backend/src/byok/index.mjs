import { assertShape } from '../contract.mjs';

// Docs confirmed 2026-11-15:
// anthropic  POST /v1/messages, x-api-key + anthropic-version; https://platform.claude.com/docs/en/api/versioning , /docs/en/api/models-list , /docs/en/build-with-claude/structured-outputs
// openai     Chat Completions POST /v1/chat/completions, Bearer; https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create , .../models/methods/list
// openrouter Chat Completions at https://openrouter.ai/api/v1, Bearer; https://openrouter.ai/docs/api-reference/overview , /docs/api-reference/list-available-models
const ANTHROPIC_VERSION = '2026-10-21';
const BASES = { anthropic: 'https://api.anthropic.com', openai: 'https://api.openai.com/v1', openrouter: 'https://openrouter.ai/api/v1' };
const PROVIDERS = [...Object.keys(BASES), 'openai-compatible'];
const KIND = 'byok';
const ZERO = () => ({ inputTokens: 0, outputTokens: 0 });
const MAX_ATTEMPTS = 3;

/** Replaces every occurrence of the given secrets (and Bearer tokens) in text. */
export function redact(text, ...secrets) {
  let s = String(text);
  for (const k of secrets) if (k) s = s.split(k).join('[redacted]');
  return s.replace(/(Bearer\s+)[^\s"']+/gi, '$1[redacted]');
}

const checkProvider = (p) => { if (!PROVIDERS.includes(p)) throw new TypeError(`provider must be one of ${PROVIDERS.join(', ')}`); };

export function createByok({ fetch = globalThis.fetch, vault, clock, budget, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  assertShape('vault', vault, ['seal', 'open', 'put', 'get', 'list', 'delete']);
  assertShape('clock', clock, ['now']);
  if (typeof fetch !== 'function') throw new TypeError('fetch must be a function');
  if (budget) assertShape('budget', budget, ['reserve']);

  const keys = {
    set(provider, key) {
      checkProvider(provider);
      if (typeof key !== 'string' || !key.trim()) throw new TypeError('key must be a non-empty string');
      vault.put(vault.seal(KIND, provider, { key: key.trim() }));
    },
    has: (provider) => vault.get(KIND, provider) !== undefined,
    remove: (provider) => vault.delete(KIND, provider),
    list: () => vault.list(KIND).map((x) => x.id),
  };
  const keyOf = (provider) => { const d = vault.get(KIND, provider); return d ? vault.open(d).payload.key : undefined; };

  function target(provider, baseUrl) {
    checkProvider(provider);
    const base = (provider === 'openai-compatible' ? baseUrl : BASES[provider])?.replace(/\/+$/, '');
    if (!base) throw new TypeError('openai-compatible needs { baseUrl }');
    return base;
  }
  const headers = (provider, key) => provider === 'anthropic'
    ? { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' }
    : { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

  /** fetch with retry on 429/5xx/network; returns {res} or {error}. Errors are redacted. */
  async function send(url, init, key, signal) {
    let last = 'request failed';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (signal?.aborted) return { error: 'aborted' };
      let wait = 500 * 2 ** i;
      try {
        const res = await fetch(url, { ...init, signal });
        if (res.ok) return { res };
        const body = await res.json().catch(() => ({}));
        const msg = body?.error?.message ?? (typeof body?.error === 'string' ? body.error : '');
        last = `http ${res.status}${msg ? `: ${msg}` : ''}`;
        if (res.status !== 429 && res.status < 500) return { error: redact(last, key) };
        const ra = parseFloat(res.headers?.get?.('retry-after'));
        if (Number.isFinite(ra) && ra >= 0) wait = ra * 1000;
      } catch (e) {
        if (signal?.aborted) return { error: 'aborted' };
        last = e instanceof Error ? e.message : String(e);
      }
      if (i < MAX_ATTEMPTS - 1) await sleep(wait);
    }
    return { error: redact(last, key) };
  }

  const missing = (schema, v) => (schema?.required ?? []).filter((k) => !v || typeof v !== 'object' || !(k in v));

  function runner({ provider, model, maxTokens = 4096, system, baseUrl } = {}) {
    const base = target(provider, baseUrl);
    return {
      async run(req) {
        if (!req || typeof req.prompt !== 'string') throw new TypeError('runner.run: prompt must be a string');
        const t0 = clock.now(), ms = () => clock.now() - t0;
        const fail = (error) => ({ ok: false, error, usage: ZERO(), ms: ms() });
        const key = keyOf(provider);
        if (!key) return fail(`no API key set for ${provider}`);
        const mdl = req.model ?? model;
        if (!mdl) return fail('no model given');

        let hold;
        if (budget) {
          hold = budget.reserve(Math.ceil((req.prompt.length + (system?.length ?? 0)) / 4) + maxTokens);
          if (!hold.allow) return fail(hold.reason ?? 'budget denied');
        }
        try {
          const anth = provider === 'anthropic';
          const body = anth
            ? { model: mdl, max_tokens: maxTokens, messages: [{ role: 'user', content: req.prompt }],
                ...(system && { system }),
                ...(req.schema && { tools: [{ name: 'result', description: 'Return the result.', input_schema: req.schema }], tool_choice: { type: 'tool', name: 'result' } }) }
            : { model: mdl, [provider === 'openai' ? 'max_completion_tokens' : 'max_tokens']: maxTokens,
                messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: req.prompt }],
                ...(req.schema && { response_format: { type: 'json_schema', json_schema: { name: 'result', schema: req.schema } } }) };
          const { res, error } = await send(`${base}${anth ? '/v1/messages' : '/chat/completions'}`,
            { method: 'POST', headers: headers(provider, key), body: JSON.stringify(body) }, key, req.signal);
          if (error) { hold?.release(); return fail(error); }
          const j = await res.json().catch(() => null);
          if (!j) { hold?.release(); return fail('provider returned invalid JSON'); }
          const u = j.usage ?? {};
          const usage = anth ? { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 }
            : { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
          hold?.settle(usage);
          let text, value;
          if (anth) {
            text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
            value = (j.content ?? []).find((b) => b.type === 'tool_use')?.input;
          } else text = j.choices?.[0]?.message?.content ?? '';
          const out = { ok: true, text, usage, ms: ms() };
          if (!req.schema) return out;
          if (value === undefined) { try { value = JSON.parse(text); } catch { return { ...out, ok: false, error: 'result is not valid JSON' }; } }
          const miss = missing(req.schema, value);
          if (miss.length) return { ...out, ok: false, error: `result is missing required keys: ${miss.join(', ')}` };
          return { ...out, value };
        } catch (e) {
          hold?.release(); // no-op after settle
          return fail(redact(e instanceof Error ? e.message : String(e), key));
        }
      },
    };
  }

  /** Cheapest validity check: GET the models list. */
  async function test(provider, { baseUrl, signal } = {}) {
    const base = target(provider, baseUrl);
    const key = keyOf(provider);
    if (!key) return { ok: false, error: `no API key set for ${provider}` };
    const url = provider === 'anthropic' ? `${base}/v1/models?limit=1` : provider === 'openrouter' ? `${base}/models/user` : `${base}/models`;
    const { error } = await send(url, { method: 'GET', headers: headers(provider, key) }, key, signal);
    return error ? { ok: false, error } : { ok: true };
  }

  return { keys, runner, test };
}
