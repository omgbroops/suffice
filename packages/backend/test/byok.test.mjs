import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createByok, redact } from '../src/byok/index.mjs';
import { validate } from '../src/byok/schema.mjs';
import { createVault, createMemoryKeyring } from '../src/vault/index.mjs';

const KEY = 'sk-SECRET-1234567890';
const json = (b, status = 200, h = {}) => ({ ok: status < 400, status, headers: { get: (k) => h[k.toLowerCase()] ?? null }, json: async () => b });

async function setup(t, replies, opts = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'byok-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const clock = { now: () => 1000 };
  const vault = createVault({ dir, keyring: createMemoryKeyring(), clock });
  const calls = [], sleeps = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    const r = replies.shift();
    if (typeof r === 'function') return r(init);
    return r;
  };
  const byok = createByok({ fetch, vault, clock, sleep: async (ms) => { sleeps.push(ms); }, ...opts });
  return { byok, calls, sleeps, vault, dir };
}
const anthOk = { content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 5, output_tokens: 7 } };
const oaiOk = { choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 3, completion_tokens: 4 } };

test('anthropic request shape and usage', async (t) => {
  const { byok, calls } = await setup(t, [json(anthOk)]);
  byok.keys.set('anthropic', KEY);
  const r = await byok.runner({ provider: 'anthropic', model: 'm-1', maxTokens: 50, system: 'sys' }).run({ prompt: 'p' });
  assert.deepEqual([r.ok, r.text, r.usage, r.ms], [true, 'hi', { inputTokens: 5, outputTokens: 7 }, 0]);
  const c = calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.init.headers['x-api-key'], KEY);
  assert.equal(c.init.headers['anthropic-version'], '2026-10-21');
  assert.deepEqual(c.body, { model: 'm-1', max_tokens: 50, system: 'sys', messages: [{ role: 'user', content: 'p' }] });
});

test('openai and openrouter request shape and usage', async (t) => {
  const { byok, calls } = await setup(t, [json(oaiOk), json(oaiOk)]);
  byok.keys.set('openai', KEY); byok.keys.set('openrouter', 'or-key');
  const a = await byok.runner({ provider: 'openai', model: 'g', system: 's' }).run({ prompt: 'p' });
  assert.deepEqual(a.usage, { inputTokens: 3, outputTokens: 4 });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].init.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(calls[0].body, { model: 'g', max_completion_tokens: 4096, messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'p' }] });
  await byok.runner({ provider: 'openrouter', model: 'x/y', maxTokens: 9 }).run({ prompt: 'p' });
  assert.equal(calls[1].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[1].init.headers.authorization, 'Bearer or-key');
  assert.equal(calls[1].body.max_tokens, 9);
});

test('custom baseUrl, usage falls back to the reserved estimate when absent', async (t) => {
  const { byok, calls } = await setup(t, [json({ choices: [{ message: { content: 'x' } }] })]);
  byok.keys.set('openai-compatible', 'k');
  const r = await byok.runner({ provider: 'openai-compatible', model: 'm', baseUrl: 'http://localhost:1234/v1/' }).run({ prompt: 'p' });
  assert.equal(calls[0].url, 'http://localhost:1234/v1/chat/completions');
  assert.deepEqual(r.usage, { inputTokens: 1 + 4096, outputTokens: 0 }); assert.equal(r.usageEstimated, true);
  assert.throws(() => byok.runner({ provider: 'openai-compatible', model: 'm' }), /baseUrl/);
});

