import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json')); const { isMatch } = require('./index.js');

const POSIX = [undefined, { posix: true }, { posix: false }];
const each = (name, fn) => POSIX.forEach(o => test(`${name} ${JSON.stringify(o ?? {})}`, () => fn(o)));
const m = (s, p, o) => isMatch(s, p, o);

// C1: leading ! negates a class (with and without posix)
each('C1 [!abc] rejects members', o => { for (const c of 'abc') assert.equal(m(c, '[!abc]', o), false, c); });
each('C1 [!abc] accepts non-members', o => { for (const c of ['d', 'z', '1', '!']) assert.equal(m(c, '[!abc]', o), true, c); });
each('C1 [!abc] is single char only', o => { assert.equal(m('dd', '[!abc]', o), false); assert.equal(m('', '[!abc]', o), false); });
each('C1 [!a-c] range', o => { assert.equal(m('b', '[!a-c]', o), false); assert.equal(m('d', '[!a-c]', o), true); });
each('C1 [!abc] never matches /', o => assert.equal(m('/', '[!abc]', o), false));

// C2: ^ equivalent to !
each('C2 [^abc]', o => { assert.equal(m('a', '[^abc]', o), false); assert.equal(m('d', '[^abc]', o), true); });
each('C2 [!abc] == [^abc]', o => { for (const c of ['a', 'b', 'd', '!', '^', ']', '[']) assert.equal(m(c, '[!abc]', o), m(c, '[^abc]', o), c); });

// C3: embedded in longer patterns
each('C3 *x[!a]y', o => {
  assert.equal(m('xby', '*x[!a]y', o), true); assert.equal(m('zzxby', '*x[!a]y', o), true);
  assert.equal(m('xay', '*x[!a]y', o), false); assert.equal(m('zzxay', '*x[!a]y', o), false);
  assert.equal(m('x/y', '*x[!a]y', o), false);
});
each('C3 a[!b]c and dir/[!a]*', o => {
  assert.equal(m('abc', 'a[!b]c', o), false); assert.equal(m('adc', 'a[!b]c', o), true);
  assert.equal(m('d/axe', 'd/[!a]*', o), false); assert.equal(m('d/bxe', 'd/[!a]*', o), true);
});

// C4: escaped \! is literal member
each('C4 [\\!a]', o => {
  assert.equal(m('!', '[\\!a]', o), true); assert.equal(m('a', '[\\!a]', o), true); assert.equal(m('b', '[\\!a]', o), false);
});
each('C4 *x[\\!a]y', o => {
  assert.equal(m('x!y', '*x[\\!a]y', o), true); assert.equal(m('xby', '*x[\\!a]y', o), false);
});
each('C4 escaped ! outside class', o => { assert.equal(m('!a', '\\!a', o), true); assert.equal(m('a', '\\!a', o), false); });

// C5: non-leading ! literal
each('C5 [a!]', o => {
  assert.equal(m('!', '[a!]', o), true); assert.equal(m('a', '[a!]', o), true); assert.equal(m('b', '[a!]', o), false);
});
each('C5 [ab!c] and *x[a!]y', o => {
  assert.equal(m('!', '[ab!c]', o), true); assert.equal(m('d', '[ab!c]', o), false);
  assert.equal(m('x!y', '*x[a!]y', o), true); assert.equal(m('xby', '*x[a!]y', o), false);
});

// C6: [!]] negates closing bracket
each('C6 [!]]', o => {
  assert.equal(m('a', '[!]]', o), true); assert.equal(m(']', '[!]]', o), false); assert.equal(m('!', '[!]]', o), true);
});
each('C6 [!]a] and *x[!]]y', o => {
  assert.equal(m('b', '[!]a]', o), true); assert.equal(m('a', '[!]a]', o), false); assert.equal(m(']', '[!]a]', o), false);
  assert.equal(m('xay', '*x[!]]y', o), true); assert.equal(m('x]y', '*x[!]]y', o), false);
});

