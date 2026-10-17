import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

test('required group with trailing globstar matches the parent path', () => {
  assert.equal(isMatch('test/utils', 'test(/utils/**)'), true);
});

test('required group with trailing globstar still matches paths below', () => {
  assert.equal(isMatch('test/utils/a', 'test(/utils/**)'), true);
  assert.equal(isMatch('test/utils/a/b/c', 'test(/utils/**)'), true);
});

test('required group does not match the bare prefix or unrelated paths', () => {
  assert.equal(isMatch('test', 'test(/utils/**)'), false);
  assert.equal(isMatch('test/other', 'test(/utils/**)'), false);
  assert.equal(isMatch('test/other/a', 'test(/utils/**)'), false);
  assert.equal(isMatch('testutils', 'test(/utils/**)'), false);
});

test('optional group with trailing globstar matches prefix, parent and below', () => {
  assert.equal(isMatch('test', 'test?(/utils/**)'), true);
  assert.equal(isMatch('test/utils', 'test?(/utils/**)'), true);
  assert.equal(isMatch('test/utils/a/b', 'test?(/utils/**)'), true);
  assert.equal(isMatch('test/other', 'test?(/utils/**)'), false);
});

test('strictSlashes still rejects a bare parent for grouped globstar', () => {
  const opts = { strictSlashes: true };
  assert.equal(isMatch('test/utils/', 'test(/utils/**)', opts), true);
  assert.equal(isMatch('test/utils', 'test(/utils/**)', opts), false);
  assert.equal(isMatch('test/utils/a', 'test(/utils/**)', opts), true);
});

test('content following the group must still match', () => {
  assert.equal(isMatch('test/utils/a/x.js', 'test(/utils/**)/x.js'), true);
  assert.equal(isMatch('test/utils', 'test(/utils/**)/x.js'), false);
  assert.equal(isMatch('test/utils/y.js', 'test(/utils/**)/x.js'), false);
});

test('plain non-group globstar behavior is unchanged', () => {
  assert.equal(isMatch('test/utils', 'test/utils/**'), true);
  assert.equal(isMatch('test/utils/a', 'test/utils/**'), true);
  assert.equal(isMatch('test', 'test/utils/**'), false);
  assert.equal(isMatch('a/b', 'a/**/b'), true);
  assert.equal(isMatch('a/x/y/b', 'a/**/b'), true);
  assert.equal(isMatch('a/bc', 'a/**/b'), false);
});
