import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const response = require('./lib/response.js');
// Adapted from expressjs/express 4.21.2: res.location encodes the whole URL
// and the redirect HTML body no longer embeds the target as an anchor.
const mkRes = () => {
  const res = { headers: {}, app: { get: () => 'utf8' } };
  Object.setPrototypeOf(res, response);
  res.set = function (field, val) { this.headers[field] = val; return this; };
  res.get = function (field) { return this.headers[field]; };
  res.req = { get: () => undefined, app: { get: () => 'utf8' } };
  res.format = function (obj) { (obj.html ?? obj.default).call(this); return this; };
  res.send = function (b) { this.body = b; return this; };
  res.end = function (b) { this.body = b; return this; };
  return res;
};
test('res.location encodes the scheme://host prefix too', () => {
  const res = mkRes();
  res.location('http://ho st.com/x');
  assert.equal(res.headers.Location, 'http://ho%20st.com/x');
  const res2 = mkRes();
  res2.location('http://höst.com/x');
  assert.equal(res2.headers.Location, 'http://h%C3%B6st.com/x');
});
test('redirect body does not embed the URL as an anchor', () => {
  const res = mkRes();
  res.redirect(302, 'http://x/y');
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, 'http://x/y');
  assert.ok(!res.body.includes('<a href'), 'body must not contain an anchor tag');
  assert.ok(res.body.includes('http://x/y'));
});
test('relative paths are still encoded', () => {
  const res = mkRes();
  res.location('/back to/future');
  assert.equal(res.headers.Location, '/back%20to/future');
});
