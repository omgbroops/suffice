import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

test('**.thing.js does not match across path separators', () => {
  assert.equal(isMatch('somepath/test.thing.js', '**.thing.js'), false);
});

test('**.thing.js still matches a file in the current directory', () => {
  assert.equal(isMatch('test.thing.js', '**.thing.js'), true);
});

test('**.thing.js behaves like *.thing.js for a single segment', () => {
  assert.equal(isMatch('somepath/test.thing.js', '*.thing.js'), false);
  assert.equal(isMatch('test.thing.js', '*.thing.js'), true);
});

test('**/ forms still match across path separators', () => {
  assert.equal(isMatch('a/b/test.js', '**/*.js'), true);
});

test('bare ** segments still match nested paths', () => {
  assert.equal(isMatch('a/b/c.js', 'a/**'), true);
});
