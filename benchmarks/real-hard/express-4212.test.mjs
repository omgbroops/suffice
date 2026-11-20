import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const response = require('./lib/response.js');
// Adapted from expressjs/express 4.21.2: res.location fully encodes the URL
// instead of leaving the scheme://host prefix raw, which let backslashes
// through (CVE-2024-52798 style redirect confusion).
const mkRes = () => {
  const res = { headers: {}, app: { get: () => 'utf8' }, req: { app: { get: () => 'utf8' } } };
  Object.setPrototypeOf(res, response);
  res.set = function (field, val) { this.headers[field] = val; return this; };
  return res;
};
test('res.location encodes the scheme://host prefix too', () => {
  const res = mkRes();
  res.location('http://ho st.com/x');
  assert.equal(res.headers.Location, 'http://ho%20st.com/x');
  const res2 = mkRes();
  res2.location('http://höst.com/x');
  assert.equal(res2.headers.Location, 'http://h%C3%B6st.com/x');
  const res3 = mkRes();
  res3.location('x://a b/c');
  assert.equal(res3.headers.Location, 'x://a%20b/c');
});
test('relative paths are still encoded', () => {
  const res = mkRes();
  res.location('/back to/future');
  assert.equal(res.headers.Location, '/back%20to/future');
});
