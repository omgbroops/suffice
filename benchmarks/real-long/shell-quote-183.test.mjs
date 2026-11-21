import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const quote = require('./quote.js');
// Adapted from ljharb/shell-quote 1.8.3: empty strings are quoted and a
// backslash anywhere triggers quoting.
test('empty arguments are quoted so they survive the shell', () => {
  assert.equal(quote(['']), "''");
  assert.equal(quote(['x', '']), "x ''");
});
test('arguments containing a backslash are single-quoted', () => {
  assert.equal(quote(['a\\b']), "'a\\b'");
  assert.equal(quote(['a b\\c']), "'a b\\c'");
});
test('quoting is preserved for spaces and specials', () => {
  assert.equal(quote(['a b']), "'a b'");
  assert.equal(quote(['a"b']), '\'a"b\'');
  assert.equal(quote(['a b', "c'd"]), '\'a b\' "c\'d"');
});
test('plain words and non-strings are unchanged', () => {
  assert.equal(quote(['abc']), 'abc');
  assert.equal(quote([0, 'x']), '0 x');
});
