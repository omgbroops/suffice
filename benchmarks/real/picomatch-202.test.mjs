import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');
// Adapted from micromatch/picomatch PR #202.
test('globstar matches paths containing newlines', () => {
  assert.ok(isMatch('hello\nworld', '**'));
  assert.ok(isMatch('foo/hello\nworld', '**/*'));
  assert.ok(isMatch('foo\nbar/bar', '**/bar'));
  assert.ok(isMatch('foo\nbar/baz\nqux', '**/**'));
  assert.ok(isMatch('hello\rworld', '**'));
  assert.ok(isMatch('foo/hello\r\nworld', '**/*'));
  assert.ok(isMatch('foo\rbar/bar', '**/bar'));
});
