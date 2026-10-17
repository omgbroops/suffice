import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

test('paren group with trailing globstar matches bare directory path', () => {
  assert.equal(isMatch('test/utils', 'test(/utils/**)'), true);
});

test('paren group with trailing globstar matches nested files', () => {
  assert.equal(isMatch('test/utils/a.js', 'test(/utils/**)'), true);
  assert.equal(isMatch('test/utils/a/b/c.js', 'test(/utils/**)'), true);
});

test('paren group globstar still rejects unrelated paths', () => {
  assert.equal(isMatch('test', 'test(/utils/**)'), false);
  assert.equal(isMatch('test/other', 'test(/utils/**)'), false);
  assert.equal(isMatch('test/utilsx', 'test(/utils/**)'), false);
  assert.equal(isMatch('other/utils', 'test(/utils/**)'), false);
});

test('guard: plain globstar without parens still matches bare directory', () => {
  assert.equal(isMatch('test/utils', 'test/utils/**'), true);
  assert.equal(isMatch('test/utils/a.js', 'test/utils/**'), true);
  assert.equal(isMatch('test/utilsx', 'test/utils/**'), false);
});

test('guard: extglob alternation with globstar unchanged', () => {
  assert.equal(isMatch('a/b', '@(a|c)/**'), true);
  assert.equal(isMatch('c/d/e', '@(a|c)/**'), true);
  assert.equal(isMatch('x/b', '@(a|c)/**'), false);
});
