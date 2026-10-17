import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

const both = (fn) => [undefined, { posix: true }].forEach((o) => fn(o));

test('leading ! negates bracket class, with and without posix', () => {
  both((o) => {
    assert.equal(isMatch('a', '[!abc]', o), false);
    assert.equal(isMatch('b', '[!abc]', o), false);
    assert.equal(isMatch('c', '[!abc]', o), false);
    assert.equal(isMatch('d', '[!abc]', o), true);
    assert.equal(isMatch('d', '[!a-c]', o), true);
    assert.equal(isMatch('b', '[!a-c]', o), false);
  });
});

test('leading ^ negates bracket class, with and without posix', () => {
  both((o) => {
    assert.equal(isMatch('a', '[^abc]', o), false);
    assert.equal(isMatch('d', '[^abc]', o), true);
  });
});

test('negated class embedded in larger patterns', () => {
  both((o) => {
    assert.equal(isMatch('xay', 'x[!abc]y', o), false);
    assert.equal(isMatch('xdy', 'x[!abc]y', o), true);
    assert.equal(isMatch('d.js', '[!abc].js', o), true);
    assert.equal(isMatch('a.js', '[!abc].js', o), false);
  });
});

test('non-leading ! in a class is a literal member', () => {
  both((o) => {
    assert.equal(isMatch('!', '[a!]', o), true);
    assert.equal(isMatch('a', '[a!]', o), true);
    assert.equal(isMatch('b', '[a!]', o), false);
    assert.equal(isMatch('!', '[ab!c]', o), true);
    assert.equal(isMatch('d', '[ab!c]', o), false);
  });
});

test('[!]] negates a closing bracket', () => {
  both((o) => {
    assert.equal(isMatch(']', '[!]]', o), false);
    assert.equal(isMatch('a', '[!]]', o), true);
  });
});

test('escaped \\! at class start stays literal, not negation', () => {
  both((o) => {
    assert.equal(isMatch('!', '[\\!abc]', o), true);
    assert.equal(isMatch('a', '[\\!abc]', o), true);
    assert.equal(isMatch('d', '[\\!abc]', o), false);
  });
});

test('unterminated [!] stays literal', () => {
  both((o) => {
    assert.equal(isMatch('[!]', '[!]', o), true);
    assert.equal(isMatch('a', '[!]', o), false);
  });
});

test('literalBrackets and nobracket options preserved', () => {
  assert.equal(isMatch('[!abc]', '[!abc]', { literalBrackets: true }), true);
  assert.equal(isMatch('d', '[!abc]', { literalBrackets: true }), false);
  assert.equal(isMatch('[abc]', '[abc]', { nobracket: true }), true);
  assert.equal(isMatch('a', '[abc]', { nobracket: true }), false);
  assert.equal(isMatch('a', '[abc]'), true);
});
