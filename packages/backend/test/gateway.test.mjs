import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGateway, createFileStore, createGatewayClient, createGatewayRunner } from '../src/gateway/index.mjs';

const SECRET = 'gateway-secret-0123456789';
const ADMIN = 'admin-secret-0123456789ab';
const TERMS = '2026-11-15';

async function boot(t, opts = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const time = { t: 1_000_000 };
  const calls = [];
  const providers = {
    fake: {
      price: { m: { in: 1, out: 2 } }, // micro-dollars per token
      async call(body, ctx) {
        calls.push({ body, ctx });
        return opts.reply ?? { output: { text: 'hi' }, usage: { inputTokens: 100, outputTokens: 50 } };
      },
    },
  };
  const moderate = async (text) => (text.includes('BADWORD') ? { flagged: true, categories: ['x'] } : { flagged: false, categories: [] });
  const gw = createGateway({ store: createFileStore(file), providers, clock: { now: () => time.t }, moderate, secret: SECRET, adminSecret: ADMIN, termsVersion: TERMS, ...opts.gw });
  const server = await gw.listen(0);
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, { method = 'POST', token, body, headers = {} } = {}) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
  };
  const signup = async (email = 'a@example.com') => {
    const r = await call('/v1/accounts', { body: { email, age18: true, terms: TERMS } });
    assert.equal(r.status, 201);
    return r.json;
  };
  const grant = (accountId, amount, key) => call('/v1/admin/credit', { token: ADMIN, body: { accountId, amount, key } });
  const chat = (token, extra = {}, headers = {}) => call('/v1/chat', { token, headers, body: { provider: 'fake', model: 'm', messages: [{ role: 'user', content: 'hello' }], max_tokens: 100, ...extra } });
  return { gw, base, call, signup, grant, chat, file, time, calls, providers };
}

test('auth: missing or wrong token is 401', async (t) => {
  const g = await boot(t);
  const a = await g.signup();
  assert.equal((await g.call('/v1/balance', { method: 'GET' })).status, 401);
  assert.equal((await g.call('/v1/balance', { method: 'GET', token: a.token + 'x' })).status, 401);
  assert.equal((await g.call('/v1/balance', { method: 'GET', token: 'nope' })).status, 401);
  const ok = await g.call('/v1/balance', { method: 'GET', token: a.token });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.balance, 0);
});

test('signup refuses under-18 and missing terms; token stored only as hash', async (t) => {
  const g = await boot(t);
  assert.equal((await g.call('/v1/accounts', { body: { email: 'a@example.com', age18: false, terms: TERMS } })).status, 400);
  assert.equal((await g.call('/v1/accounts', { body: { email: 'a@example.com', terms: TERMS } })).status, 400);
  assert.equal((await g.call('/v1/accounts', { body: { email: 'a@example.com', age18: true } })).status, 400);
  assert.equal((await g.call('/v1/accounts', { body: { email: 'a@example.com', age18: true, terms: 'old' } })).status, 400);
  const a = await g.signup();
  const disk = await fs.readFile(g.file, 'utf8');
  assert.ok(!disk.includes(a.token));
  assert.ok(disk.includes(crypto.createHash('sha256').update(a.token).digest('hex')));
  assert.equal((await g.call('/v1/accounts', { body: { email: 'a@example.com', age18: true, terms: TERMS } })).status, 409);
});

test('credits: 402 when unfunded, settlement from usage, never negative, ledger', async (t) => {
  const g = await boot(t);
  const a = await g.signup();
  assert.equal((await g.chat(a.token)).status, 402);
  assert.equal(g.calls.length, 0);
  assert.equal((await g.call('/v1/admin/credit', { token: 'wrong', body: { accountId: a.accountId, amount: 5, key: 'k' } })).status, 401);
  assert.equal((await g.grant(a.accountId, 1000, 'g1')).status, 200);
  const r = await g.chat(a.token);
  assert.equal(r.status, 200);
  assert.equal(r.json.cost, 200); // 100*1 + 50*2
  assert.equal(r.json.balance, 800);
  const disk = JSON.parse(await fs.readFile(g.file, 'utf8'));
  assert.deepEqual(disk.ledger.map((e) => [e.type, e.amount]), [['grant', 1000], ['charge', -200]]);
  // estimate for "hello" + max_tokens 10 is small; a huge reported usage is capped at the reservation
  const g2 = await boot(t, { reply: { output: { text: 'x' }, usage: { inputTokens: 1e6, outputTokens: 1e6 } } });
  const b = await g2.signup();
  await g2.grant(b.accountId, 100, 'g');
  const r2 = await g2.chat(b.token, { max_tokens: 10 });
  assert.equal(r2.status, 200);
  assert.ok(r2.json.balance >= 0);
});

