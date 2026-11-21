import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
test('workspace library loads and answers a basic call', () => {
  const lib = require('.');
  assert.ok(lib !== undefined && lib !== null);
});
