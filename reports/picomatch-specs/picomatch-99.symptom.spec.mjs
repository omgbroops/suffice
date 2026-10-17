import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

test('globstar glued to suffix does not cross a directory separator', () => {
  assert.equal(isMatch('somepath/test.thing.js', '**.thing.js'), false);
});

test('globstar glued to suffix does not match deeper nested paths', () => {
  assert.equal(isMatch('a/b/test.thing.js', '**.thing.js'), false);
  assert.equal(isMatch('a/b/c/x.thing.js', '**.thing.js'), false);
});

test('globstar glued to suffix still matches in the current directory', () => {
  assert.equal(isMatch('test.thing.js', '**.thing.js'), true);
  assert.equal(isMatch('a.b.thing.js', '**.thing.js'), true);
});

test('guard: standalone globstar segment still crosses directories', () => {
  assert.equal(isMatch('somepath/test.thing.js', '**/*.thing.js'), true);
  assert.equal(isMatch('a/b/test.thing.js', '**/*.thing.js'), true);
  assert.equal(isMatch('test.thing.js', '**/*.thing.js'), true);
  assert.equal(isMatch('a/b/c.js', '**'), true);
});

test('guard: single star and non-matching suffix behave normally', () => {
  assert.equal(isMatch('test.thing.js', '*.thing.js'), true);
  assert.equal(isMatch('somepath/test.thing.js', '*.thing.js'), false);
  assert.equal(isMatch('test.other.js', '**.thing.js'), false);
});
