import crypto from 'node:crypto'; // default import: calls resolve crypto.timingSafeEqual at call time
import http from 'node:http';
import { assertShape } from '../contract.mjs';
export { createFileStore } from './store.mjs';
export { createGatewayClient, createGatewayRunner } from './client.mjs';

const DAY = 86_400_000;
const MAX_BODY = 1024 * 1024;
const sha = (s) => crypto.createHash('sha256').update(s).digest();
const hex = (s) => sha(s).toString('hex');
const has = (o, k) => Object.hasOwn(o, k);
// Price tables are micro-dollars per token (= dollars per million tokens); round up so we never undercharge.
const cost = (p, i, o) => Math.ceil(i * p.in + o * p.out);
const int = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

function texts(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => texts(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => texts(x, out));
  return out;
}

/*
 * Provider adapters (not implemented here; each is `call(body, {userId, apiKey}) => {output, usage}`):
 *  - OpenAI   POST https://api.openai.com/v1/responses        per-user field: safety_identifier (Realtime: OpenAI-Safety-Identifier header)
 *  - Anthropic POST https://api.anthropic.com/v1/messages     per-user field: metadata.user_id
 *  - OpenRouter POST https://openrouter.ai/api/v1/chat/completions   per-user field: user
 * The gateway only supplies an opaque userId; the adapter picks the field name.
 */
