import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const pathToRegexp = require('./index.js');
const run = (pat, path) => { const m = pathToRegexp(pat).exec(path); return m && m.slice(1); };
test('path-to-regexp basics', () => {
  assert.deepEqual(run('/:a/:b', '/x/y'), ['x', 'y']);
  assert.deepEqual(run('/:a-:b', '/1-2'), ['1', '2']);
  assert.equal(run('/:a', '/x/y'), null);
});
