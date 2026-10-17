import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { resolve } from 'node:path'; const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json')); const { isMatch } = require('./index.js');

const P = [{}, { posix: false }, { posix: true }];
const t = (s, p, exp, o = {}) => { for (const px of P) assert.equal(isMatch(s, p, { ...px, ...o }), exp, `${JSON.stringify([s, p, { ...px, ...o }])}`); };

test('C1 leading ! negates class', () => {
  t('a', '[!abc]', false); t('d', '[!abc]', true);
  t('c', '[!abc]', false); t('z', '[!abc]', true);
  t('xay', 'x[!abc]y', false); t('xdy', 'x[!abc]y', true);
  t('a/a', 'a/[!abc]', false); t('a/d', 'a/[!abc]', true);
});
test('C1b leading ! with ranges', () => {
  t('2', '[!0-4]', false); t('5', '[!0-4]', true);
  t('b', '[!a-c]', false); t('x', '[!a-c]', true);
});
test('C2 leading ^ negates class', () => {
  t('a', '[^abc]', false); t('d', '[^abc]', true);
  t('xay', 'x[^abc]y', false); t('xdy', 'x[^abc]y', true);
  t('5', '[^0-4]', true); t('2', '[^0-4]', false);
});
test('C3 explicit posix true/false both negate (README examples)', () => {
  for (const o of [{ posix: true }, { posix: false }]) {
    assert.equal(isMatch('a', '[!abc]', o), false);
    assert.equal(isMatch('d', '[!abc]', o), true);
    assert.equal(isMatch('b', '[!ac]', o), true);
    assert.equal(isMatch('c', '[!ac]', o), false);
  }
});
test('C3b negated class is a single char, ! itself is not in set unless listed', () => {
  t('!', '[!abc]', true); t('!', '[!a!]', false); t('d', '[!a!]', true);
});
test('C4 escaped \\! is literal, not negation', () => {
  t('!', '[\\!]', true); t('a', '[\\!]', false);
  t('!', '[\\!a]', true); t('a', '[\\!a]', true); t('b', '[\\!a]', false);
});
test('C5 non-leading ! is literal member', () => {
  t('!', '[a!b]', true); t('a', '[a!b]', true); t('c', '[a!b]', false);
  t('!', '[ab!]', true); t('c', '[ab!]', false);
  t('xdy', 'x[a!]y', false); t('x!y', 'x[a!]y', true);
});
test('C5b non-leading ^ is literal member', () => {
  t('^', '[a^b]', true); t('c', '[a^b]', false); t('!', '[a^b]', false);
});
test('C6 [!]] negates closing bracket', () => {
  t('a', '[!]]', true); t('x', '[!]]', true); t(']', '[!]]', false);
  t('xa', 'x[!]]', true); t('x]', 'x[!]]', false);
  t('a', '[^]]', true); t(']', '[^]]', false);
});
test('C7 unterminated [!] stays literal', () => {
  t('[!]', '[!]', true); t('a', '[!]', false);
  t('[!', '[!', true); t('a', '[!', false);
  t('[!a', '[!a', true); t('ab', '[!a', false);
  t('x[!]', 'x[!]', true); t('xa', 'x[!]', false);
});
test('C8 literalBrackets option preserved', () => {
  const o = { literalBrackets: true };
  t('[x]', '[x]', true, o); t('x', '[x]', false, o);
  t('[abc]', '[abc]', true, o); t('a', '[abc]', false, o);
  t('[!x]', '[!x]', true, o);
  assert.equal(isMatch('x', '[x]'), true);
  assert.equal(isMatch('x', '[x]', { literalBrackets: false }), true);
});
test('C9 nobracket option preserved', () => {
  const o = { nobracket: true };
  t('[x]', '[x]', true, o); t('x', '[x]', false, o);
  t('[!x]', '[!x]', true, o); t('y', '[!x]', false, o); t('x', '[!x]', false, o);
  t('[!abc]', '[!abc]', true, o); t('d', '[!abc]', false, o); t('a', '[!abc]', false, o);
});
