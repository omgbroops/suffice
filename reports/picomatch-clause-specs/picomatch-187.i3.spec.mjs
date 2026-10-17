import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import { resolve } from 'node:path'; const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json')); const { isMatch } = require('./index.js');

// table: [clause, pattern, opts, [[input, expected], ...]]
const P = { posix: true };
const table = [
  // C1: leading ! negates a class (default)
  ['C1 [!abc]', '[!abc]', {}, [['a', false], ['b', false], ['c', false], ['d', true], ['z', true], ['!', true], ['ab', false]]],
  ['C1 [!a-c] range', '[!a-c]', {}, [['b', false], ['d', true]]],
  ['C1 x[!a]y', 'x[!a]y', {}, [['xby', true], ['xay', false]]],
  ['C1 *x[!a]y', '*x[!a]y', {}, [['bxby', true], ['xcy', true], ['bxay', false], ['xay', false]]],
  ['C1 [!a]* ', '[!a]*', {}, [['bcd', true], ['abc', false]]],
  ['C1 slash not matched', 'a[!b]c', {}, [['adc', true], ['abc', false], ['a/c', false]]],
  ['C1 [!!] ', '[!!]', {}, [['!', false], ['a', true]]],
  ['C1 !-prefix whole negation', '![!abc]', {}, [['a', false], ['d', true]]],
  // C2: same with posix
  ['C2 [!abc] posix', '[!abc]', P, [['a', false], ['b', false], ['c', false], ['d', true], ['!', true]]],
  ['C2 [!a-c] posix', '[!a-c]', P, [['b', false], ['d', true]]],
  ['C2 *x[!a]y posix', '*x[!a]y', P, [['bxby', true], ['xcy', true], ['bxay', false], ['xay', false]]],
  ['C2 [![:digit:]] posix', '[![:digit:]]', P, [['1', false], ['a', true]]],
  ['C2 [![:digit:]] default', '[![:digit:]]', {}, [['1', false], ['a', true]]],
  // C2b: ^ equivalent
  ['C2b [^abc]', '[^abc]', {}, [['a', false], ['d', true]]],
  ['C2b [^abc] posix', '[^abc]', P, [['a', false], ['d', true]]],
  ['C2b [^!]', '[^!]', {}, [['!', false], ['a', true]]],
  // C3: escaped \!
  ['C3 [\\!a]', '[\\!a]', {}, [['!', true], ['a', true], ['b', false]]],
  ['C3 [\\!a] posix', '[\\!a]', P, [['!', true], ['a', true], ['b', false]]],
  ['C3 [\\!]', '[\\!]', {}, [['!', true], ['a', false]]],
  ['C3 *x[\\!a]y', '*x[\\!a]y', {}, [['bx!y', true], ['bxay', true], ['bxby', false]]],
  ['C3 *x[\\!a]y posix', '*x[\\!a]y', P, [['bx!y', true], ['bxay', true], ['bxby', false]]],
  ['C3 [a\\!]', '[a\\!]', {}, [['!', true], ['a', true], ['b', false]]],
  // C4: non-leading ! literal
  ['C4 [a!]', '[a!]', {}, [['a', true], ['!', true], ['b', false]]],
  ['C4 [a!] posix', '[a!]', P, [['a', true], ['!', true], ['b', false]]],
  ['C4 x[ab!c]y', 'x[ab!c]y', {}, [['x!y', true], ['xcy', true], ['xdy', false]]],
  ['C4 x[ab!c]y posix', 'x[ab!c]y', P, [['x!y', true], ['xcy', true], ['xdy', false]]],
  ['C4 [^a!]', '[^a!]', {}, [['!', false], ['a', false], ['b', true]]],
  // C5: [!]] negates a closing bracket
  ['C5 [!]]', '[!]]', {}, [['a', true], ['!', true], [']', false]]],
  ['C5 [!]] posix', '[!]]', P, [['a', true], [']', false]],],
  ['C5 x[!]]y', 'x[!]]y', {}, [['xay', true], ['x]y', false]]],
  ['C5 *x[!]]y posix', '*x[!]]y', P, [['bxay', true], ['bx]y', false]]],
  ['C5 [^]]', '[^]]', {}, [['a', true], [']', false]]],
  ['C5 [!]a]', '[!]a]', {}, [['b', true], [']', false], ['a', false]]],
  // C6: unterminated [!] / [! stays literal
  ['C6 [!]', '[!]', {}, [['[!]', true], ['a', false], ['x', false]]],
  ['C6 [!] posix', '[!]', P, [['[!]', true], ['a', false]]],
  ['C6 x[!]', 'x[!]', {}, [['x[!]', true], ['xa', false]]],
  ['C6 [!', '[!', {}, [['[!', true], ['a', false], ['!', false]]],
  ['C6 [!abc unterminated', '[!abc', {}, [['[!abc', true], ['d', false]]],
  ['C6 [!abc unterminated posix', '[!abc', P, [['[!abc', true], ['d', false]]],
  // C7: literalBrackets
  ['C7 literalBrackets:true [abc]', '[abc]', { literalBrackets: true }, [['[abc]', true], ['a', false]]],
  ['C7 literalBrackets:true [!abc]', '[!abc]', { literalBrackets: true }, [['[!abc]', true], ['d', false], ['a', false]]],
  ['C7 literalBrackets:true [!abc] posix', '[!abc]', { literalBrackets: true, posix: true }, [['[!abc]', true], ['d', false], ['a', false]]],
  ['C7 literalBrackets:true *x[!a]y', '*x[!a]y', { literalBrackets: true }, [['bx[!a]y', true], ['bxby', false]]],
  ['C7 literalBrackets:false [!abc]', '[!abc]', { literalBrackets: false }, [['a', false], ['d', true], ['[!abc]', false]]],
  ['C7 literalBrackets:false [!abc] posix', '[!abc]', { literalBrackets: false, posix: true }, [['a', false], ['d', true]]],
  ['C7 literalBrackets:false *x[!a]y', '*x[!a]y', { literalBrackets: false }, [['bxby', true], ['bxay', false]]],
  ['C7 literalBrackets:false [!]]', '[!]]', { literalBrackets: false }, [['a', true], [']', false]]],
  // C8: nobracket
  ['C8 nobracket [!abc]', '[!abc]', { nobracket: true }, [['[!abc]', true], ['d', false], ['a', false]]],
  ['C8 nobracket [!abc] posix', '[!abc]', { nobracket: true, posix: true }, [['[!abc]', true], ['d', false], ['a', false]]],
  ['C8 nobracket *x[!a]y', '*x[!a]y', { nobracket: true }, [['bx[!a]y', true], ['bxby', false], ['bxay', false]]],
  ['C8 nobracket [!]]', '[!]]', { nobracket: true }, [['[!]]', true], ['a', false]]],
  ['C8 nobracket [abc]', '[abc]', { nobracket: true }, [['[abc]', true], ['a', false]]],
  ['C8 nobracket [a!]', '[a!]', { nobracket: true }, [['[a!]', true], ['a', false]]],
];

for (const [name, pat, opts, cases] of table) {
  for (const [input, want] of cases) {
    test(`${name} ${JSON.stringify(opts)} isMatch(${JSON.stringify(input)}, ${JSON.stringify(pat)}) === ${want}`, () => {
      assert.equal(isMatch(input, pat, opts), want);
    });
  }
}
