import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { createShop } = await import(pathToFileURL(resolve(workspace, 'src/index.mjs')).href);
test('request ids are tenant scoped and delimiter safe', () => {
  const shop = createShop({ red: { a: 10 }, blue: { a: 10 }, 'x:y': { a: 10 }, x: { a: 10 } });
  for (const [tenant, requestId] of [['red', 'one'], ['blue', 'one'], ['x:y', 'z'], ['x', 'y:z']]) {
    const receipt = shop.reserve({ tenant, requestId, items: [{ sku: 'a', quantity: 2 }] });
    assert.equal(receipt.tenant, tenant); assert.equal(shop.stock(tenant, 'a'), 8);
  }
});
test('duplicate totals and reordered retries share one identity', () => {
  const shop = createShop({ t: { a: 10, b: 10 } });
  const receipt = shop.reserve({ tenant: 't', requestId: 'id', items: [{ sku: 'b', quantity: 1 }, { sku: 'a', quantity: 2 }, { sku: 'a', quantity: 3 }] });
  assert.deepEqual(receipt.items, [{ sku: 'a', quantity: 5 }, { sku: 'b', quantity: 1 }]);
  assert.equal(shop.stock('t', 'a'), 5);
  assert.deepEqual(shop.reserve({ tenant: 't', requestId: 'id', items: [{ sku: 'a', quantity: 5 }, { sku: 'b', quantity: 1 }] }), receipt);
  assert.throws(() => shop.reserve({ tenant: 't', requestId: 'id', items: [{ sku: 'a', quantity: 4 }, { sku: 'b', quantity: 1 }] }), /Conflicting/);
});
test('later errors roll back stock and allow corrected retries', () => {
  const shop = createShop({ t: { a: 10, b: 1 } });
  for (const item of [{ sku: 'b', quantity: 2 }, { sku: 'missing', quantity: 1 }]) {
    assert.throws(() => shop.reserve({ tenant: 't', requestId: 'id', items: [{ sku: 'a', quantity: 2 }, item] }));
    assert.equal(shop.stock('t', 'a'), 10); assert.equal(shop.stock('t', 'b'), 1);
  }
  shop.reserve({ tenant: 't', requestId: 'id', items: [{ sku: 'a', quantity: 2 }] });
  assert.equal(shop.stock('t', 'a'), 8);
});
test('validation and snapshots preserve ownership', () => {
  const initial = { t: { a: 10 } }, shop = createShop(initial);
  initial.t.a = 0;
  for (const quantity of [0, -1, 1.5, '2']) assert.throws(() => shop.reserve({ tenant: 't', requestId: 'bad', items: [{ sku: 'a', quantity }] }));
  const input = { tenant: 't', requestId: 'id', items: [{ sku: 'a', quantity: 2 }] };
  const receipt = shop.reserve(input); input.items[0].quantity = 9; receipt.items[0].quantity = 8;
  const retry = shop.reserve({ tenant: 't', requestId: 'id', items: [{ sku: 'a', quantity: 2 }] });
  assert.equal(retry.items[0].quantity, 2); assert.equal(shop.stock('t', 'a'), 8);
});
}
