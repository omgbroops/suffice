import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/client.mjs';
test('GET retries a server error and returns success', async () => {
  const delays = []; let calls = 0;
  const request = createClient({ transport: async () => ({ status: ++calls === 1 ? 503 : 200 }), sleep: async ms => delays.push(ms), keyFactory: () => 'key' });
  assert.equal((await request({ url: '/items' })).status, 200);
  assert.deepEqual(delays, [100]);
});
