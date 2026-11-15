import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoxes, BoxError, manifest, activate, defineBoxSlots } from '../src/boxes/index.mjs';

const TOKEN = 'sk-secret-token-123';
const BASE = 'https://api.suffice.cloud/v1';
const VM = { id: 'vm-0123456789', name: 'dev', state: 'running' };
const CK = { id: 'ckpt-0123456789', vm_id: VM.id, name: 'a' };
const json = (status, body, headers = {}) => ({ status, ok: status < 400, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => (body === undefined ? '' : JSON.stringify(body)) });

function rig(...replies) {
  const calls = [], sleeps = [];
  const fetch = async (url, init) => { calls.push({ url, ...init }); const r = replies.length > 1 ? replies.shift() : replies[0]; return typeof r === 'function' ? r() : r; };
  const clock = { now: () => 0, sleep: async (ms) => { sleeps.push(ms); } };
  return { calls, sleeps, boxes: createBoxes({ baseUrl: BASE, token: TOKEN, fetch, clock }) };
}
const body = (c) => JSON.parse(c.body);

test('list: GET /vms, bearer auth, returns data', async () => {
  const { boxes, calls } = rig(json(200, { data: [VM], page: {} }));
  assert.deepEqual(await boxes.list(), [VM]);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, `${BASE}/vms`);
  assert.equal(calls[0].headers.authorization, `Bearer ${TOKEN}`);
});

