import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { createClient } = await load('src/client.mjs');
test('POST keys survive retries and separate logical calls', async () => {
  const sent = []; const delays = []; let keys = 0;
  const request = createClient({ transport: async r => { sent.push(r); return { status: sent.length === 1 ? 429 : 200, headers: { 'retry-after': '2' } }; }, sleep: async ms => delays.push(ms), keyFactory: () => 'key-' + ++keys });
  await request({ method: 'POST', url: '/orders', headers: { authorization: 'sample' }, body: 'payload' });
  await request({ method: 'POST', url: '/orders' });
  assert.deepEqual(sent.map(r => r.headers['idempotency-key']), ['key-1', 'key-1', 'key-2']);
  assert.equal(sent[0].headers.authorization, 'sample');
  assert.equal(sent[1].body, 'payload');
  assert.deepEqual(delays, [2000]);
});
test('retry budget and ordinary errors are respected', async () => {
  const delays = []; let calls = 0;
  const request = createClient({ transport: async () => { calls++; return { status: 503 }; }, sleep: async ms => delays.push(ms), keyFactory: () => 'k', maxAttempts: 3, baseMs: 7 });
  assert.equal((await request({ url: '/' })).status, 503);
  assert.equal(calls, 3); assert.deepEqual(delays, [7, 14]);
  const bad = createClient({ transport: async () => ({ status: 400 }), sleep: async () => assert.fail('must not retry'), keyFactory: () => 'k' });
  assert.equal((await bad({ url: '/' })).status, 400);
});
test('explicit caller identity is preserved without generating another key', async () => {
  const headers = { 'idempotency-key': 'caller-key', 'x-custom': 'value' };
  const request = createClient({
    transport: async request => { assert.deepEqual(request.headers, headers); return { status: 200 }; },
    sleep: async () => assert.fail('must not sleep'),
    keyFactory: () => assert.fail('must preserve explicit identity'),
  });
  await request({ method: 'POST', url: '/', headers });
  assert.deepEqual(headers, { 'idempotency-key': 'caller-key', 'x-custom': 'value' });
});
}
