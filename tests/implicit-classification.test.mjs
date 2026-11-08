import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyChange} from '../packages/cli/src/implicit/change.mjs';

test('local rename abstention requires a complete collision-free binding rename',()=>{
 const local=(before,after)=>classifyChange(before,after,'source.ts').kind;
 assert.equal(local('export function f(){const x=1;return x;}','export function f(){const renamed=1;return renamed;}'),'local_binding');
 for(const [before,after]of [
  ['export function f(){const x=1,y=2;return x;}','export function f(){const x=1,y=2;return y;}'],
  ['export function f(){const x=1;return x;}','export function f(){const y=1;return x;}'],
  ['export function f(){const x=1,y=2;return x;}','export function f(){const y=1,y=2;return y;}'],
  ['export function f(){const x=1;return eval("x");}','export function f(){const y=1;return eval("x");}'],
  ['export function f(){const x=()=>1;return x.name;}','export function f(){const y=()=>1;return y.name;}'],
 ])assert.notEqual(local(before,after),'local_binding',after);
});
