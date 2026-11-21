import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const p2r = require('./dist/index.js');
// Adapted from pillarjs/path-to-regexp 8.2.0: wildcards match any character
// and token data stringifies back to a path.
test('wildcards match path segments containing newlines', () => {
  const m = p2r.match('/files/*rest');
  const hit = m('/files/a\nb');
  assert.ok(hit, 'wildcard should match a segment containing a newline');
  assert.deepEqual(hit.params.rest, ['a\nb']);
  assert.ok(m('/files/plain'));
});
test('non-wildcard params still reject slashes', () => {
  const m = p2r.match('/a/:b');
  assert.equal(m('/a/x').params.b, 'x');
  assert.equal(m('/a/x/y'), false);
});
test('stringify serializes parsed token data back to a path', () => {
  assert.equal(typeof p2r.stringify, 'function');
  const out = p2r.stringify(p2r.parse('/users/:id/files/*rest'));
  assert.equal(out.replaceAll('\\', ''), '/users/:id/files/*rest');
});
