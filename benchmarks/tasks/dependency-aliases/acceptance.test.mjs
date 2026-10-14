import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { buildOrder } = await load('src/order.mjs');
test('transitive aliases and duplicate identities resolve once', () => {
  const graph = { nodes: { app: { dependencies: ['short', 'core'] }, core: {}, unused: { dependencies: ['missing'] } }, aliases: { short: 'long', long: 'core', main: 'app' } };
  assert.deepEqual(buildOrder(graph, ['main', 'app', 'short']), ['core', 'app']);
});
test('dependency cycles cannot evade canonical identity', () => {
  assert.throws(() => buildOrder({ nodes: { a: { dependencies: ['other'] }, b: { dependencies: ['again'] } }, aliases: { other: 'b', again: 'a' } }, ['a']), /cycle/i);
});
test('alias cycles and unknown targets reject predictably', () => {
  assert.throws(() => buildOrder({ nodes: {}, aliases: { a: 'b', b: 'a' } }, ['a']), /alias cycle/i);
  assert.throws(() => buildOrder({ nodes: { a: {} }, aliases: { bad: 'absent' } }, ['bad']), /Unknown node/);
});
}
