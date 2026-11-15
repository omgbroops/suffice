const ZERO = () => ({ inputTokens: 0, outputTokens: 0 });

/** Desktop-side client. fetch is injected so tests need no network. */
export function createGatewayClient({ baseUrl, token, fetch = globalThis.fetch }) {
  if (typeof baseUrl !== 'string' || !baseUrl) throw new TypeError('createGatewayClient: baseUrl must be a non-empty string');
  if (typeof token !== 'string' || !token) throw new TypeError('createGatewayClient: token must be a non-empty string');
  if (typeof fetch !== 'function') throw new TypeError('createGatewayClient: fetch must be a function');
  async function call(method, path, body, headers = {}) {
    const r = await fetch(baseUrl + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error ?? `http ${r.status}`), { status: r.status, body: j, retryAfter: r.headers.get('retry-after') });
    return j;
  }
  return {
    chat(body, { providerKey, idempotencyKey } = {}) {
      const h = {};
      if (providerKey) h['x-provider-key'] = providerKey;
      if (idempotencyKey) h['idempotency-key'] = idempotencyKey;
      return call('POST', '/v1/chat', body, h);
    },
    balance: () => call('GET', '/v1/balance'),
  };
}

/** Runner (contract.mjs) that sends AgentRequests through the gateway. */
export function createGatewayRunner({ client, provider, model, clock = { now: () => Date.now() } }) {
  if (!client || typeof client.chat !== 'function') throw new TypeError('createGatewayRunner: client.chat must be a function');
  if (typeof provider !== 'string' || !provider) throw new TypeError('createGatewayRunner: provider must be a non-empty string');
  return {
    async run(req) {
      if (!req || typeof req.prompt !== 'string') throw new TypeError('runner.run: prompt must be a string');
      const t0 = clock.now();
      const ms = () => clock.now() - t0;
      try {
        const r = await client.chat({ provider, model: req.model ?? model, messages: [{ role: 'user', content: req.prompt }] });
        const text = typeof r.output === 'string' ? r.output : String(r.output?.text ?? '');
        const out = { ok: true, text, usage: { ...ZERO(), ...r.usage }, ms: ms() };
        if (req.schema) {
          try { out.value = JSON.parse(text); } catch { return { ...out, ok: false, error: 'result is not valid JSON' }; }
        }
        return out;
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), usage: ZERO(), ms: ms() };
      }
    },
  };
}
