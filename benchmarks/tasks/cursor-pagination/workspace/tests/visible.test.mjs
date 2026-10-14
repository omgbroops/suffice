import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../src/repository.mjs';
import { collectAll } from '../src/collect.mjs';
test('one page returns live rows', async () => {
  assert.deepEqual(await collectAll(createRepository([{ id: 1 }, { id: 2 }]), { limit: 5 }), [{ id: 1 }, { id: 2 }]);
});
