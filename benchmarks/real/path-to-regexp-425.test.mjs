import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const pathToRegexp = require('./index.js');
// Behaviour of path-to-regexp 0.1.13 (pillarjs/path-to-regexp#425: stale `backtrack` lookahead text carried across params/wildcards).
const run = (pat, path) => { const m = pathToRegexp(pat).exec(path); return m && m.slice(1); };
test('later params in one segment do not inherit earlier separators in their lookahead', () => {
  // 0.1.12 built (?!\/|--) etc., so these wrongly matched with a param value starting with the separator.
  assert.equal(run('/:a-:b-:c', '/1-2-3--4'), null);
  assert.equal(run('/:a-:b-:c-:d', '/1-2-3-4---5'), null);
  assert.equal(run('/a*-:b-:c', '/ab-1-2--3'), null);
  assert.equal(run('/*-:a-:b', '/p/q-1-2--3'), null);
});
test('ordinary multi-param segments keep matching', () => {
  assert.deepEqual(run('/:a-:b-:c', '/1-2-3'), ['1', '2', '3']);
  assert.deepEqual(run('/:a-:b-:c-:d', '/1-2-3-4'), ['1', '2', '3', '4']);
  assert.deepEqual(run('/x-:a-:b', '/x-1-2'), ['1', '2']);
  assert.deepEqual(run('/:a/:b', '/x/y'), ['x', 'y']);
  assert.deepEqual(run('/:a-:b', '/1-2'), ['1', '2']);
  assert.equal(run('/:a-:b-:c', '/1-2/3-4'), null);
  assert.deepEqual(run('/x-:a', '/x-1-2'), ['1-2']); // a param may still contain the separator when nothing follows it
});
