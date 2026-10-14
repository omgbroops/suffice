import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.mjs';
test('a valid transfer conserves funds', () => {
  const ledger = new Ledger({ a: 100, b: 0 });
  assert.deepEqual(ledger.applyBatch([{ id: 'one', from: 'a', to: 'b', amount: 20 }]), { a: 80, b: 20 });
});
