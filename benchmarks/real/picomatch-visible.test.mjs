import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');
test('basic globs', () => {
  assert.ok(isMatch('a/b/c.js', '**/*.js'));
  assert.ok(isMatch('a.js', '*.js'));
  assert.ok(!isMatch('a/b.js', '*.js'));
  assert.ok(isMatch('a/b', 'a/**'));
  assert.ok(isMatch('foo.js', '**/foo.js'));
});
test('extglobs', () => {
  assert.ok(isMatch('ab', 'a@(b|c)'));
  assert.ok(!isMatch('ad', 'a@(b|c)'));
  assert.ok(isMatch('a', 'a?(b)'));
  assert.ok(!isMatch('ab', '!(ab)'));
});
