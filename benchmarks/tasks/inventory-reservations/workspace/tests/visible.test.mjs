import test from 'node:test';
import assert from 'node:assert/strict';
import { createShop } from '../src/index.mjs';
test('a successful request consumes stock once', () => {
  const shop = createShop({ red: { book: 5 } });
  const request = { tenant: 'red', requestId: 'one', items: [{ sku: 'book', quantity: 2 }] };
  assert.deepEqual(shop.reserve(request), request);
  assert.deepEqual(shop.reserve(request), request);
  assert.equal(shop.stock('red', 'book'), 3);
});
