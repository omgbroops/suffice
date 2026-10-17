import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const bytes = require('./index.js');
// Adapted from visionmedia/bytes.js issue #51 / fix released in 3.1.1.
test('thousandsSeparator does not touch the fractional part', () => {
  assert.equal(bytes(1234567.891234, { unit: 'B', decimalPlaces: 6, thousandsSeparator: ',' }), '1,234,567.891234B');
  assert.equal(bytes(1234.5678, { unit: 'B', decimalPlaces: 4, thousandsSeparator: ',' }), '1,234.5678B');
  assert.equal(bytes(1e9 + 0.123456, { unit: 'B', decimalPlaces: 6, thousandsSeparator: '.' }), '1.000.000.000.123456B');
});
test('integer part grouping and other options are preserved', () => {
  assert.equal(bytes(1234567, { unit: 'B', thousandsSeparator: ',' }), '1,234,567B');
  assert.equal(bytes(-1234567.5, { unit: 'B', thousandsSeparator: ',' }), '-1,234,567.5B');
  assert.equal(bytes(1234567, { unit: 'B', thousandsSeparator: ',', fixedDecimals: true }), '1,234,567.00B');
  assert.equal(bytes(1234567, { unit: 'B', thousandsSeparator: ',', unitSeparator: ' ' }), '1,234,567 B');
  assert.equal(bytes(1500, { unit: 'B', decimalPlaces: 0, thousandsSeparator: ',' }), '1,500B');
  assert.equal(bytes(123456.789, { unit: 'B' }), '123456.79B');
  assert.equal(bytes(2.5 * 1024, { thousandsSeparator: ',' }), '2.5KB');
});
