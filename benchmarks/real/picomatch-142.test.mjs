import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');
// Adapted from micromatch/picomatch PR #198 (issue #142).
test('trailing globstar in parens matches its parent path', () => {
  assert.ok(isMatch('test/utils', 'test(/utils/**)'));
  assert.ok(isMatch('test/utils', 'test?(/utils/**)'));
  assert.ok(isMatch('test/utils/file', 'test(/utils/**)'));
  assert.ok(isMatch('test/utils/file', 'test?(/utils/**)'));
});
test('optional and required group boundaries are preserved', () => {
  assert.ok(!isMatch('test', 'test(/utils/**)'));
  assert.ok(isMatch('test', 'test?(/utils/**)'));
  assert.ok(!isMatch('test/utils', 'test(/utils/**)', { strictSlashes: true }));
  assert.ok(!isMatch('test/utils', 'test(/utils/**)/file'));
});
