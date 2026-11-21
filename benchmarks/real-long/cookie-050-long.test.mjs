import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const cookie = require('.');
// Adapted from jshttp/cookie 0.7.2: prototype-safe parse + RFC 6265 validation.
test('a cookie named hasOwnProperty does not break parsing', () => {
  assert.deepEqual(cookie.parse('hasOwnProperty=x; a=1; b=2'), { hasOwnProperty: 'x', a: '1', b: '2' });
});
test('serialize rejects invalid names', () => {
  assert.throws(() => cookie.serialize('na me', 'v'), TypeError);
  assert.throws(() => cookie.serialize('na me', 'v'), /argument name is invalid/);
  assert.throws(() => cookie.serialize('na;me', 'v'), TypeError);
});
test('serialize validates attributes', () => {
  assert.throws(() => cookie.serialize('n', 'v', { domain: 'bad_domain-.com' }), /option domain is invalid/);
  assert.throws(() => cookie.serialize('n', 'v', { expires: 'not-a-date' }), /option expires is invalid/);
  assert.throws(() => cookie.serialize('n', 'v', { path: 'bad\npath' }), /option path is invalid/);
});
test('valid serializations are unchanged', () => {
  assert.equal(cookie.serialize('n', 'v'), 'n=v');
  assert.equal(cookie.serialize('n', 'va lue'), 'n=va%20lue');
  const s = cookie.serialize('n', 'v', { domain: 'example.com', path: '/x', maxAge: 3600, httpOnly: true, secure: true, sameSite: 'lax' });
  assert.equal(s, 'n=v; Max-Age=3600; Domain=example.com; Path=/x; HttpOnly; Secure; SameSite=Lax');
});
test('normal parsing is unchanged', () => {
  assert.equal(cookie.parse('foo=bar').foo, 'bar');
  assert.equal(cookie.parse('empty=').empty, '');
  assert.deepEqual(cookie.parse('a=1; b=2'), { a: '1', b: '2' });
});
