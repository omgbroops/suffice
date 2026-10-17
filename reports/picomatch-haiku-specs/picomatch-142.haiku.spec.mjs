import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

test('required group ending in globstar matches parent path', () => {
  assert.equal(isMatch('test/utils', 'test(/utils/**)'), true);
  assert.equal(isMatch('test/utils/a/b.js', 'test(/utils/**)'), true);
});

test('optional group ending in globstar matches parent path', () => {
  assert.equal(isMatch('test/utils', 'test?(/utils/**)'), true);
  assert.equal(isMatch('test/utils/a.js', 'test?(/utils/**)'), true);
});

test('required group does not match bare prefix', () => {
  assert.equal(isMatch('test', 'test(/utils/**)'), false);
  assert.equal(isMatch('test', 'test(/utils/**)', { strictSlashes: true }), false);
});

test('text after group still must match', () => {
  assert.equal(isMatch('test/utils/a/index.js', 'test(/utils/**)/index.js'), true);
  assert.equal(isMatch('test/other/index.js', 'test(/utils/**)/index.js'), false);
});
