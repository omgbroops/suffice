import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/index.mjs';
test('route settings inherit defaults and results are owned', () => {
  const router = createRouter({ defaults: { enabled: true, timeout: 20, headers: { a: 'one' } }, routes: [{ id: 'app', pattern: '/app/*', settings: { target: 'service' } }] });
  const first = router.resolve('red', '/app/item');
  assert.equal(first.target, 'service'); assert.equal(first.timeout, 20);
  first.headers.a = 'changed';
  assert.equal(router.resolve('red', '/app/item').headers.a, 'one');
  assert.equal(router.resolve('red', '/missing'), null);
});
