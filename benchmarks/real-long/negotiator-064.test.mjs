import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const Negotiator = require('.');
// Adapted from jshttp/negotiator 0.6.4: optional preferred-order argument.
const mk = h => new Negotiator({ headers: h });
test('encodings accepts a preferred order that reorders results', () => {
  const neg = mk({ 'accept-encoding': 'gzip, deflate, br' });
  assert.deepEqual(neg.encodings(['deflate', 'br'], ['br']), ['br', 'deflate']);
  assert.deepEqual(neg.encodings(['br', 'gzip'], ['br']), ['br', 'gzip']);
  assert.deepEqual(neg.encodings(['gzip', 'br'], ['gzip']), ['gzip', 'br']);
});
test('preferred entries absent from the available list are ignored', () => {
  const neg = mk({ 'accept-encoding': 'gzip, deflate, br' });
  assert.deepEqual(neg.encodings(['br', 'gzip'], ['xz', 'br']), ['br', 'gzip']);
});
test('no preferred argument keeps q-value ordering', () => {
  const neg = mk({ 'accept-encoding': 'gzip, deflate, br' });
  assert.deepEqual(neg.encodings(['deflate', 'br']), ['deflate', 'br']);
  assert.deepEqual(neg.encodings(['br', 'gzip']), ['gzip', 'br']);
  assert.deepEqual(mk({ 'accept-encoding': 'gzip;q=0.5, br;q=1' }).encodings(['gzip', 'br']), ['br', 'gzip']);
});
