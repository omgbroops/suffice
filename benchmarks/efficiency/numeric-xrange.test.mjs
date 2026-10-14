import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const s=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'))('./index.js');
test('strict wildcards cannot precede later numeric components',()=>{
  for(const wildcard of ['x','X','*'])for(const n of [0,1,5,23])for(const input of [`1.${wildcard}.${n}`,`${wildcard}.${n}`,`${wildcard}.${n}.2`,`${wildcard}.${wildcard}.${n}`])assert.equal(s.validRange(input),null,input);
});
test('invalid components invalidate strict OR sets and comparators',()=>{
  for(const input of ['1.x.5 || 2.x','2.x || 1.*.5','>=1.x.5','<x.1','1.x.5 >=1.0.0'])assert.equal(s.validRange(input),null,input);
});
test('valid trailing wildcard semantics remain intact',()=>{
  for(const [range,canonical]of [['1.x','>=1.0.0 <2.0.0-0'],['1.2.*','>=1.2.0 <1.3.0-0'],['x.x.x','*'],['1.x || 2.x','>=1.0.0 <2.0.0-0||>=2.0.0 <3.0.0-0']])assert.equal(s.validRange(range),canonical);
  assert.equal(s.satisfies('1.3.4','1.x'),true);assert.equal(s.satisfies('2.0.0','1.x'),false);
});