test('idempotent retry does not charge twice; admin grant is idempotent', async (t) => {
  const g = await boot(t);
  const a = await g.signup();
  await g.grant(a.accountId, 500, 'g1');
  await g.grant(a.accountId, 500, 'g1');
  const h = { 'idempotency-key': 'req-1' };
  const r1 = await g.chat(a.token, {}, h);
  const r2 = await g.chat(a.token, {}, h);
  assert.equal(r1.status, 200);
  assert.deepEqual(r2.json, r1.json);
  assert.equal(g.calls.length, 1);
  assert.equal((await g.call('/v1/balance', { method: 'GET', token: a.token })).json.balance, 500 - 200);
});

test('rate limit and daily spend limit return 429 with Retry-After', async (t) => {
  const g = await boot(t, { gw: { limits: { rpm: 2, dailySpend: 1_000_000 } } });
  const a = await g.signup();
  await g.grant(a.accountId, 100000, 'g');
  assert.equal((await g.chat(a.token)).status, 200);
  assert.equal((await g.chat(a.token)).status, 200);
  const r = await g.chat(a.token);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) >= 1);
  g.time.t += 61_000;
  assert.equal((await g.chat(a.token)).status, 200);

  const s = await boot(t, { gw: { limits: { rpm: 100, dailySpend: 450 } } });
  const b = await s.signup();
  await s.grant(b.accountId, 100000, 'g');
  assert.equal((await s.chat(b.token)).status, 200); // 200 spent
  assert.equal((await s.chat(b.token)).status, 200); // 400 spent
  const over = await s.chat(b.token);
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get('retry-after')) >= 1);
  s.time.t += 86_400_000;
  assert.equal((await s.chat(b.token)).status, 200);
});

test('per-user id: stable, distinct per account, HMAC, hides account id', async (t) => {
  const g = await boot(t);
  const a = await g.signup('a@example.com');
  const b = await g.signup('b@example.com');
  await g.grant(a.accountId, 10000, 'a');
  await g.grant(b.accountId, 10000, 'b');
  await g.chat(a.token); await g.chat(a.token); await g.chat(b.token);
  const [u1, u2, u3] = g.calls.map((c) => c.ctx.userId);
  assert.equal(u1, u2);
  assert.notEqual(u1, u3);
  assert.equal(u1, crypto.createHmac('sha256', SECRET).update(a.accountId).digest('hex'));
  assert.ok(!u1.includes(a.accountId));
  assert.ok(u1.length <= 128);
});

test('own key: never stored, no credits, zero ledger entry, passed to provider', async (t) => {
  const g = await boot(t);
  const a = await g.signup();
  const KEY = 'sk-user-own-key-SENTINEL-123';
  const r = await g.chat(a.token, {}, { 'x-provider-key': KEY });
  assert.equal(r.status, 200);
  assert.equal(r.json.cost, 0);
  assert.equal(g.calls[0].ctx.apiKey, KEY);
  const disk = await fs.readFile(g.file, 'utf8');
  assert.ok(!disk.includes(KEY));
  assert.ok(!JSON.stringify(r.json).includes(KEY));
  const led = JSON.parse(disk).ledger;
  assert.deepEqual(led.map((e) => [e.type, e.amount]), [['own_key', 0]]);
  assert.equal((await g.call('/v1/balance', { method: 'GET', token: a.token })).json.balance, 0);
});

test('moderation refuses, counts, auto-suspends; admin lists flags and unsuspends', async (t) => {
  const g = await boot(t, { gw: { flagPolicy: { max: 2, windowMs: 3600_000 } } });
  const a = await g.signup();
  await g.grant(a.accountId, 10000, 'g');
  const bad = { messages: [{ role: 'user', content: 'BADWORD please' }] };
  const r1 = await g.chat(a.token, bad);
  assert.equal(r1.status, 400);
  assert.equal(r1.json.error, 'content_policy');
  assert.equal((await g.chat(a.token, bad)).status, 400);
  assert.equal(g.calls.length, 0);
  assert.equal((await g.chat(a.token)).status, 403);
  assert.equal((await g.call('/v1/balance', { method: 'GET', token: a.token })).status, 403);
  const flags = await g.call('/v1/admin/flags', { method: 'GET', token: ADMIN });
  assert.equal(flags.json.flags[0].accountId, a.accountId);
  assert.equal(flags.json.flags[0].flags.length, 2);
  assert.equal((await g.call('/v1/admin/unsuspend', { token: ADMIN, body: { accountId: a.accountId } })).status, 200);
  assert.equal((await g.chat(a.token)).status, 200);
  await g.call('/v1/admin/suspend', { token: ADMIN, body: { accountId: a.accountId } });
  assert.equal((await g.chat(a.token)).status, 403);
});

