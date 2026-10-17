import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { quote } = require('./index.js');
// Assertions adapted from ljharb/shell-quote PR #20 (1.8.3), plus preserve-cases.
// Minimal POSIX single-word unquoter (the test sandbox cannot spawn sh).
const sh = (s) => {
  const q = quote([s]); let out = '';
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === "'") { const j = q.indexOf("'", i + 1); out += q.slice(i + 1, j); i = j; }
    else if (c === '"') { for (i++; q[i] !== '"'; i++) { if (q[i] === '\\' && '$`"\\'.includes(q[i + 1])) i++; out += q[i]; } }
    else if (c === '\\') out += q[++i];
    else out += c;
  }
  return out;
};
test('backslashes with spaces or double quotes round-trip through the shell', () => {
  // oracle is semantic (round-trip), not the upstream exact quoting form; refuter-7b showed exact-string asserts reject correct fixes
  for (const s of ['a b\\x', 'a"b\\c', 'a\\"b', '"a"b\\"', 'x y\\\\z', '`:\\a\\b "q"']) assert.equal(sh(s), s, s);
});
test('issue example round-trips through the shell', () => {
  const s = 'find /home -type f -name "*.json" -exec ls -l {} \\;';
  assert.equal(sh(s), s);
});
test('words that also contain a single quote keep working', () => {
  assert.equal(quote(["a'b"]), '"a\'b"');
  assert.equal(quote(["it's a \"x\""]), '"it\'s a \\"x\\""');
  for (const s of ["a'b\\c", "a'b\\\\c d", "'\\'", 'x\\$y\'"`', "it's \\ \"q\" $HOME `id`"]) assert.equal(sh(s), s, s);
});
test('other inputs are unchanged', () => {
  assert.equal(quote(['a', 'b c', '', 'x$y']), "a 'b c' '' x\\$y");
  assert.equal(quote(['a b', { op: '||' }, 'c']), "'a b' \\|\\| c");
  assert.equal(quote(['a', 1, null, undefined, true]), 'a 1 null undefined true');
  assert.equal(quote(['><;{}']), '\\>\\<\\;\\{\\}');
  assert.equal(quote(['a\nb']), "'a\nb'");
  assert.equal(quote(['a b "c"']), `'a b "c"'`);
  for (const s of ['a b', 'a\tb', '$HOME "x"', '*.js']) assert.equal(sh(s), s, s);
});
