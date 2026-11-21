import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const cookie = require('.');
// Adapted from jshttp/cookie 0.7.2: parse must survive cookie keys that
// shadow Object.prototype methods.
test('a cookie named hasOwnProperty does not break parsing', () => {
  assert.deepEqual(cookie.parse('hasOwnProperty=x; a=1; b=2'), { hasOwnProperty: 'x', a: '1', b: '2' });
  assert.deepEqual(cookie.parse('a=1; hasOwnProperty=x; b=2'), { a: '1', hasOwnProperty: 'x', b: '2' });
});
test('other special names still parse normally', () => {
  assert.deepEqual(cookie.parse('a=1; b=2'), { a: '1', b: '2' });
  assert.deepEqual(cookie.parse('constructor=z; a=1'), { constructor: 'z', a: '1' });
  assert.equal(cookie.parse('foo=bar').foo, 'bar');
  assert.equal(cookie.parse('empty=').empty, '');
});