test('flags outside the window do not suspend', async (t) => {
  const g = await boot(t, { gw: { flagPolicy: { max: 2, windowMs: 1000 } } });
  const a = await g.signup();
  const bad = { messages: [{ role: 'user', content: 'BADWORD' }] };
  await g.chat(a.token, bad);
  g.time.t += 5000;
  await g.chat(a.token, bad);
  await g.grant(a.accountId, 1000, 'g');
  assert.equal((await g.chat(a.token)).status, 200);
});

test('audit log has fields and no prompt text', async (t) => {
  const g = await boot(t);
  const a = await g.signup();
  await g.grant(a.accountId, 10000, 'g');
  await g.chat(a.token, { messages: [{ role: 'user', content: 'PROMPTMARKER-7781 hello' }] });
  await g.chat(a.token, { messages: [{ role: 'user', content: 'PROMPTMARKER-9 BADWORD' }] });
  const disk = await fs.readFile(g.file, 'utf8');
  assert.ok(!disk.includes('PROMPTMARKER'));
  const { audit } = JSON.parse(disk);
  assert.equal(audit.length, 2);
  assert.deepEqual(Object.keys(audit[0]).sort(), ['accountId', 'cost', 'flagged', 'model', 'requestId', 'tokens', 'ts', 'userId']);
  assert.equal(audit[0].tokens, 150);
  assert.equal(audit[0].cost, 200);
  assert.equal(audit[1].flagged, true);
});

test('prune removes old audit entries except held accounts', async (t) => {
  const g = await boot(t);
  const a = await g.signup('a@example.com');
  const b = await g.signup('b@example.com');
  await g.grant(a.accountId, 10000, 'a');
  await g.grant(b.accountId, 10000, 'b');
  await g.chat(a.token); await g.chat(b.token);
  await g.gw.hold(b.accountId);
  g.time.t += 10_000;
  await g.chat(a.token);
  await g.gw.prune(5000);
  const { audit } = JSON.parse(await fs.readFile(g.file, 'utf8'));
  assert.deepEqual(audit.map((e) => e.accountId).sort(), [a.accountId, b.accountId].sort());
  assert.equal(audit.filter((e) => e.accountId === a.accountId).length, 1);
  await g.gw.hold(b.accountId, false);
  await g.gw.prune(5000);
  assert.equal(JSON.parse(await fs.readFile(g.file, 'utf8')).audit.length, 1);
});

test('token and admin comparison go through crypto.timingSafeEqual', async (t) => {
  const g = await boot(t);
  const a = await g.signup();
  const orig = crypto.timingSafeEqual;
  let n = 0;
  crypto.timingSafeEqual = (x, y) => { n++; return orig(x, y); };
  t.after(() => { crypto.timingSafeEqual = orig; });
  await g.call('/v1/balance', { method: 'GET', token: a.token });
  await g.call('/v1/balance', { method: 'GET', token: 'bogus' });
  assert.equal(n, 2);
  await g.call('/v1/admin/flags', { method: 'GET', token: ADMIN });
  assert.equal(n, 3);
});

test('client and runner adapter go through the gateway', async (t) => {
  const g = await boot(t);
  const a = await g.signup();
  await g.grant(a.accountId, 10000, 'g');
  const client = createGatewayClient({ baseUrl: g.base, token: a.token, fetch });
  assert.equal((await client.balance()).balance, 10000);
  const runner = createGatewayRunner({ client, provider: 'fake', model: 'm' });
  const r = await runner.run({ prompt: 'hello' });
  assert.equal(r.ok, true);
  assert.equal(r.text, 'hi');
  assert.deepEqual(r.usage, { inputTokens: 100, outputTokens: 50 });
  const bad = createGatewayRunner({ client: createGatewayClient({ baseUrl: g.base, token: 'nope', fetch }), provider: 'fake', model: 'm' });
  const f = await bad.run({ prompt: 'x' });
  assert.equal(f.ok, false);
  assert.deepEqual(f.usage, { inputTokens: 0, outputTokens: 0 });
});
