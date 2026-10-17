import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { resolve } from 'node:path'; const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json')); const { isMatch } = require('./index.js');

const modes = { default: undefined, posix: { posix: true } };
const each = (name, fn) => { for (const [m, o] of Object.entries(modes)) test(`${name} [${m}]`, () => fn(o)); };
const y = (s, p, o) => assert.equal(isMatch(s, p, o), true, `${s} ~ ${p} ${JSON.stringify(o)}`);
const n = (s, p, o) => assert.equal(isMatch(s, p, o), false, `${s} !~ ${p} ${JSON.stringify(o)}`);

// C1: [!abc] negates (README example)
each('C1 [!abc] example', (o) => { n('a', '[!abc]', o); y('d', '[!abc]', o); });
each('C1 adversarial: other members, other chars', (o) => { n('b', '[!abc]', o); n('c', '[!abc]', o); y('x', '[!abc]', o); y('Z', '[!abc]', o); });
each('C1 adversarial: inside longer pattern', (o) => { n('xa.txt', 'x[!abc].txt', o); y('xd.txt', 'x[!abc].txt', o); y('src/q9', 'src/[!abc]9', o); n('src/b9', 'src/[!abc]9', o); });
each('C1 adversarial: ranges and star', (o) => { n('b', '[!a-c]', o); y('e', '[!a-c]', o); n('5', '[!0-9]', o); y('x', '[!0-9]', o); y('f7', '*[!a-c]7', o); n('fa7', 'f[!a-c]7', o); });

// C2: ^ negates
each('C2 [^abc] example', (o) => { n('a', '[^abc]', o); y('d', '[^abc]', o); });
each('C2 adversarial', (o) => { n('x', '[^xyz]', o); y('a', '[^xyz]', o); n('y', '[^xyz]', o); n('m', '[^m-p]', o); y('a/q/z', 'a/[^m-p]/z', o); n('a/n/z', 'a/[^m-p]/z', o); });

// C3: with and without posix (same results as default)
test('C3 default and posix agree', () => {
  for (const [s, p] of [['a', '[!abc]'], ['d', '[!abc]'], ['e', '[!d-f]'], ['q', '[!d-f]'], ['k1', 'k[!0-4]'], ['k7', 'k[!0-4]']]) {
    assert.equal(isMatch(s, p), isMatch(s, p, { posix: true }), `${s} ~ ${p}`);
  }
});
test('C3 adversarial: posix negation with ^ and ranges', () => {
  n('a', '[!abc]', { posix: true }); y('d', '[!abc]', { posix: true });
  n('7', '[!5-9]', { posix: true }); y('4', '[!5-9]', { posix: true });
  n('7', '[!5-9]'); y('4', '[!5-9]');
});

// C4: escaped \! preserved
each('C4 escaped ! is literal member', (o) => { y('!', '[\\!]', o); n('a', '[\\!]', o); });
each('C4 adversarial: with other members, in longer pattern', (o) => { y('!', '[\\!a]', o); y('a', '[\\!a]', o); n('b', '[\\!a]', o); y('x!y', 'x[\\!]y', o); n('xzy', 'x[\\!]y', o); y('!', '[b\\!]', o); n('c', '[b\\!]', o); });

// C5: non-leading ! literal
each('C5 [a!] literal !', (o) => { y('!', '[a!]', o); y('a', '[a!]', o); n('b', '[a!]', o); });
each('C5 adversarial: other positions/chars', (o) => { y('!', '[ab!]', o); n('c', '[ab!]', o); y('!', '[a-c!]', o); y('b', '[a-c!]', o); n('d', '[a-c!]', o); y('f!', 'f[x!]', o); n('fz', 'f[x!]', o); });
each('C5 adversarial: non-leading ^ literal too', (o) => { y('^', '[a^]', o); y('a', '[a^]', o); n('b', '[a^]', o); });

// C6: [!]] negates closing bracket
each('C6 [!]] example', (o) => { y('a', '[!]]', o); n(']', '[!]]', o); });
each('C6 adversarial', (o) => { y('z', '[!]]', o); y('xay', 'x[!]]y', o); n('x]y', 'x[!]]y', o); y('7', '[!]]', o); });

// C7: unterminated [!] stays literal
each('C7 [!] literal', (o) => { y('[!]', '[!]', o); n('a', '[!]', o); });
each('C7 adversarial', (o) => { n('b', '[!]', o); y('x/[!]', 'x/[!]', o); n('x/a', 'x/[!]', o); y('[!]', '[!]', o); y('[!', '[!', o); });

// C8: literalBrackets preserved
test('C8 literalBrackets matches literal brackets', () => {
  y('[a]', '[a]', { literalBrackets: true }); n('a', '[a]', { literalBrackets: true });
});
test('C8 adversarial: other contents, with and without option', () => {
  y('[xyz]', '[xyz]', { literalBrackets: true }); n('y', '[xyz]', { literalBrackets: true });
  y('f[1]', 'f[1]', { literalBrackets: true }); n('f1', 'f[1]', { literalBrackets: true });
  y('[!a]', '[!a]', { literalBrackets: true }); n('b', '[!a]', { literalBrackets: true });
  y('a', '[a]'); y('y', '[xyz]');
});

// C9: nobracket preserved
each('C9 nobracket treats [] literally', (o) => { y('[a]', '[a]', { ...o, nobracket: true }); n('a', '[a]', { ...o, nobracket: true }); });
each('C9 adversarial: negation under nobracket stays literal', (o) => { const p = { ...o, nobracket: true }; y('[!a]', '[!a]', p); n('b', '[!a]', p); n('d', '[!abc]', p); y('[!abc]', '[!abc]', p); y('f[1]', 'f[1]', p); n('f1', 'f[1]', p); });