test('structured output: anthropic tool, openai json_schema, schema miss', async (t) => {
  const schema = { type: 'object', required: ['a'], properties: { a: { type: 'number' } } };
  const { byok, calls } = await setup(t, [
    json({ content: [{ type: 'tool_use', input: { a: 1 } }], usage: { input_tokens: 1, output_tokens: 1 } }),
    json({ choices: [{ message: { content: '{"a":2}' } }] }),
    json({ choices: [{ message: { content: '{"b":2}' } }] }),
    json({ choices: [{ message: { content: 'nope' } }] }),
  ]);
  byok.keys.set('anthropic', KEY); byok.keys.set('openai', KEY);
  const r1 = await byok.runner({ provider: 'anthropic', model: 'm' }).run({ prompt: 'p', schema });
  assert.deepEqual(r1.value, { a: 1 });
  assert.deepEqual(calls[0].body.tool_choice, { type: 'tool', name: 'result' });
  assert.deepEqual(calls[0].body.tools[0].input_schema, schema);
  const o = byok.runner({ provider: 'openai', model: 'm' });
  const r2 = await o.run({ prompt: 'p', schema });
  assert.deepEqual(r2.value, { a: 2 });
  assert.equal(calls[1].body.response_format.type, 'json_schema');
  const r3 = await o.run({ prompt: 'p', schema });
  assert.equal(r3.ok, false); assert.match(r3.error, /missing required keys: a/);
  const r4 = await o.run({ prompt: 'p', schema });
  assert.equal(r4.ok, false); assert.match(r4.error, /not valid JSON/);
});

test('429 with retry-after then success; gives up after 3 attempts; no retry on 401', async (t) => {
  const { byok, sleeps, calls } = await setup(t, [json({}, 429, { 'retry-after': '2' }), json({}, 503), json(oaiOk)]);
  byok.keys.set('openai', KEY);
  const r = await byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' });
  assert.equal(r.ok, true); assert.deepEqual(sleeps, [2000, 1000]); assert.equal(calls.length, 3);

  const s2 = await setup(t, [json({}, 503), json({}, 503), json({}, 503), json(oaiOk)]);
  s2.byok.keys.set('openai', KEY);
  const f = await s2.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' });
  assert.equal(f.ok, false); assert.equal(s2.calls.length, 3); assert.match(f.error, /http 503/);
  // plain 500 is not retried (it may have run the request)
  const s5 = await setup(t, [json({}, 500), json(oaiOk)]);
  s5.byok.keys.set('openai', KEY);
  const h = await s5.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' });
  assert.equal(h.ok, false); assert.equal(s5.calls.length, 1); assert.match(h.error, /http 500/);

  const s3 = await setup(t, [json({ error: { message: 'bad key' } }, 401)]);
  s3.byok.keys.set('openai', KEY);
  const g = await s3.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' });
  assert.equal(g.error, 'http 401: bad key'); assert.equal(s3.calls.length, 1);
});

test('abort wires signal into fetch and stops retries', async (t) => {
  const ac = new AbortController();
  const { byok, calls } = await setup(t, [(init) => { assert.equal(init.signal, ac.signal); ac.abort(); throw new Error('The operation was aborted'); }, json(oaiOk)]);
  byok.keys.set('openai', KEY);
  const r = await byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p', signal: ac.signal });
  assert.deepEqual([r.ok, r.error, calls.length], [false, 'aborted', 1]);
});

test('budget: deny makes no call; allow reserves and settles', async (t) => {
  const log = [];
  const mk = (allow) => ({ reserve: (n) => { log.push(['reserve', n]); return { allow, reason: 'over budget', remaining: 0, release: () => log.push(['release']), settle: (u) => log.push(['settle', u]) }; } });
  const a = await setup(t, [], { budget: mk(false) });
  a.byok.keys.set('openai', KEY);
  const r = await a.byok.runner({ provider: 'openai', model: 'm', maxTokens: 100 }).run({ prompt: 'abcd' });
  assert.deepEqual([r.ok, r.error, a.calls.length], [false, 'over budget', 0]);
  const b = await setup(t, [json(oaiOk), json({}, 400)], { budget: mk(true) });
  b.byok.keys.set('openai', KEY);
  const rn = b.byok.runner({ provider: 'openai', model: 'm', maxTokens: 100 });
  await rn.run({ prompt: 'abcd' });
  await rn.run({ prompt: 'abcd' });
  assert.deepEqual(log.slice(1), [['reserve', 101], ['settle', { inputTokens: 3, outputTokens: 4 }], ['reserve', 101], ['release']]);
});

