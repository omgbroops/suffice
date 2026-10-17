import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { resolve } from 'node:path'; const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json')); const { isMatch } = require('./index.js');

const both = [undefined, { posix: true }];
const eachOpt = (name, fn) => both.forEach(o => test(`${name} ${JSON.stringify(o ?? {})}`, () => fn(o)));

// C1: [!abc] negates (README examples)
eachOpt('C1 example a', o => { assert.equal(isMatch('a', '[!abc]', o), false); assert.equal(isMatch('c', '[!abc]', o), false); });
eachOpt('C1 example d', o => { assert.equal(isMatch('d', '[!abc]', o), true); assert.equal(isMatch('z', '[!abc]', o), true); });
eachOpt('C1 ranges', o => { assert.equal(isMatch('5', '[!0-9]', o), false); assert.equal(isMatch('q', '[!0-9]', o), true); });
eachOpt('C1 inside longer pattern', o => {
  assert.equal(isMatch('xay', 'x[!a]y', o), false); assert.equal(isMatch('xby', 'x[!a]y', o), true);
  assert.equal(isMatch('foo/bar.js', 'foo/[!b]ar.js', o), false); assert.equal(isMatch('foo/car.js', 'foo/[!b]ar.js', o), true);
});

// C2: [^xyz] negates
eachOpt('C2 caret negates', o => { assert.equal(isMatch('x', '[^xyz]', o), false); assert.equal(isMatch('b', '[^xyz]', o), true); });
eachOpt('C2 caret in longer pattern', o => { assert.equal(isMatch('1m2', '1[^m]2', o), false); assert.equal(isMatch('1n2', '1[^m]2', o), true); });
eachOpt('C2 non-leading caret is literal', o => { assert.equal(isMatch('^', '[a^]', o), true); assert.equal(isMatch('b', '[a^]', o), false); });

// C3: with and without posix agree
test('C3 posix and default agree', () => {
  for (const [s, p] of [['a', '[!abc]'], ['d', '[!abc]'], ['x', '[^xyz]'], ['w', '[^xyz]'], ['xa', 'x[!a]'], ['xb', 'x[!a]'], ['!', '[!abc]']])
    assert.equal(isMatch(s, p), isMatch(s, p, { posix: true }), `${s} ${p}`);
});
eachOpt('C3 negated class does not match negated char itself', o => { assert.equal(isMatch('!', '[!abc]', o), true); assert.equal(isMatch('!', '[!!]', o), false); });

// C4: escaped \! preserved
eachOpt('C4 escaped bang literal-only', o => {
  assert.equal(isMatch('!', '[\\!abc]', o), true); assert.equal(isMatch('a', '[\\!abc]', o), true); assert.equal(isMatch('d', '[\\!abc]', o), false);
});
eachOpt('C4 escaped bang in longer pattern', o => {
  assert.equal(isMatch('x!', 'x[\\!y]', o), true); assert.equal(isMatch('xy', 'x[\\!y]', o), true); assert.equal(isMatch('xz', 'x[\\!y]', o), false);
});

// C5: non-leading ! literal
eachOpt('C5 non-leading bang', o => { assert.equal(isMatch('!', '[a!]', o), true); assert.equal(isMatch('a', '[a!]', o), true); assert.equal(isMatch('b', '[a!]', o), false); });
eachOpt('C5 non-leading bang mid-class', o => { assert.equal(isMatch('!', '[ab!c]', o), true); assert.equal(isMatch('d', '[ab!c]', o), false); assert.equal(isMatch('c', '[ab!c]', o), true); });

// C6: [!]] negates closing bracket
eachOpt('C6 [!]]', o => { assert.equal(isMatch(']', '[!]]', o), false); assert.equal(isMatch('a', '[!]]', o), true); assert.equal(isMatch('!', '[!]]', o), true); });
eachOpt('C6 [!]] in longer pattern', o => { assert.equal(isMatch('x]y', 'x[!]]y', o), false); assert.equal(isMatch('xqy', 'x[!]]y', o), true); });

// C7: unterminated [!] stays literal
eachOpt('C7 [!] literal', o => { assert.equal(isMatch('[!]', '[!]', o), true); assert.equal(isMatch('a', '[!]', o), false); });
eachOpt('C7 [! unterminated', o => { assert.equal(isMatch('x[!', 'x[!', o), true); assert.equal(isMatch('x[!a', 'x[!a', o), true); assert.equal(isMatch('xb', 'x[!a', o), false); });

// C8: literalBrackets
test('C8 literalBrackets', () => {
  const o = { literalBrackets: true };
  assert.equal(isMatch('[!abc]', '[!abc]', o), true); assert.equal(isMatch('d', '[!abc]', o), false); assert.equal(isMatch('a', '[!abc]', o), false);
  assert.equal(isMatch('[abc]', '[abc]', o), true); assert.equal(isMatch('a', '[abc]', o), false);
});
test('C8 literalBrackets + longer pattern', () => {
  const o = { literalBrackets: true };
  assert.equal(isMatch('x[!y]z', 'x[!y]z', o), true); assert.equal(isMatch('xaz', 'x[!y]z', o), false);
});

// C9: nobracket
test('C9 nobracket', () => {
  const o = { nobracket: true };
  assert.equal(isMatch('[!abc]', '[!abc]', o), true); assert.equal(isMatch('d', '[!abc]', o), false); assert.equal(isMatch('a', '[!abc]', o), false);
  assert.equal(isMatch('[abc]', '[abc]', o), true); assert.equal(isMatch('a', '[abc]', o), false);
});
test('C9 nobracket + longer, posix', () => {
  const o = { nobracket: true, posix: true };
  assert.equal(isMatch('x[^y]z', 'x[^y]z', o), true); assert.equal(isMatch('xaz', 'x[^y]z', o), false);
});