export function createGateway({ store, providers, clock = { now: () => Date.now() }, moderate, secret, adminSecret, termsVersion = '1', limits = {}, flagPolicy = {} }) {
  assertShape('store', store, ['load', 'save']);
  assertShape('clock', clock, ['now']);
  if (!providers || typeof providers !== 'object') throw new TypeError('providers: expected an object');
  if (typeof moderate !== 'function') throw new TypeError('moderate: expected a function');
  if (typeof secret !== 'string' || secret.length < 16) throw new TypeError('secret: expected a string of 16+ characters');
  if (typeof adminSecret !== 'string' || adminSecret.length < 16) throw new TypeError('adminSecret: expected a string of 16+ characters');
  const { rpm = 60, dailySpend = 5_000_000 } = limits;
  const { max: flagMax = 3, windowMs: flagWindow = 3_600_000 } = flagPolicy;

  let state;
  const ready = (async () => { state = (await store.load()) ?? { accounts: {}, ledger: [], idem: {}, audit: [] }; })();
  let chain = Promise.resolve();
  const locked = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; }; // serialises state changes
  const persist = () => store.save(state);
  const rate = new Map(); // accountId -> request timestamps (memory only)
  const held = new Map(); // accountId -> micro-dollars reserved by in-flight calls
  const pending = new Map(); // idempotency key -> in-flight promise
  const userIdOf = (id) => crypto.createHmac('sha256', secret).update(id).digest('hex');
  const R = (status, body, headers) => ({ status, body, headers });

  async function readJson(req) {
    const parts = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 }); parts.push(c); }
    try { const v = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch {}
    throw Object.assign(new Error('bad_json'), { status: 400 });
  }
  const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];

  function authUser(req) {
    const tok = bearer(req);
    if (!tok) return null;
    const id = tok.slice(0, Math.max(tok.indexOf('.'), 0));
    const acc = has(state.accounts, id) ? state.accounts[id] : null;
    const ok = crypto.timingSafeEqual(sha(tok), Buffer.from(acc?.tokenHash ?? '0'.repeat(64), 'hex'));
    return ok && acc ? acc : null;
  }
  const isAdmin = (req) => crypto.timingSafeEqual(sha(bearer(req) ?? ''), sha(adminSecret));

  const audit = (acc, e) => state.audit.push({ ts: clock.now(), accountId: acc.id, userId: userIdOf(acc.id), model: e.model, tokens: e.tokens, cost: e.cost, flagged: e.flagged, requestId: e.requestId });

  async function signup(req) {
    const b = await readJson(req);
    if (typeof b.email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(b.email)) return R(400, { error: 'invalid_email' });
    if (b.age18 !== true) return R(400, { error: 'age_required' });
    if (b.terms !== termsVersion) return R(400, { error: 'terms_required', termsVersion });
    return locked(async () => {
      if (Object.values(state.accounts).some((a) => a.email === b.email)) return R(409, { error: 'email_taken' });
      const id = 'acc_' + crypto.randomBytes(8).toString('hex');
      const token = `${id}.${crypto.randomBytes(24).toString('base64url')}`;
      state.accounts[id] = { id, email: b.email, tokenHash: hex(token), terms: b.terms, created: clock.now(), balance: 0, suspended: false, hold: false, flags: [], spend: { day: 0, amount: 0 } };
      await persist();
      return R(201, { accountId: id, token }); // the only time the token is shown
    });
  }

  async function chat(req, acc) {
    const now = clock.now();
    const win = (rate.get(acc.id) ?? []).filter((t) => t > now - 60_000);
    if (win.length >= rpm) return R(429, { error: 'rate_limited' }, { 'retry-after': String(Math.ceil((win[0] + 60_000 - now) / 1000)) });
    win.push(now); rate.set(acc.id, win);
    const body = await readJson(req);
    if (typeof body.provider !== 'string' || !has(providers, body.provider)) return R(400, { error: 'unknown_provider' });
    if (typeof body.model !== 'string' || !body.model) return R(400, { error: 'model_required' });
    const key = req.headers['idempotency-key'];
    if (!key) return execChat(req, acc, body, now);
    const k = `${acc.id}:${key}`;
    if (has(state.idem, k)) return R(state.idem[k].status, state.idem[k].body);
    if (pending.has(k)) return pending.get(k);
    const p = execChat(req, acc, body, now, k);
    pending.set(k, p);
    try { return await p; } finally { pending.delete(k); }
  }

  async function execChat(req, acc, body, now, idemKey) {
    const prov = providers[body.provider];
    const requestId = crypto.randomUUID();
    const rid = { 'x-request-id': requestId };
    const apiKey = req.headers['x-provider-key'] || undefined; // used for the call only; never stored or logged
    let verdict;
    try { verdict = await moderate(texts([body.messages, body.input, body.prompt]).join('\n')); } catch { return R(503, { error: 'moderation_unavailable' }, rid); } // fail closed
    if (verdict?.flagged) {
      await locked(async () => {
        acc.flags.push({ ts: now, categories: verdict.categories ?? [], requestId });
        if (acc.flags.filter((f) => f.ts > now - flagWindow).length >= flagMax) acc.suspended = true;
        audit(acc, { model: body.model, tokens: 0, cost: 0, flagged: true, requestId });
        await persist();
      });
      return R(400, { error: 'content_policy', requestId }, rid);
    }
    const price = prov.price?.[body.model];
    if (!apiKey && !price) return R(400, { error: 'unknown_model' }, rid);
    let reserve = 0;
    if (!apiKey) {
      const inTok = Math.ceil(JSON.stringify(body.messages ?? body.input ?? body.prompt ?? '').length / 4);
      reserve = cost(price, inTok, int(body.max_tokens) || 1024);
      const refused = await locked(() => {
        const day = Math.floor(now / DAY);
        if (acc.spend.day !== day) acc.spend = { day, amount: 0 };
        const h = held.get(acc.id) ?? 0;
        if (acc.balance - h < reserve) return R(402, { error: 'insufficient_credit', required: reserve, balance: acc.balance }, rid);
        if (acc.spend.amount + h + reserve > dailySpend) return R(429, { error: 'daily_spend_limit' }, { ...rid, 'retry-after': String(Math.ceil(((day + 1) * DAY - now) / 1000)) });
        held.set(acc.id, h + reserve);
      });
      if (refused) return refused;
    }
    const release = () => held.set(acc.id, (held.get(acc.id) ?? 0) - reserve);
    let out;
    try { out = await prov.call(body, { userId: userIdOf(acc.id), apiKey }); } catch { release(); return R(502, { error: 'provider_error' }, rid); } // never echo upstream text: it may hold the key
    const usage = { inputTokens: int(out?.usage?.inputTokens), outputTokens: int(out?.usage?.outputTokens) };
    return locked(async () => {
      release();
      const charge = apiKey ? 0 : Math.min(cost(price, usage.inputTokens, usage.outputTokens), reserve); // cap at reservation so balance never goes negative
      acc.balance -= charge;
      if (!apiKey) acc.spend.amount += charge;
      state.ledger.push({ ts: now, accountId: acc.id, type: apiKey ? 'own_key' : 'charge', amount: -charge, balance: acc.balance, requestId, key: idemKey ? idemKey.split(':').slice(1).join(':') : undefined });
      audit(acc, { model: body.model, tokens: usage.inputTokens + usage.outputTokens, cost: charge, flagged: false, requestId });
      const res = { requestId, output: out?.output, usage, cost: charge, balance: acc.balance };
      if (idemKey) state.idem[idemKey] = { ts: now, accountId: acc.id, status: 200, body: res }; // shortcut: grows until prune()
      await persist();
      return R(200, res, rid);
    });
  }

  async function admin(req, path) {
    if (req.method === 'GET' && path === '/v1/admin/flags') {
      return R(200, { flags: Object.values(state.accounts).filter((a) => a.flags.length).map((a) => ({ accountId: a.id, suspended: a.suspended, flags: a.flags })) });
    }
    if (req.method !== 'POST') return R(404, { error: 'not_found' });
    const b = await readJson(req);
    const acc = typeof b.accountId === 'string' && has(state.accounts, b.accountId) ? state.accounts[b.accountId] : null;
    if (!acc) return R(404, { error: 'unknown_account' });
    const set = (field, value) => locked(async () => { acc[field] = value; await persist(); return R(200, { accountId: acc.id, [field]: value }); });
    if (path === '/v1/admin/suspend') return set('suspended', true);
    if (path === '/v1/admin/unsuspend') { acc.flags = []; return set('suspended', false); }
    if (path === '/v1/admin/hold') return set('hold', b.hold !== false);
    if (path === '/v1/admin/credit') {
      if (!Number.isSafeInteger(b.amount) || b.amount <= 0) return R(400, { error: 'invalid_amount' });
      if (typeof b.key !== 'string' || !b.key) return R(400, { error: 'key_required' });
      return locked(async () => {
        const k = `admin:${b.key}`;
        if (has(state.idem, k)) return R(200, state.idem[k].body);
        acc.balance += b.amount;
        const res = { accountId: acc.id, balance: acc.balance };
        state.ledger.push({ ts: clock.now(), accountId: acc.id, type: 'grant', amount: b.amount, balance: acc.balance, key: b.key });
        state.idem[k] = { ts: clock.now(), accountId: acc.id, status: 200, body: res };
        await persist();
        return R(200, res);
      });
    }
    return R(404, { error: 'not_found' });
  }

  async function route(req) {
    await ready;
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'POST' && path === '/v1/accounts') return signup(req);
    if (path.startsWith('/v1/admin/')) return isAdmin(req) ? admin(req, path) : R(401, { error: 'unauthorized' });
    const acc = authUser(req);
    if (!acc) return R(401, { error: 'unauthorized' });
    if (acc.suspended) return R(403, { error: 'suspended' });
    if (req.method === 'GET' && path === '/v1/balance') return R(200, { balance: acc.balance });
    if (req.method === 'POST' && path === '/v1/chat') return chat(req, acc);
    return R(404, { error: 'not_found' });
  }

  async function handle(req, res) {
    let r;
    try { r = await route(req); } catch (e) { r = e?.status ? R(e.status, { error: e.message }) : R(500, { error: 'internal' }); }
    res.writeHead(r.status, { 'content-type': 'application/json', ...r.headers });
    res.end(JSON.stringify(r.body));
  }

  return {
    handle,
    listen: (port) => new Promise((resolve, reject) => {
      const server = http.createServer(handle);
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve(server));
    }),
    /** Retention: drop audit and idempotency records older than olderThanMs, except for accounts on hold. */
    async prune(olderThanMs) {
      await ready;
      return locked(async () => {
        const cutoff = clock.now() - olderThanMs;
        const keep = (e) => e.ts >= cutoff || state.accounts[e.accountId]?.hold;
        const before = state.audit.length;
        state.audit = state.audit.filter(keep);
        for (const [k, v] of Object.entries(state.idem)) if (!keep(v)) delete state.idem[k];
        await persist();
        return before - state.audit.length;
      });
    },
    async hold(accountId, on = true) {
      await ready;
      if (!has(state.accounts, accountId)) throw new TypeError('hold: unknown account');
      return locked(async () => { state.accounts[accountId].hold = on; await persist(); });
    },
  };
}
