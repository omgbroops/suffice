import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const qs = require('.');
// Adapted from ljharb/qs 6.14.0: the throwOnLimitExceeded option.
test('parameterLimit throws RangeError when throwOnLimitExceeded is set', () => {
  assert.throws(() => qs.parse('a=1&b=2&c=3', { parameterLimit: 2, throwOnLimitExceeded: true }), RangeError);
  assert.throws(() => qs.parse('a=1&b=2&c=3', { parameterLimit: 2, throwOnLimitExceeded: true }), /Parameter limit exceeded/);
  assert.throws(() => qs.parse('a=1&b=2', { parameterLimit: 1, throwOnLimitExceeded: true }), RangeError);
});
test('arrayLimit throws RangeError when throwOnLimitExceeded is set', () => {
  assert.throws(() => qs.parse('a[]=1&a[]=2&a[]=3', { arrayLimit: 2, throwOnLimitExceeded: true }), RangeError);
  assert.throws(() => qs.parse('a[]=1&a[]=2&a[]=3', { arrayLimit: 2, throwOnLimitExceeded: true }), /Array limit exceeded/);
});
test('limits below the cap do not throw', () => {
  assert.deepEqual(qs.parse('a=1&b=2', { parameterLimit: 2, throwOnLimitExceeded: true }), { a: '1', b: '2' });
  assert.deepEqual(qs.parse('a[]=1&a[]=2', { arrayLimit: 2, throwOnLimitExceeded: true }), { a: ['1', '2'] });
});
test('default and opt-out behavior still truncates silently', () => {
  assert.deepEqual(qs.parse('a=1&b=2&c=3', { parameterLimit: 2 }), { a: '1', b: '2' });
  assert.deepEqual(qs.parse('a=1&b=2&c=3', { parameterLimit: 2, throwOnLimitExceeded: false }), { a: '1', b: '2' });
  assert.deepEqual(qs.parse('x=1'), { x: '1' });
  assert.deepEqual(qs.parse('a[2]=x', { arrayLimit: 1 }), { a: { '2': 'x' } });
});
