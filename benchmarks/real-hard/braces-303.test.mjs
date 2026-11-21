import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const braces = require('.');
// Adapted from micromatch/braces 3.0.3: default input cap lowered to 10000.
test('patterns longer than 10000 chars are rejected by default', () => {
  assert.throws(() => braces('x'.repeat(11000)), SyntaxError);
  assert.throws(() => braces('a{1..9}' + 'x'.repeat(12000)), SyntaxError);
});
test('patterns at the cap still parse', () => {
  const out = braces('x'.repeat(9990) + '{a,b}');
  assert.ok(Array.isArray(out));
});
test('options.maxLength still applies below the default cap', () => {
  assert.throws(() => braces('x'.repeat(6), { maxLength: 5 }), SyntaxError);
  assert.throws(() => braces('x'.repeat(6), { maxLength: 5 }), /exceeds max characters/);
});
test('expansion keeps working', () => {
  assert.deepEqual(braces('a{1,2}b', { expand: true }), ['a1b', 'a2b']);
  assert.ok(braces('{a,b}c').length >= 1);
});
