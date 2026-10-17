import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const bytes = require('./index.js');
test('format basics', () => {
  assert.equal(bytes(1024), '1KB');
  assert.equal(bytes(1536), '1.5KB');
  assert.equal(bytes(1024, { unitSeparator: ' ' }), '1 KB');
  assert.equal(bytes(1024, { fixedDecimals: true }), '1.00KB');
  assert.equal(bytes(-1024), '-1KB');
});
test('thousandsSeparator on integer parts', () => {
  assert.equal(bytes(1000, { unit: 'B', thousandsSeparator: ',' }), '1,000B');
  assert.equal(bytes(1234567, { unit: 'B', thousandsSeparator: ' ' }), '1 234 567B');
});
test('parse', () => {
  assert.equal(bytes('1KB'), 1024);
  assert.equal(bytes('1.5mb'), 1572864);
});
