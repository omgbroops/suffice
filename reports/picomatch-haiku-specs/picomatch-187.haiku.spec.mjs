import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const { isMatch } = require('./index.js');

test('leading ! or ^ inside a bracket negates the class', () => {
  assert.equal(isMatch('a', '[!abc]'), false);
  assert.equal(isMatch('d', '[!abc]'), true);
  assert.equal(isMatch('a', '[!abc]', { posix: true }), false);
  assert.equal(isMatch('d', '[!abc]', { posix: true }), true);
  assert.equal(isMatch('d', '[^abc]'), true);
  assert.equal(isMatch('a', '[^abc]'), false);
});

test('escaped \\! and non-leading ! stay literal', () => {
  assert.equal(isMatch('!', '\\!'), true);
  assert.equal(isMatch('!', '[a!]'), true);
  assert.equal(isMatch('a', '[a!]'), true);
});

test('[!]] negates a closing bracket; unterminated [!] stays literal', () => {
  assert.equal(isMatch(']', '[!]]'), false);
  assert.equal(isMatch('a', '[!]]'), true);
  assert.equal(isMatch('[!]', '[!]'), true);
});

test('literalBrackets and nobracket options are preserved', () => {
  assert.equal(isMatch('[!abc]', '[!abc]', { nobracket: true }), true);
  assert.equal(isMatch('a', '[!abc]', { nobracket: true }), false);
});
