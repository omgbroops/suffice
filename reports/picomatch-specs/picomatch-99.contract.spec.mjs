import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

test('double-star followed by literal does not cross a slash', () => {
  assert.equal(isMatch('somepath/test.thing.js', '**.thing.js'), false);
  assert.equal(isMatch('a/b/test.thing.js', '**.thing.js'), false);
  assert.equal(isMatch('a/.thing.js', '**.thing.js'), false);
});

test('double-star followed by literal still matches within one segment', () => {
  assert.equal(isMatch('test.thing.js', '**.thing.js'), true);
  assert.equal(isMatch('a.b.thing.js', '**.thing.js'), true);
  assert.equal(isMatch('x.thing.js', '**.thing.js'), true);
});

test('double-star literal behaves like single star', () => {
  for (const s of ['test.thing.js', 'somepath/test.thing.js', 'a.b.thing.js', 'thing.js', 'x.thing.jsx']) {
    assert.equal(isMatch(s, '**.thing.js'), isMatch(s, '*.thing.js'), s);
  }
});

test('double-star literal with prefix segment keeps segment boundary', () => {
  assert.equal(isMatch('a/test.thing.js', 'a/**.thing.js'), true);
  assert.equal(isMatch('a/b/test.thing.js', 'a/**.thing.js'), false);
});

test('globstar slash forms still cross directories', () => {
  assert.equal(isMatch('somepath/test.thing.js', '**/*.thing.js'), true);
  assert.equal(isMatch('a/b/c/test.thing.js', '**/*.thing.js'), true);
  assert.equal(isMatch('test.thing.js', '**/*.thing.js'), true);
  assert.equal(isMatch('a/b/c.js', 'a/**/c.js'), true);
  assert.equal(isMatch('a/c.js', 'a/**/c.js'), true);
});

test('bare double-star segments still match across directories', () => {
  assert.equal(isMatch('a/b/c', '**'), true);
  assert.equal(isMatch('a', '**'), true);
  assert.equal(isMatch('a/b/c', 'a/**'), true);
  assert.equal(isMatch('a/b/c/d.js', '**/d.js'), true);
  assert.equal(isMatch('a/b/c', '**/c'), true);
});
