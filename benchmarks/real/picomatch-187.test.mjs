import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');
// Adapted from micromatch/picomatch PR #196 (issue #187).
test('leading ! negates a bracket class', () => {
  for (const c of 'abc') assert.ok(!isMatch(c, '[!abc]'));
  assert.ok(isMatch('d', '[!abc]') && isMatch('x', '[!abc]'));
  assert.ok(!isMatch('a', '[!a-c]') && !isMatch('c', '[!a-c]') && isMatch('d', '[!a-c]'));
  assert.ok(!isMatch('a', '[^abc]') && isMatch('d', '[^abc]'));
  assert.ok(!isMatch('abc', 'a[!b]c') && isMatch('axc', 'a[!b]c'));
  assert.ok(!isMatch('ad', '[!abc]d') && isMatch('xd', '[!abc]d'));
  assert.ok(!isMatch('/', '[!a]') && !isMatch('a/b', 'a[!x]b'));
  assert.ok(!isMatch('a', '[!abc]', { posix: false }) && isMatch('d', '[!abc]', { posix: false }));
});
test('escaped, trailing and first-position specials stay literal or negated correctly', () => {
  assert.ok(isMatch('!', '[\\!a]') && isMatch('a', '[\\!a]') && !isMatch('b', '[\\!a]'));
  assert.ok(isMatch('!', '[a!]') && isMatch('a', '[a!]') && !isMatch('b', '[a!]'));
  assert.ok(!isMatch('!', '[!!]') && isMatch('a', '[!!]'));
  assert.ok(!isMatch(']', '[!]]') && isMatch('a', '[!]]'));
  assert.ok(isMatch('zx[!]y', '*x[!]y') && isMatch('zx!y', '*x[!]y'));
});
test('literalBrackets and nobracket options keep brackets literal', () => {
  for (const options of [{ literalBrackets: true }, { nobracket: true }]) {
    assert.ok(isMatch('zx[!a]y', '*x[!a]y', options));
    assert.ok(!isMatch('xby', 'x[!a]y', options));
  }
});
