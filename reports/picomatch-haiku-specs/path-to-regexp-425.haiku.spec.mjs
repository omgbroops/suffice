import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const pathToRegexp = require('./index.js');

const caps = (route, input) => {
  const m = pathToRegexp(route, []).exec(input);
  return m && m.slice(1);
};

test('reported case: a parameter may not start with its preceding separator', () => {
  assert.equal(pathToRegexp('/:a-:b-:c', []).exec('/1-2-3--4'), null);
});

test('general: no matched parameter starts with the separator before it', () => {
  for (const input of ['/1-2-3--4', '/1--2', '/1-2--3', '/-1-2-3']) {
    const m = pathToRegexp('/:a-:b-:c', []).exec(input);
    if (!m) continue;
    assert.ok(!m[2].startsWith('-'), `${input}: b=${m[2]}`);
    assert.ok(!m[3].startsWith('-'), `${input}: c=${m[3]}`);
  }
});

test('preserve: ordinary multi-separator route still matches', () => {
  assert.deepEqual(caps('/:a-:b-:c', '/1-2-3'), ['1', '2', '3']);
});

test('preserve: ordinary single-param route still matches', () => {
  assert.deepEqual(caps('/user/:id', '/user/42'), ['42']);
});

test('preserve: two params with one separator still match', () => {
  assert.deepEqual(caps('/:a-:b', '/x-y'), ['x', 'y']);
});
