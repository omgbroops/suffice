import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');
// Adapted from micromatch/picomatch PR #181 (issue #99).
test('globstar adjacent to a literal extension acts as a single star', () => {
  assert.ok(!isMatch('somepath/test.thing.js', '**.thing.js'));
  assert.ok(!isMatch('a/b/c.js', '**.js'));
  assert.ok(!isMatch('somepath/test.dash-thing.js', '**.dash-thing.js'));
});
test('neighbouring patterns keep working', () => {
  assert.ok(isMatch('test.thing.js', '**.thing.js'));
  assert.ok(isMatch('somepath/test.thing.js', '**/*.thing.js'));
  assert.ok(isMatch('a/b/c.js', '**/*.js'));
  assert.ok(isMatch('c.js', '**/*.js'));
});
