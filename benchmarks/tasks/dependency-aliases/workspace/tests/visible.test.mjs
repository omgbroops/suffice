import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrder } from '../src/order.mjs';
test('ordinary dependencies are ordered before a root', () => {
  assert.deepEqual(buildOrder({ nodes: { app: { dependencies: ['core'] }, core: {} } }, ['app']), ['core', 'app']);
});