test('create: POST /vms with size, name and Idempotency-Key', async () => {
  const { boxes, calls } = rig(json(201, VM));
  assert.deepEqual(await boxes.create({ size: 'small', name: 'dev' }), VM);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${BASE}/vms`);
  assert.deepEqual(body(calls[0]), { size: 'small', name: 'dev' });
  assert.ok(calls[0].headers['idempotency-key']);
  assert.equal(calls[0].headers['content-type'], 'application/json');
});

test('get and destroy', async () => {
  const g = rig(json(200, VM));
  assert.deepEqual(await g.boxes.get(VM.id), VM);
  assert.equal(g.calls[0].url, `${BASE}/vms/${VM.id}`);
  const d = rig(json(204));
  await d.boxes.destroy(VM.id);
  assert.equal(d.calls[0].method, 'DELETE');
});

test('exec: POST /vms/{id}/exec maps to ExecResult', async () => {
  const { boxes, calls } = rig(json(200, { exit_code: 3, stdout: 'o', stderr: 'e', timed_out: true, duration_ms: 5 }));
  const r = await boxes.exec(VM.id, 'ls', { timeoutMs: 1500 });
  assert.deepEqual(r, { code: 3, stdout: 'o', stderr: 'e', timedOut: true });
  assert.equal(calls[0].url, `${BASE}/vms/${VM.id}/exec`);
  assert.deepEqual(body(calls[0]), { command: 'ls', timeout_s: 2 });
  assert.equal(calls[0].headers['idempotency-key'], undefined);
});

test('logs: GET with cursor', async () => {
  const { boxes, calls } = rig(json(200, { data: [{ seq: 1, text: 'x' }], page: { next_cursor: null, has_more: false, limit: 100 } }));
  const r = await boxes.logs(VM.id, { cursor: 'c 1' });
  assert.equal(r.data[0].text, 'x');
  assert.equal(calls[0].url, `${BASE}/vms/${VM.id}/logs?cursor=c%201`);
});

test('checkpoint, checkpoints, rewind, fork paths and bodies', async () => {
  let r = rig(json(201, CK));
  await r.boxes.checkpoint(VM.id, { name: 'a' });
  assert.equal(r.calls[0].url, `${BASE}/vms/${VM.id}/checkpoints`);
  assert.deepEqual(body(r.calls[0]), { name: 'a' });
  r = rig(json(200, { data: [CK], page: {} }));
  assert.deepEqual(await r.boxes.checkpoints(VM.id), [CK]);
  assert.equal(r.calls[0].method, 'GET');
  r = rig(json(200, VM));
  await r.boxes.rewind(VM.id, CK.id);
  assert.equal(r.calls[0].url, `${BASE}/vms/${VM.id}/rewind`);
  assert.deepEqual(body(r.calls[0]), { checkpoint: CK.id });
  r = rig(json(201, { vms: [VM], fork_ms: 9 }));
  const f = await r.boxes.fork(VM.id, { checkpointId: CK.id });
  assert.equal(f.fork_ms, 9);
  assert.equal(r.calls[0].url, `${BASE}/vms/${VM.id}/fork`);
  assert.deepEqual(body(r.calls[0]), { checkpoint: CK.id });
});

test('idempotency key: sent on create and fork (the spec routes), not where the spec defines none', async () => {
  const key = async (fn) => { const r = rig(json(201, { vms: [] })); await fn(r.boxes); return r.calls[0].headers['idempotency-key']; };
  assert.ok(await key((b) => b.create({ size: 'small' })));
  assert.ok(await key((b) => b.fork(VM.id, {})));
  assert.equal(await key((b) => b.checkpoint(VM.id, {})), undefined);
  assert.equal(await key((b) => b.rewind(VM.id, CK.id)), undefined);
});

test('importRepo: source JSON and tar.gz upload', async () => {
  const imp = { id: 'imp1', stack: 'node', state: 'ready', plan: {}, vm_id: VM.id, preview_url: 'https://x' };
  let r = rig(json(201, imp));
  assert.deepEqual(await r.boxes.importRepo({ source: 'https://github.com/a/b', name: 'n' }), imp);
  assert.equal(r.calls[0].url, `${BASE}/imports`);
  assert.deepEqual(body(r.calls[0]), { source: 'https://github.com/a/b', name: 'n' });
  r = rig(json(201, imp));
  const tar = Buffer.from('tar');
  await r.boxes.importRepo({ upload: tar, name: 'n', dryRun: true, env: { A: 'b c' } });
  assert.equal(r.calls[0].url, `${BASE}/imports?name=n&dry_run=true`);
  assert.equal(r.calls[0].headers['content-type'], 'application/gzip');
  assert.equal(r.calls[0].headers['x-suffice-env'], encodeURIComponent('{"A":"b c"}'));
  assert.equal(r.calls[0].body, tar);
  await assert.rejects(() => r.boxes.importRepo({}), TypeError);
});

test('preview and usage', async () => {
  let r = rig(json(200, { data: [{ port: 3000, public: false, url: 'https://u' }] }));
  assert.equal((await r.boxes.preview(VM.id))[0].url, 'https://u');
  assert.equal(r.calls[0].url, `${BASE}/vms/${VM.id}/urls`);
  r = rig(json(200, { since: 'a', until: 'b' }));
  await r.boxes.usage();
  assert.equal(r.calls[0].url, `${BASE}/usage`);
});

test('error mapping: BoxError carries status, code, message; token never in it', async () => {
  const err = { error: { code: 'not_found', message: 'no such vm', status: 404, request_id: 'r', details: {} } };
  const { boxes } = rig(json(404, err));
  await assert.rejects(() => boxes.get(VM.id), (e) => {
    assert.ok(e instanceof BoxError);
    assert.equal(e.status, 404); assert.equal(e.code, 'not_found'); assert.equal(e.message, 'no such vm');
    assert.ok(!JSON.stringify(e).includes(TOKEN) && !String(e.stack).includes(TOKEN));
    return true;
  });
});

test('network error text is scrubbed of the token', async () => {
  const boxes = createBoxes({ baseUrl: BASE, token: TOKEN, clock: { now: () => 0 }, fetch: async () => { throw new Error(`boom ${TOKEN}`); } });
  await assert.rejects(() => boxes.list(), (e) => !e.message.includes(TOKEN) && e.message.includes('boom'));
});

test('503 retried honouring Retry-After; 400 not retried', async () => {
  const bad = json(503, { error: { code: 'out_of_capacity', message: 'full', status: 503, request_id: 'r', details: {} } }, { 'retry-after': '2' });
  const { boxes, calls, sleeps } = rig(bad, bad, json(200, { data: [], page: {} }));
  assert.deepEqual(await boxes.list(), []);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [2000, 2000]);
  const r = rig(json(400, { error: { code: 'invalid_request', message: 'bad', status: 400, request_id: 'r', details: {} } }));
  await assert.rejects(() => r.boxes.create({}), (e) => e.code === 'invalid_request');
  assert.equal(r.calls.length, 1);
});

test('429 gives up after the retry limit; retries reuse the idempotency key', async () => {
  const lim = json(429, { error: { code: 'rate_limited', message: 'slow', status: 429, request_id: 'r', details: {} } });
  const r = rig(lim);
  await assert.rejects(() => r.boxes.create({ size: 'small' }), (e) => e.status === 429);
  assert.equal(r.calls.length, 4);
  assert.equal(new Set(r.calls.map((c) => c.headers['idempotency-key'])).size, 1);
});

test('input validation throws TypeError', async () => {
  const { boxes } = rig(json(200, VM));
  await assert.rejects(() => boxes.get(''), TypeError);
  await assert.rejects(() => boxes.exec(VM.id, ''), TypeError);
  assert.throws(() => createBoxes({ baseUrl: BASE, fetch: () => {} }), TypeError);
});

test('plugin: manifest and activate register tools and runner', async () => {
  assert.equal(manifest.name, 'boxes');
  assert.deepEqual(manifest.permissions, ['net', 'secrets']);
  assert.deepEqual(manifest.contributes.tools, ['box.create', 'box.exec', 'box.checkpoint', 'box.rewind', 'box.fork', 'box.destroy']);
  assert.deepEqual(manifest.contributes.runners, ['box']);
  const regs = [];
  const { boxes, calls } = rig(json(200, { exit_code: 0, stdout: 'hi', stderr: '', timed_out: false, duration_ms: 1 }));
  await activate({ boxes, register: (k, id, impl) => regs.push([k, id, impl]) });
  assert.deepEqual(regs.map(([k, id]) => `${k}:${id}`), [...manifest.contributes.tools.map((t) => `tools:${t}`), 'runners:box']);
  const runner = regs.find(([k]) => k === 'runners')[2];
  const res = await runner.run({ prompt: 'echo hi', box: VM.id });
  assert.equal(res.ok, true); assert.equal(res.text, 'hi');
  assert.deepEqual(res.usage, { inputTokens: 0, outputTokens: 0 });
  assert.equal(JSON.parse(calls[0].body).command, 'echo hi');
});

test('slots: boxes:list and box:<id>:checkpoints update after list() and checkpoint()', async () => {
  const state = new Map(), defs = [];
  const slots = { define(def, initial) { defs.push(def.id); state.set(def.id, initial); return { set: (v) => state.set(def.id, v), patch() {}, remove() {} }; } };
  const { boxes } = rig(json(200, { data: [VM], page: {} }), json(201, CK));
  defineBoxSlots(slots, boxes);
  assert.deepEqual(state.get('boxes:list'), []);
  await boxes.list();
  assert.deepEqual(state.get('boxes:list'), [VM]);
  await boxes.checkpoint(VM.id, { name: 'a' });
  assert.deepEqual(state.get(`box:${VM.id}:checkpoints`), [CK]);
  assert.ok(defs.includes(`box:${VM.id}:checkpoints`));
});
