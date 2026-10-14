import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { Ledger } = await load('src/ledger.mjs');
test('a later failure rolls back earlier balances and ids', () => {
  const ledger = new Ledger({ a: 100, b: 0 });
  const first = { id: 'one', from: 'a', to: 'b', amount: 60 };
  assert.throws(() => ledger.applyBatch([first, { id: 'two', from: 'a', to: 'b', amount: 60 }]), /funds/);
  assert.deepEqual(ledger.snapshot(), { a: 100, b: 0 });
  assert.deepEqual(ledger.applyBatch([first]), { a: 40, b: 60 });
  assert.deepEqual(ledger.applyBatch([first]), { a: 40, b: 60 });
});
test('same-batch ids deduplicate and conflict rolls back', () => {
  const ledger = new Ledger({ a: 100, b: 0 });
  const transfer = { id: 'same', from: 'a', to: 'b', amount: 20 };
  assert.deepEqual(ledger.applyBatch([transfer, { ...transfer }]), { a: 80, b: 20 });
  assert.throws(() => ledger.applyBatch([{ id: 'new', from: 'a', to: 'b', amount: 10 }, { ...transfer, amount: 21 }]), /Conflicting/);
  assert.deepEqual(ledger.snapshot(), { a: 80, b: 20 });
  assert.deepEqual(ledger.applyBatch([{ id: 'new', from: 'a', to: 'b', amount: 10 }]), { a: 70, b: 30 });
});
test('ordered staged transfers, validation, self-transfer, snapshot ownership', () => {
  const ledger = new Ledger({ a: 30, b: 0, c: 0 });
  const result = ledger.applyBatch([{ id: 'a-b', from: 'a', to: 'b', amount: 30 }, { id: 'b-c', from: 'b', to: 'c', amount: 20 }, { id: 'self', from: 'c', to: 'c', amount: 10 }]);
  assert.deepEqual(result, { a: 0, b: 10, c: 20 }); result.c = 0;
  assert.deepEqual(ledger.snapshot(), { a: 0, b: 10, c: 20 });
  for (const transfer of [{ id: 'bad', from: 'b', to: 'missing', amount: 1 }, { id: 'bad', from: 'b', to: 'c', amount: 0 }, { id: 'bad', from: 'b', to: 'c', amount: 1.5 }]) assert.throws(() => ledger.applyBatch([transfer]));
});
}