// C7: unterminated [!] stays literal
each('C7 [!]', o => {
  assert.equal(m('[!]', '[!]', o), true); assert.equal(m('a', '[!]', o), false); assert.equal(m('!', '[!]', o), false);
});
each('C7 *x[!]y', o => {
  assert.equal(m('x[!]y', '*x[!]y', o), true); assert.equal(m('xay', '*x[!]y', o), false); assert.equal(m('x!y', '*x[!]y', o), false);
});

// C8: literalBrackets
test('C8 literalBrackets:false treats [!abc] as class', () => {
  const o = { literalBrackets: false };
  assert.equal(m('a', '[!abc]', o), false); assert.equal(m('d', '[!abc]', o), true);
});
test('C8 literalBrackets:false + posix', () => {
  const o = { literalBrackets: false, posix: true };
  assert.equal(m('a', '[!abc]', o), false); assert.equal(m('d', '[!abc]', o), true);
});
test('C8 literalBrackets:true [!abc] behaves like [^abc]', () => {
  for (const o of [{ literalBrackets: true }, { literalBrackets: true, posix: true }])
    for (const c of ['a', 'd', '[!abc]', '[^abc]']) assert.equal(m(c, '[!abc]', o), m(c, '[^abc]', o), c);
});
test('C8 literalBrackets:true plain [abc] literal, :false class, default both', () => {
  assert.equal(m('[abc]', '[abc]', { literalBrackets: true }), true); assert.equal(m('a', '[abc]', { literalBrackets: true }), false);
  assert.equal(m('a', '[abc]', { literalBrackets: false }), true);   assert.equal(m('a', '[abc]'), true); assert.equal(m('[abc]', '[abc]'), true);
});
test('C8 literalBrackets non-leading ! and [!] unaffected', () => {
  assert.equal(m('!', '[a!]', { literalBrackets: false }), true); assert.equal(m('b', '[a!]', { literalBrackets: false }), false);
  assert.equal(m('[a!]', '[a!]', { literalBrackets: true }), true);
  assert.equal(m('[!]', '[!]', { literalBrackets: true }), true); assert.equal(m('a', '[!]', { literalBrackets: true }), false);
  assert.equal(m('[!]', '[!]', { literalBrackets: false }), true); assert.equal(m('a', '[!]', { literalBrackets: false }), false);
});

// C9: nobracket
each('C9 nobracket [!abc] is literal text', o => {
  const n = { ...o, nobracket: true };
  assert.equal(m('[!abc]', '[!abc]', n), true); assert.equal(m('a', '[!abc]', n), false); assert.equal(m('d', '[!abc]', n), false);
});
each('C9 nobracket [!]] / [!] / *x[!a]y literal', o => {
  const n = { ...o, nobracket: true };
  assert.equal(m('[!]]', '[!]]', n), true); assert.equal(m('a', '[!]]', n), false);
  assert.equal(m('[!]', '[!]', n), true); assert.equal(m('a', '[!]', n), false);
  assert.equal(m('x[!a]y', '*x[!a]y', n), true); assert.equal(m('xby', '*x[!a]y', n), false);
});
test('C9 nobracket [!abc] == [^abc] shape (both literal)', () => {
  assert.equal(m('[^abc]', '[^abc]', { nobracket: true }), true); assert.equal(m('d', '[^abc]', { nobracket: true }), false);
});

// C10: posix class interplay
each('C10 [[:alpha:]] and [![:alpha:]]', o => {
  assert.equal(m('a', '[[:alpha:]]', o), true); assert.equal(m('1', '[[:alpha:]]', o), false);
  assert.equal(m('1', '[![:alpha:]]', o), true); assert.equal(m('a', '[![:alpha:]]', o), false);
});
each('C10 [^[:digit:]] and [![:digit:]x]', o => {
  assert.equal(m('a', '[^[:digit:]]', o), true); assert.equal(m('1', '[^[:digit:]]', o), false);
  assert.equal(m('x', '[![:digit:]x]', o), false); assert.equal(m('y', '[![:digit:]x]', o), true);
});
