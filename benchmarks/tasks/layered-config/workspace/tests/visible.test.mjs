import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
test('later nonempty values replace defaults', () => {
  assert.deepEqual(loadConfig({ endpoint: '/default', retries: 3 }, { endpoint: '/env' }, { retries: 2 }), { endpoint: '/env', retries: 2 });
});
