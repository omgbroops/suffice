import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const cookie = require('./index.js');
// Adapted from jshttp/cookie issue #173 / v0.7.1 (leading dot in Domain).
const dom = (domain) => cookie.serialize('foo', 'bar', { domain });
test('a single leading dot in Domain is accepted and preserved', () => {
  assert.equal(dom('.example.com'), 'foo=bar; Domain=.example.com');
  assert.equal(dom('.sub.example.com'), 'foo=bar; Domain=.sub.example.com');
  assert.equal(dom('.localhost'), 'foo=bar; Domain=.localhost');
  assert.equal(dom('.a'), 'foo=bar; Domain=.a');
  assert.equal(dom('.EXAMPLE.com'), 'foo=bar; Domain=.EXAMPLE.com');
});
test('other malformed domains are still rejected', () => {
  for (const d of ['..example.com', '.', '.-bad.com', '.example..com', '.example.com.', 'example.com.', '.exa mple.com', '.exa_mple.com', '-example.com', 'example-.com', '.example.com;x=1', 'a'.repeat(64) + '.com', '.' + 'a'.repeat(64) + '.com'])
    assert.throws(() => dom(d), TypeError, d);
});
