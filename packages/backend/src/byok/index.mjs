import { assertShape } from '../contract.mjs';
import { validate } from './schema.mjs';

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

/** Replaces the secrets (exact, URL-encoded, and any 8+ char leading/trailing fragment) and Bearer tokens in text. */
export function redact(text, ...secrets) {
  let s = String(text);
  for (const k of secrets) {
    if (!k) continue;
    s = s.split(k).join('[redacted]');
    const enc = encodeURIComponent(k);
    if (enc !== k) s = s.split(enc).join('[redacted]');
    for (let n = k.length - 1; n >= 8; n--) for (const frag of [k.slice(0, n), k.slice(k.length - n)]) s = s.split(frag).join('[redacted]');
  }
  return s.replace(/(Bearer\s+)[^\s"']+/gi, '$1[redacted]');
}

const errText = (m) => {
  if (typeof m === 'string') return m;
  try { return JSON.stringify(m)?.slice(0, 200) ?? ''; } catch { return ''; }
};
const isLoopback = (h) => h === 'localhost' || h === '[::1]' || /^127(\.\d{1,3}){3}$/.test(h);
/** Parses and vets a custom base URL; returns it without trailing slashes. */
function vetBase(baseUrl) {
  let u;
  try { u = new URL(baseUrl); } catch { throw new TypeError('baseUrl must be a valid URL'); }
  if (u.username || u.password) throw new TypeError('baseUrl must not contain credentials');
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && isLoopback(u.hostname)))) throw new TypeError('baseUrl must be https (http only for loopback hosts)');
  return u.href.replace(/[?#].*$/, '').replace(/\/+$/, '');
}

const checkProvider = (p) => { if (!PROVIDERS.includes(p)) throw new TypeError(`provider must be one of ${PROVIDERS.join(', ')}`); };

export function createByok({ fetch = globalThis.fetch, vault, clock, budget, sleep = (ms, signal) => new Promise((r) => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); }), maxRetryWaitMs = 30000 } = {}) {
  assertShape('vault', vault, ['seal', 'open', 'put', 'get', 'list', 'delete']);
  assertShape('clock', clock, ['now']);
  if (typeof fetch !== 'function') throw new TypeError('fetch must be a function');
  if (budget) assertShape('budget', budget, ['reserve']);

  const keys = {
    set(provider, key, { baseUrl } = {}) {
      checkProvider(provider);
      if (typeof key !== 'string' || !key.trim()) throw new TypeError('key must be a non-empty string');
      const origin = provider === 'openai-compatible' && baseUrl ? new URL(vetBase(baseUrl)).origin : undefined;
      vault.put(vault.seal(KIND, provider, { key: key.trim(), ...(origin && { origin }) }));
    },
    has: (provider) => vault.get(KIND, provider) !== undefined,
    remove: (provider) => vault.delete(KIND, provider),
    list: () => vault.list(KIND).map((x) => x.id),
  };
  const keyOf = (provider) => { const d = vault.get(KIND, provider); return d ? vault.open(d).payload : undefined; };
  const wrongOrigin = (stored, base) => stored?.origin && new URL(base).origin !== stored.origin;

  function target(provider, baseUrl) {
    checkProvider(provider);
    if (provider !== 'openai-compatible') return BASES[provider];
    if (!baseUrl) throw new TypeError('openai-compatible needs { baseUrl }');
    return vetBase(baseUrl);
  }
  const headers = (provider, key) => provider === 'anthropic'
    ? { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' }
    : { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

  const nap = async (ms, signal) => {
    if (signal?.aborted) return false;
    let off;
    const ab = new Promise((r) => { off = r; signal?.addEventListener('abort', off, { once: true }); });
    try { await Promise.race([sleep(ms, signal), ab]); } finally { signal?.removeEventListener('abort', off); }
    return !signal?.aborted;
  };

  /** fetch with retry on 429, 503/529 and pre-response network errors; returns {res|error, spent, attempts}. Errors are redacted. */
  async function send(url, init, key, signal, usageOf = () => null) {
    let last = 'request failed', attempts = 0;
    const spent = ZERO();
    const done = (o) => ({ ...o, spent, attempts });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (signal?.aborted) return done({ error: 'aborted' });
      let wait = 500 * 2 ** i;
      attempts++;
      try {
        const res = await fetch(url, { ...init, redirect: 'error', signal });
        if (res.ok) return done({ res });
        const body = await res.json().catch(() => ({}));
        const u = usageOf(body?.usage);
        if (u) { spent.inputTokens += u.inputTokens; spent.outputTokens += u.outputTokens; }
        const msg = errText(body?.error?.message ?? (typeof body?.error === 'string' ? body.error : ''));
        last = `http ${res.status}${msg ? `: ${msg}` : ''}`;
        if (res.status !== 429 && res.status !== 503 && res.status !== 529) return done({ error: redact(last, key) });
        const ra = parseFloat(res.headers?.get?.('retry-after'));
        if (Number.isFinite(ra) && ra >= 0) {
          wait = ra * 1000;
          if (wait > maxRetryWaitMs) return done({ error: redact(`rate limited, retry after ${Math.ceil(ra)} s`, key) });
        }
      } catch (e) { // fetch only rejects before response headers, so a retry cannot double-run a request
        if (signal?.aborted) return done({ error: 'aborted' });
        last = e instanceof Error ? e.message : String(e);
        if (/redirect/i.test(last)) return done({ error: redact(last, key) });
      }
      if (i < MAX_ATTEMPTS - 1 && !(await nap(wait, signal))) return done({ error: 'aborted' });
    }
    return done({ error: redact(last, key) });
  }

  function runner({ provider, model, maxTokens = 4096, system, baseUrl } = {}) {
    const base = target(provider, baseUrl);
    return {
      async run(req) {
        if (!req || typeof req.prompt !== 'string') throw new TypeError('runner.run: prompt must be a string');
        const t0 = clock.now(), ms = () => clock.now() - t0;
        const fail = (error) => ({ ok: false, error, usage: ZERO(), ms: ms() });
        const stored = keyOf(provider), key = stored?.key;
        if (!key) return fail(`no API key set for ${provider}`);
        if (wrongOrigin(stored, base)) return fail(`key for ${provider} is bound to a different origin than baseUrl`);
        const mdl = req.model ?? model;
        if (!mdl) return fail('no model given');

        let hold;
        const est = Math.ceil((req.prompt.length + (system?.length ?? 0)) / 4) + maxTokens;
        if (budget) {
          hold = budget.reserve(est);
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
          const usageOf = (u) => (u && typeof u === 'object' ? (anth ? { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 }
            : { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 }) : null);
          const { res, error, spent } = await send(`${base}${anth ? '/v1/messages' : '/chat/completions'}`,
            { method: 'POST', headers: headers(provider, key), body: JSON.stringify(body) }, key, req.signal, usageOf);
          const earlier = spent.inputTokens + spent.outputTokens > 0;
          if (error) {
            if (earlier) { try { hold?.settle(spent); } catch { /* budget broken: still release below */ } }
            hold?.release();
            return { ...fail(error), ...(earlier && { usage: spent }) };
          }
          const j = await res.json().catch(() => null);
          if (!j) { hold?.release(); return fail('provider returned invalid JSON'); }
          const got = usageOf(j.usage);
          const usage = got ? { inputTokens: got.inputTokens + spent.inputTokens, outputTokens: got.outputTokens + spent.outputTokens }
            : { inputTokens: est, outputTokens: 0 };
          let budgetError;
          try { hold?.settle(usage); } catch (e) { budgetError = redact(errText(e instanceof Error ? e.message : e), key); hold?.release(); }
          let text, value;
          if (anth) {
            text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
            value = (j.content ?? []).find((b) => b.type === 'tool_use')?.input;
          } else text = j.choices?.[0]?.message?.content ?? '';
          const out = { ok: true, text, usage, ms: ms(), ...(got ? {} : { usageEstimated: true }), ...(budgetError && { budgetError }) };
          if (!req.schema) return out;
          if (value === undefined) { try { value = JSON.parse(text); } catch { return { ...out, ok: false, error: 'result is not valid JSON' }; } }
          const errs = validate(req.schema, value);
          if (errs.length) return { ...out, ok: false, error: `result failed schema: ${errs.join('; ')}` };
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
    checkProvider(provider);
    if (!keyOf(provider)) return { ok: false, error: `no API key set for ${provider}` };
    const base = target(provider, baseUrl);
    const stored = keyOf(provider), key = stored?.key;
    if (!key) return { ok: false, error: `no API key set for ${provider}` };
    if (wrongOrigin(stored, base)) return { ok: false, error: `key for ${provider} is bound to a different origin than baseUrl` };
    const url = provider === 'anthropic' ? `${base}/v1/models?limit=1` : provider === 'openrouter' ? `${base}/models/user` : `${base}/models`;
    const { error } = await send(url, { method: 'GET', headers: headers(provider, key) }, key, signal);
    return error ? { ok: false, error } : { ok: true };
  }

  return { keys, runner, test };
}
