import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const cookie = require('./index.js');
test('domain without leading dot', () => {
  assert.equal(cookie.serialize('foo', 'bar', { domain: 'example.com' }), 'foo=bar; Domain=example.com');
  assert.equal(cookie.serialize('a', 'b', { domain: 'localhost' }), 'a=b; Domain=localhost');
  assert.throws(() => cookie.serialize('foo', 'bar', { domain: 'exa mple.com' }), TypeError);
  assert.throws(() => cookie.serialize('foo', 'bar', { domain: 'example..com' }), TypeError);
});
test('parse and serialize basics', () => {
  assert.deepEqual({ ...cookie.parse('a=1; b=2') }, { a: '1', b: '2' });
  assert.equal(cookie.serialize('n', 'v w', { path: '/', httpOnly: true }), 'n=v%20w; Path=/; HttpOnly');
});
