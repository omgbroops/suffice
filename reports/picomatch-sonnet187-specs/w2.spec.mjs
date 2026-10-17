import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { resolve } from 'node:path'; const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json')); const { isMatch } = require('./index.js');

test('leading ! negates the class', () => {
  assert.equal(isMatch('a', '[!abc]'), false);
  assert.equal(isMatch('d', '[!abc]'), true);
});

test('leading ! negates with posix option', () => {
  assert.equal(isMatch('a', '[!abc]', { posix: true }), false);
  assert.equal(isMatch('d', '[!abc]', { posix: true }), true);
});

test('leading ^ negates the class, with and without posix', () => {
  for (const o of [undefined, { posix: true }]) {
    assert.equal(isMatch('a', '[^abc]', o), false);
    assert.equal(isMatch('d', '[^abc]', o), true);
  }
});

test('escaped \\! is a literal member, not negation', () => {
  assert.equal(isMatch('!', '[\\!abc]'), true);
  assert.equal(isMatch('a', '[\\!abc]'), true);
  assert.equal(isMatch('d', '[\\!abc]'), false);
});

test('non-leading ! is a literal', () => {
  assert.equal(isMatch('!', '[a!]'), true);
  assert.equal(isMatch('a', '[a!]'), true);
  assert.equal(isMatch('b', '[a!]'), false);
});

test('[!]] negates a closing bracket', () => {
  assert.equal(isMatch(']', '[!]]'), false);
  assert.equal(isMatch('a', '[!]]'), true);
  assert.equal(isMatch('a', '[!]]', { posix: true }), true);
});

test('unterminated [!] stays literal', () => {
  assert.equal(isMatch('[!]', '[!]'), true);
  assert.equal(isMatch('a', '[!]'), false);
});

test('literalBrackets and nobracket options keep brackets literal', () => {
  for (const o of [{ literalBrackets: true }, { nobracket: true }, { nobracket: true, posix: true }]) {
    assert.equal(isMatch('[!abc]', '[!abc]', o), true);
    assert.equal(isMatch('d', '[!abc]', o), false);
  }
});
