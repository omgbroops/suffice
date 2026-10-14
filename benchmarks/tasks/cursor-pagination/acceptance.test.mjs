import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { createRepository } = await load('src/repository.mjs');
const { collectAll } = await load('src/collect.mjs');
test('exclusive cursors and tombstones preserve the full sequence', async () => {
  const rows = [{ id: 1 }, { id: 2, deleted: true }, { id: 3, deleted: true }, { id: 4, deleted: true }, { id: 5 }, { id: 6 }, { id: 7 }];
  const repo = createRepository(rows);
  assert.deepEqual((await repo.page({ cursor: 2, limit: 2 })).items, []);
  assert.deepEqual((await collectAll(repo, { limit: 2 })).map(r => r.id), [1, 5, 6, 7]);
});
test('full live pages do not duplicate boundary rows', async () => {
  assert.deepEqual((await collectAll(createRepository(Array.from({ length: 7 }, (_, n) => ({ id: n + 1 }))), { limit: 2 })).map(r => r.id), [1, 2, 3, 4, 5, 6, 7]);
});
test('broken services cannot loop forever', async () => {
  await assert.rejects(collectAll({ page: async () => ({ items: [{ id: 1 }], nextCursor: 1 }) }, { limit: 1 }), /Repeated cursor/);
  let cursor = 0;
  await assert.rejects(collectAll({ page: async () => ({ items: [], nextCursor: ++cursor }) }, { maxPages: 3 }), /budget/);
});
}
