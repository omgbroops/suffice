import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const qs = require('.');
// Adapted from ljharb/qs 6.14.0 changes since 6.11.2.
test('throwOnLimitExceeded raises RangeError on parameter and array limits', () => {
  assert.throws(() => qs.parse('a=1&b=2&c=3', { parameterLimit: 2, throwOnLimitExceeded: true }), RangeError);
  assert.throws(() => qs.parse('a[]=1&a[]=2&a[]=3', { arrayLimit: 2, throwOnLimitExceeded: true }), /Array limit exceeded/);
  assert.deepEqual(qs.parse('a=1&b=2&c=3', { parameterLimit: 2 }), { a: '1', b: '2' });
});
test('duplicates option controls repeated keys', () => {
  assert.deepEqual(qs.parse('a=1&a=2', { duplicates: 'last' }), { a: '2' });
  assert.deepEqual(qs.parse('a=1&a=2'), { a: ['1', '2'] });
  assert.deepEqual(qs.parse('a=1&a=2', { duplicates: 'combine' }), { a: ['1', '2'] });
});
test('decodeDotInKeys decodes dots into nesting', () => {
  assert.deepEqual(qs.parse('a.b=x', { decodeDotInKeys: true }), { a: { b: 'x' } });
  assert.deepEqual(qs.parse('a%2Eb=x', { decodeDotInKeys: true }), { a: { b: 'x' } });
  assert.deepEqual(qs.parse('a.b=x'), { 'a.b': 'x' });
});
test('allowEmptyArrays permits truly empty arrays', () => {
  assert.deepEqual(qs.parse('a[]=', { allowEmptyArrays: true }), { a: [] });
  assert.deepEqual(qs.parse('a[]=', { allowEmptyArrays: false }), { a: [''] });
});
test('strictDepth throws past the depth option', () => {
  assert.throws(() => qs.parse('a[b][c][d][e][f][g]=x', { strictDepth: true, depth: 3 }), RangeError);
  assert.throws(() => qs.parse('a[b][c][d][e][f][g]=x', { strictDepth: true, depth: 3 }), /depth exceeded/);
  assert.deepEqual(qs.parse('a[b]=x', { strictDepth: true, depth: 3 }), { a: { b: 'x' } });
});
const utils = require('./lib/utils.js');
test('utils.merge accepts a function source', () => {
  assert.deepEqual(utils.merge({ a: 1 }, function () { return 9; }), { a: 1 });
  const fn = function () {}; fn.b = 2;
  assert.deepEqual(utils.merge({ a: 1 }, fn), { a: 1, b: 2 });
});
test('plain parse behavior stays the same', () => {
  assert.deepEqual(qs.parse('x=1&y=2'), { x: '1', y: '2' });
  assert.deepEqual(qs.parse('a[b]=c'), { a: { b: 'c' } });
});
