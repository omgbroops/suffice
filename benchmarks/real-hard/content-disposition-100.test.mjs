import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const cd = require('.');
// Adapted from jshttp/content-disposition 1.0.0: utf8 is accepted as an
// extended-parameter charset alias.
test("filename* with charset utf8 decodes", () => {
  const r = cd.parse("attachment; filename*=utf8''%C3%A9.txt");
  assert.equal(r.parameters.filename, 'é.txt');
});
test("utf-8 and iso-8859-1 still decode as before", () => {
  assert.equal(cd.parse("attachment; filename*=utf-8''%C3%A9.txt").parameters.filename, 'é.txt');
  assert.equal(cd.parse("attachment; filename*=iso-8859-1''%E9.txt").parameters.filename, 'é.txt');
  assert.equal(cd.parse('attachment; filename="a.txt"').parameters.filename, 'a.txt');
});
test('unsupported charsets still throw', () => {
  assert.throws(() => cd.parse("attachment; filename*=klingon''xx.txt"), /unsupported charset/);
});