test('key never leaks: errors, thrown fetch errors, vault file, list', async (t) => {
  const { byok, dir } = await setup(t, [
    () => { throw new Error(`connect failed with Bearer ${KEY} and ${KEY}`); }, () => { throw new Error(`x ${KEY}`); }, () => { throw new Error(`x ${KEY}`); },
    json({ error: { message: `invalid key ${KEY}` } }, 401),
  ]);
  byok.keys.set('openai', KEY);
  const rn = byok.runner({ provider: 'openai', model: 'm' });
  const r1 = await rn.run({ prompt: 'p' });
  const r2 = await rn.run({ prompt: 'p' });
  for (const r of [r1, r2]) { assert.equal(r.ok, false); assert.ok(!JSON.stringify(r).includes(KEY)); }
  assert.match(r2.error, /invalid key \[redacted\]/);
  assert.deepEqual(byok.keys.list(), ['openai']);
  assert.ok(!JSON.stringify(byok.keys.list()).includes(KEY));
  for (const f of await fs.readdir(path.join(dir, 'byok'))) assert.ok(!(await fs.readFile(path.join(dir, 'byok', f), 'utf8')).includes(KEY));
  assert.equal(redact(`a ${KEY} b`, KEY), 'a [redacted] b');
});

test('vault round trip and key management; missing key', async (t) => {
  const { byok, vault } = await setup(t, []);
  assert.equal(byok.keys.has('anthropic'), false);
  assert.equal((await byok.runner({ provider: 'anthropic', model: 'm' }).run({ prompt: 'p' })).error, 'no API key set for anthropic');
  byok.keys.set('anthropic', ` ${KEY} `);
  assert.equal(byok.keys.has('anthropic'), true);
  assert.equal(vault.open(vault.get('byok', 'anthropic')).payload.key, KEY);
  assert.throws(() => byok.keys.set('nope', 'k'), /provider/);
  assert.equal(byok.keys.remove('anthropic'), true);
  assert.deepEqual(byok.keys.list(), []);
});

test('test(): models GET per provider, failure reported', async (t) => {
  const { byok, calls } = await setup(t, [json({ data: [] }), json({ data: [] }), json({}), json({ error: { message: 'nope' } }, 401)]);
  for (const p of ['anthropic', 'openai', 'openrouter']) byok.keys.set(p, KEY);
  assert.deepEqual(await byok.test('anthropic'), { ok: true });
  assert.deepEqual(await byok.test('openai'), { ok: true });
  assert.deepEqual(await byok.test('openrouter'), { ok: true });
  assert.deepEqual(calls.map((c) => [c.init.method, c.url]), [['GET', 'https://api.anthropic.com/v1/models?limit=1'], ['GET', 'https://api.openai.com/v1/models'], ['GET', 'https://openrouter.ai/api/v1/models/user']]);
  const bad = await byok.test('openai');
  assert.deepEqual(bad, { ok: false, error: 'http 401: nope' });
  assert.deepEqual(await byok.test('openai-compatible', { baseUrl: 'http://x' }), { ok: false, error: 'no API key set for openai-compatible' });
});

