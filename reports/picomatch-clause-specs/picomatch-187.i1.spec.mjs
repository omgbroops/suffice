import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { resolve } from 'node:path'; const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json')); const { isMatch } = require('./index.js');

// rows: [input, pattern, expected]; run under each option set
const run = (name, opts, rows) => test(name, () => {
  for (const [s, p, want] of rows) {
    assert.equal(isMatch(s, p, opts), want, `isMatch(${JSON.stringify(s)}, ${JSON.stringify(p)}, ${JSON.stringify(opts)}) should be ${want}`);
  }
});

const OPTS = { default: undefined, posix: { posix: true }, noposix: { posix: false } };

// C1: leading ! negates the class (README examples), with and without posix
const c1 = [['a', '[!abc]', false], ['b', '[!abc]', false], ['c', '[!abc]', false], ['d', '[!abc]', true], ['', '[!abc]', false], ['dd', '[!abc]', false],
  ['b', '[!a-c]', false], ['d', '[!a-c]', true], ['x', 'x[!a]', false], ['xb', 'x[!a]', true], ['xa', 'x[!a]', false], ['A', '[!abc]', true]];
for (const [n, o] of Object.entries(OPTS)) run(`C1 leading ! negates [${n}]`, o, c1);

// C2: leading ^ negates the class equally
const c2 = [['a', '[^abc]', false], ['c', '[^abc]', false], ['d', '[^abc]', true], ['b', '[^a-c]', false], ['z', '[^a-c]', true], ['xa', 'x[^a]', false], ['xb', 'x[^a]', true]];
for (const [n, o] of Object.entries(OPTS)) run(`C2 leading ^ negates [${n}]`, o, c2);

// C3: escaped \! is a literal !, not a negation
const c3 = [['!', '[\\!a]', true], ['a', '[\\!a]', true], ['b', '[\\!a]', false], ['!', '[\\!]', true], ['a', '[\\!]', false],
  ['!a', '\\!a', true], ['a', '\\!a', false], ['!b', '[\\!a]b', true], ['ab', '[\\!a]b', true], ['cb', '[\\!a]b', false]];
for (const [n, o] of Object.entries(OPTS)) run(`C3 escaped \\! literal [${n}]`, o, c3);

// C4: non-leading ! is a literal member of the class
const c4 = [['a', '[a!]', true], ['!', '[a!]', true], ['b', '[a!]', false], ['!', '[a!b]', true], ['b', '[a!b]', true], ['c', '[a!b]', false],
  ['!', '[ab!]', true], ['c', '[ab!]', false], ['xa', 'x[a!]', true], ['x!', 'x[a!]', true], ['xb', 'x[a!]', false],
  ['!', '[a-c!]', true], ['b', '[a-c!]', true], ['d', '[a-c!]', false]];
for (const [n, o] of Object.entries(OPTS)) run(`C4 non-leading ! literal [${n}]`, o, c4);

// C5: [!]] negates a closing-bracket member
const c5 = [['a', '[!]]', true], [']', '[!]]', false], ['ab', '[!]]', false], ['b', '[!]a]', true], [']', '[!]a]', false], ['a', '[!]a]', false],
  ['xb', 'x[!]]', true], ['x]', 'x[!]]', false], ['a', '[^]]', true], [']', '[^]]', false]];
for (const [n, o] of Object.entries(OPTS)) run(`C5 [!]] negates ] [${n}]`, o, c5);

// C6: unterminated [!] stays literal (no closing bracket after the class opener)
const c6 = [['[!]', '[!]', true], ['a', '[!]', false], ['!', '[!]', false], ['[', '[!]', false], ['x[!]', 'x[!]', true], ['xa', 'x[!]', false], ['[!', '[!', true], ['a', '[!', false]];
for (const [n, o] of Object.entries(OPTS)) run(`C6 unterminated [!] literal [${n}]`, o, c6);

// C7: edge form [!a] embedded in longer patterns
const c7 = [['zxby', '*x[!a]y', true], ['zxay', '*x[!a]y', false], ['xby', '*x[!a]y', true], ['xay', '*x[!a]y', false], ['zxy', '*x[!a]y', false],
  ['zxbby', '*x[!a]y', false], ['abxcy', '*x[!a]y', true], ['abxay', '*x[!a]y', false], ['ayb', 'a[!x]b', true], ['axb', 'a[!x]b', false],
  ['xbz', 'x[!a]*', true], ['xaz', 'x[!a]*', false], ['x]y', '*x[!]]y', false], ['xzy', '*x[!]]y', true]];
for (const [n, o] of Object.entries(OPTS)) run(`C7 [!a] in longer patterns [${n}]`, o, c7);

// C8: literalBrackets preserved
run('C8 literalBrackets:true treats brackets literally', { literalBrackets: true }, [
  ['[abc]', '[abc]', true], ['a', '[abc]', false], ['[!abc]', '[!abc]', true], ['a', '[!abc]', false], ['d', '[!abc]', false],
  ['[a!]', '[a!]', true], ['!', '[a!]', false], ['x[!a]y', '*x[!a]y', true], ['xby', '*x[!a]y', false]]);
run('C8 literalBrackets:true + posix', { literalBrackets: true, posix: true }, [
  ['[!abc]', '[!abc]', true], ['d', '[!abc]', false], ['a', '[!abc]', false]]);
run('C8 literalBrackets:false uses class', { literalBrackets: false }, [
  ['a', '[abc]', true], ['a', '[!abc]', false], ['d', '[!abc]', true],
  ['zxby', '*x[!a]y', true], ['zxay', '*x[!a]y', false], ['a', '[!]]', true], [']', '[!]]', false], ['[!]', '[!]', true]]);
run('C8 literalBrackets:false + posix', { literalBrackets: false, posix: true }, [
  ['a', '[!abc]', false], ['d', '[!abc]', true], ['zxay', '*x[!a]y', false], ['zxby', '*x[!a]y', true]]);
run('C8 default matches class (and literal) for [!abc]', {}, [
  ['a', '[!abc]', false], ['d', '[!abc]', true], ['[!abc]', '[!abc]', true]]);

// C9: nobracket preserved: brackets are plain literals
for (const [n, o] of Object.entries({ nobracket: { nobracket: true }, 'nobracket+posix': { nobracket: true, posix: true } })) run(`C9 ${n}`, o, [
  ['[abc]', '[abc]', true], ['a', '[abc]', false], ['[!abc]', '[!abc]', true], ['a', '[!abc]', false], ['d', '[!abc]', false],
  ['[!]]', '[!]]', true], ['a', '[!]]', false], [']', '[!]]', false], ['[!]', '[!]', true], ['a', '[!]', false],
  ['x[!a]y', '*x[!a]y', true], ['xby', '*x[!a]y', false], ['zxay', '*x[!a]y', false]]);

// C10: posix option with negated classes
run('C10 posix:true negation + posix classes', { posix: true }, [
  ['a', '[![:digit:]]', true], ['1', '[![:digit:]]', false], ['1', '[[:digit:]]', true], ['a', '[[:digit:]]', false],
  ['a', '[^[:digit:]]', true], ['1', '[^[:digit:]]', false], ['!', '[![:digit:]]', true]]);
run('C10 posix:true literal ! member not negating', { posix: true }, [
  ['!', '[a!]', true], ['b', '[a!]', false], ['!', '[\\!a]', true], ['b', '[\\!a]', false], ['[!]', '[!]', true], ['a', '[!]', false]]);
