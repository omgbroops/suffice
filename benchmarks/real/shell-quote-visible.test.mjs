import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { quote } = require('./index.js');
test('quote basics', () => {
  assert.equal(quote(['a', 'b c']), "a 'b c'");
  assert.equal(quote(['a', 1, true]), 'a 1 true');
  assert.equal(quote(['><;{}']), '\\>\\<\\;\\{\\}');
  assert.equal(quote(["a'b"]), '"a\'b"');
});
