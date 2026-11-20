import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const ini = require('./lib/ini.js');
// ini returns null-prototype objects; normalize for deepEqual.
const parse = (s, o) => JSON.parse(JSON.stringify(ini.parse(s, o)));
// Adapted from npm/ini 4.1.3: repeated keys collect under their real name.
test('duplicate keys collect under the full key, not a sliced one', () => {
  assert.deepEqual(parse('ab=1\nab=2', { bracketedArray: false }), { ab: ['1', '2'] });
  assert.deepEqual(parse('abc=1\nabc=2', { bracketedArray: false }), { abc: ['1', '2'] });
  assert.deepEqual(parse('k=1\nk=2\nk=3', { bracketedArray: false }), { k: ['1', '2', '3'] });
});
test('explicit [] suffix still arrays the base key', () => {
  assert.deepEqual(parse('arr[]=1\narr[]=2', { bracketedArray: false }), { 'arr[]': '1', arr: ['2'] });
  assert.deepEqual(parse('arr[]=1\narr[]=2'), { arr: ['1', '2'] });
});
test('single keys and proto pollution stay unchanged', () => {
  assert.deepEqual(parse('x=1'), { x: '1' });
  assert.deepEqual(parse('x=1\nx=2'), { x: '2' });
  const out = parse('__proto__=evil\ny=2');
  assert.equal(out.y, '2');
});