test('retry-after over maxRetryWaitMs stops without sleeping and releases the hold', async (t) => {
  const log = [];
  const budget = { reserve: () => ({ allow: true, release: () => log.push('release'), settle: () => log.push('settle') }) };
  const a = await setup(t, [json({}, 429, { 'retry-after': '120' }), json(oaiOk)], { budget });
  a.byok.keys.set('openai', KEY);
  const r = await a.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' });
  assert.deepEqual([r.ok, r.error, a.calls.length, a.sleeps, log], [false, 'rate limited, retry after 120 s', 1, [], ['release']]);
  const b = await setup(t, [json({}, 429, { 'retry-after': '5' }), json(oaiOk)], { maxRetryWaitMs: 1000 });
  b.byok.keys.set('openai', KEY);
  assert.match((await b.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' })).error, /rate limited, retry after 5 s/);
});

test('backoff sleep is abortable by req.signal', async (t) => {
  const ac = new AbortController();
  const c = await setup(t, [json({}, 503), json(oaiOk)], { sleep: (ms, signal) => new Promise((r) => signal.addEventListener('abort', r, { once: true })) });
  c.byok.keys.set('openai', KEY);
  const p = c.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p', signal: ac.signal });
  setTimeout(() => ac.abort(), 20);
  const r = await Promise.race([p, new Promise((r) => setTimeout(() => r('hung'), 2000))]);
  assert.deepEqual([r.ok, r.error, c.calls.length], [false, 'aborted', 1]);
});

test('retry policy: 529 and network errors retry, 502 and 400 do not; earlier usage is settled', async (t) => {
  const a = await setup(t, [json({}, 529), () => { throw new Error('ECONNRESET'); }, json(oaiOk)]);
  a.byok.keys.set('openai', KEY);
  assert.equal((await a.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' })).ok, true);
  assert.equal(a.calls.length, 3);
  const b = await setup(t, [json({}, 502), json(oaiOk)]);
  b.byok.keys.set('openai', KEY);
  assert.equal((await b.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' })).ok, false);
  assert.equal(b.calls.length, 1);
  const log = [];
  const budget = { reserve: () => ({ allow: true, release: () => log.push(['release']), settle: (u) => log.push(['settle', u]) }) };
  const c = await setup(t, [json({ usage: { prompt_tokens: 10, completion_tokens: 1 } }, 429), json(oaiOk)], { budget });
  c.byok.keys.set('openai', KEY);
  const r = await c.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' });
  assert.deepEqual(r.usage, { inputTokens: 13, outputTokens: 5 });
  assert.deepEqual(log, [['settle', { inputTokens: 13, outputTokens: 5 }]]);
});

test('baseUrl validation, origin binding, redirect error', async (t) => {
  const { byok, calls } = await setup(t, [json(oaiOk), json(oaiOk)]);
  const bad = ['not a url', 'http://example.com/v1', 'ftp://localhost/', 'https://u:p@example.com/v1'];
  for (const u of bad) assert.throws(() => byok.runner({ provider: 'openai-compatible', model: 'm', baseUrl: u }), /baseUrl/, u);
  for (const u of ['https://example.com/v1', 'http://localhost:1/v1', 'http://127.0.0.2/v1', 'http://[::1]:8/v1']) byok.runner({ provider: 'openai-compatible', model: 'm', baseUrl: u });
  assert.throws(() => byok.keys.set('openai-compatible', 'k', { baseUrl: 'http://example.com' }), /baseUrl/);
  byok.keys.set('openai-compatible', 'k', { baseUrl: 'http://localhost:1234/v1' });
  const ok = await byok.runner({ provider: 'openai-compatible', model: 'm', baseUrl: 'http://localhost:1234/other' }).run({ prompt: 'p' });
  assert.equal(ok.ok, true); assert.equal(calls[0].init.redirect, 'error');
  const no = await byok.runner({ provider: 'openai-compatible', model: 'm', baseUrl: 'https://evil.example/v1' }).run({ prompt: 'p' });
  assert.equal(no.ok, false); assert.match(no.error, /different origin/); assert.equal(calls.length, 1);
  assert.match((await byok.test('openai-compatible', { baseUrl: 'https://evil.example/v1' })).error, /different origin/);
  assert.equal(calls.length, 1);
});

test('redaction: url-encoded key, fragments, masked echo, non-string message', async () => {
  const k = 'sk-ab/cd+ef1234567890XYZ';
  assert.equal(redact(`q=${encodeURIComponent(k)}`, k), 'q=[redacted]');
  assert.ok(!redact(`start ${k.slice(0, 12)} end`, k).includes(k.slice(0, 12)));
  assert.ok(!redact(`tail ${k.slice(-9)}`, k).includes(k.slice(-9)));
  assert.equal(redact('sk-***', k), 'sk-***');
  const { byok } = await setup({ after() {} }, [json({ error: { message: { code: 'x', key: 'v' } } }, 400), json({ error: { message: 5 } }, 400)]);
  byok.keys.set('openai', KEY);
  const rn = byok.runner({ provider: 'openai', model: 'm' });
  const r = await rn.run({ prompt: 'p' });
  assert.match(r.error, /^http 400: \{"code":"x"/); assert.ok(!r.error.includes('[object'));
  assert.equal((await rn.run({ prompt: 'p' })).error, 'http 400: 5');
});

test('missing usage settles the reserved estimate; settle throwing keeps the output', async (t) => {
  const log = [];
  const budget = { reserve: () => ({ allow: true, release: () => log.push('release'), settle: (u) => { log.push(u); } }) };
  const a = await setup(t, [json({ choices: [{ message: { content: 'x' } }] })], { budget });
  a.byok.keys.set('openai', KEY);
  const r = await a.byok.runner({ provider: 'openai', model: 'm', maxTokens: 100 }).run({ prompt: 'abcd' });
  assert.deepEqual([r.ok, r.usageEstimated, r.usage, log], [true, true, { inputTokens: 101, outputTokens: 0 }, [{ inputTokens: 101, outputTokens: 0 }]]);
  const bad = { reserve: () => ({ allow: true, release: () => log.push('rel2'), settle: () => { throw new Error(`boom ${KEY}`); } }) };
  const b = await setup(t, [json(oaiOk)], { budget: bad });
  b.byok.keys.set('openai', KEY);
  const o = await b.byok.runner({ provider: 'openai', model: 'm' }).run({ prompt: 'p' });
  assert.deepEqual([o.ok, o.text], [true, 'hi']); assert.match(o.budgetError, /boom \[redacted\]/); assert.ok(!('usageEstimated' in o));
});

test('anthropic requests never send temperature, top_p or top_k', async (t) => {
  const { byok, calls } = await setup(t, [json(anthOk), json(anthOk)]);
  byok.keys.set('anthropic', KEY);
  const rn = byok.runner({ provider: 'anthropic', model: 'm', system: 's' });
  await rn.run({ prompt: 'p', temperature: 0.2, top_p: 1, top_k: 5 });
  await rn.run({ prompt: 'p', schema: { type: 'object' }, temperature: 0 });
  for (const c of calls) for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in c.body), k);
});

test('schema validator subset', () => {
  const sc = { type: 'object', required: ['a'], additionalProperties: false, properties: {
    a: { type: 'integer' }, b: { enum: ['x', 'y'] }, c: { type: 'array', items: { type: 'object', required: ['d'], properties: { d: { type: 'string' } } } } } };
  assert.deepEqual(validate(sc, { a: 1, b: 'x', c: [{ d: 's' }] }), []);
  assert.match(validate(sc, { a: 1.5 })[0], /a: expected integer/);
  assert.match(validate(sc, {})[0], /missing required keys: a/);
  assert.match(validate(sc, { a: 1, z: 1 })[0], /unexpected keys: z/);
  assert.match(validate(sc, { a: 1, b: 'q' })[0], /b: value not in enum/);
  assert.match(validate(sc, { a: 1, c: [{ d: 1 }] })[0], /c\[0\]\.d: expected string/);
  assert.match(validate(sc, { a: 1, c: [{}] })[0], /c\[0\]: missing required keys: d/);
  assert.match(validate(sc, null)[0], /expected object, got null/);
  assert.match(validate(sc, [1])[0], /expected object, got array/);
  assert.match(validate({ required: ['a'] }, [])[0], /expected object/);
  assert.deepEqual(validate({ type: ['string', 'null'] }, null), []);
  assert.match(validate({ type: 'number' }, NaN)[0], /expected number/);
});
