import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

test('negated bracket rejects a listed char', () => {
  assert.equal(isMatch('a', '[!abc]'), false);
  assert.equal(isMatch('b', '[!abc]'), false);
  assert.equal(isMatch('c', '[!abc]'), false);
});

test('negated bracket accepts an unlisted char', () => {
  assert.equal(isMatch('d', '[!abc]'), true);
  assert.equal(isMatch('z', '[!abc]'), true);
});

test('negated bracket matches exactly one char', () => {
  assert.equal(isMatch('', '[!abc]'), false);
  assert.equal(isMatch('dd', '[!abc]'), false);
});

test('guard: positive bracket unchanged', () => {
  assert.equal(isMatch('a', '[abc]'), true);
  assert.equal(isMatch('d', '[abc]'), false);
});

test('guard: negated bracket in context and range negation', () => {
  assert.equal(isMatch('xdy', 'x[!abc]y'), true);
  assert.equal(isMatch('xay', 'x[!abc]y'), false);
  assert.equal(isMatch('m', '[!a-c]'), true);
  assert.equal(isMatch('b', '[!a-c]'), false);
});

test('guard: caret negation and leading-bang glob negation still work', () => {
  assert.equal(isMatch('a', '[^abc]'), false);
  assert.equal(isMatch('d', '[^abc]'), true);
  assert.equal(isMatch('foo.js', '!*.md'), true);
  assert.equal(isMatch('foo.md', '!*.md'), false);
});
