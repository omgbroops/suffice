import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { mergeLayers } = await load('src/merge.mjs');
const { loadConfig } = await load('src/config.mjs');
test('falsy values override while undefined inherits', () => {
  assert.deepEqual(loadConfig({ endpoint: '/api', retries: 4, enabled: true, note: 'old', nested: { value: 2 } }, {}, { endpoint: '', retries: 0, enabled: false, note: null, nested: { value: undefined } }), { endpoint: '', retries: 0, enabled: false, note: null, nested: { value: 2 } });
});
test('recursive branches and replacement arrays are independently owned', () => {
  const defaults = { nested: { retained: { n: 1 }, changed: 'before' }, flags: ['a'], untouched: [{ n: 2 }] };
  const override = { nested: { changed: 'after' }, flags: ['b'] };
  const before = structuredClone({ defaults, override });
  const result = mergeLayers(defaults, override);
  assert.deepEqual(result.flags, ['b']); assert.equal(result.nested.changed, 'after');
  result.nested.retained.n = 9; result.flags.push('c'); result.untouched[0].n = 8;
  assert.deepEqual({ defaults, override }, before);
});
test('invalid effective configuration is still rejected', () => {
  assert.throws(() => loadConfig({ endpoint: '/x', retries: 2 }, {}, { retries: -1 }), /nonnegative/);
  assert.throws(() => loadConfig({ endpoint: '/x', retries: 2 }, {}, { endpoint: null }), /string/);
});
}
