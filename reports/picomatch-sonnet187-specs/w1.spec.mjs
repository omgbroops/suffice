import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { resolve } from 'node:path'; const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json')); const { isMatch } = require('./index.js');

test('leading ! negates the class', () => {
  assert.equal(isMatch('a', '[!abc]'), false);
  assert.equal(isMatch('d', '[!abc]'), true);
});

test('leading ^ negates the class', () => {
  assert.equal(isMatch('a', '[^abc]'), false);
  assert.equal(isMatch('d', '[^abc]'), true);
});

test('negation works with posix option', () => {
  assert.equal(isMatch('a', '[!abc]', { posix: true }), false);
  assert.equal(isMatch('d', '[!abc]', { posix: true }), true);
  assert.equal(isMatch('a', '[^abc]', { posix: true }), false);
  assert.equal(isMatch('d', '[^abc]', { posix: true }), true);
});

test('escaped \\! is literal inside the class', () => {
  assert.equal(isMatch('!', '[\\!abc]'), true);
  assert.equal(isMatch('a', '[\\!abc]'), true);
  assert.equal(isMatch('d', '[\\!abc]'), false);
});

test('non-leading ! is a literal member', () => {
  assert.equal(isMatch('!', '[a!]'), true);
  assert.equal(isMatch('a', '[a!]'), true);
  assert.equal(isMatch('b', '[a!]'), false);
  assert.equal(isMatch('!', '[a!]', { posix: true }), true);
});

test('[!]] negates a closing bracket', () => {
  assert.equal(isMatch(']', '[!]]'), false);
  assert.equal(isMatch('a', '[!]]'), true);
  assert.equal(isMatch(']', '[!]]', { posix: true }), false);
  assert.equal(isMatch('a', '[!]]', { posix: true }), true);
});

test('unterminated [!] stays literal', () => {
  assert.equal(isMatch('[!]', '[!]'), true);
  assert.equal(isMatch('a', '[!]'), false);
  assert.equal(isMatch('[!]', '[!]', { posix: true }), true);
});

test('literalBrackets and nobracket options keep brackets literal', () => {
  assert.equal(isMatch('[!abc]', '[!abc]', { literalBrackets: true }), true);
  assert.equal(isMatch('d', '[!abc]', { literalBrackets: true }), false);
  assert.equal(isMatch('[!abc]', '[!abc]', { nobracket: true }), true);
  assert.equal(isMatch('d', '[!abc]', { nobracket: true }), false);
  assert.equal(isMatch('d', '[!abc]', { nobracket: true, posix: true }), false);
});
