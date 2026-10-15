import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const W = process.env.SUFFICE_WORKSPACE || process.cwd();
const {default:TinyQueue} = await import(pathToFileURL(resolve(W,'src/index.js')));
test('constructor heapifies unsorted odd and even arrays', () => {
 for(const values of [[7,2,6,1,5,0,4],[9,8,7,6,5,4],[2,1],[3]]){
  const q=new TinyQueue([...values]); const expected=[...values].sort((a,b)=>a-b);
  assert.equal(q.length,values.length); assert.equal(q.peek(),expected[0]);
  const actual=[]; for(let i=0;i<values.length;i++) actual.push(q.pop());
  assert.deepEqual(actual,expected); assert.equal(q.length,0);
 }
});
test('insertion repairs every ancestor for both child positions', () => {
 const q=new TinyQueue(); const model=[];
 for(const value of [12,10,8,6,4,2,0,-2,-4,-6,-8]){
  q.push(value);model.push(value);model.sort((a,b)=>a-b);
  assert.equal(q.length,model.length);assert.equal(q.peek(),model[0]);
 }
 assert.deepEqual(Array.from({length:model.length},()=>q.pop()),model);
});
test('replacement selects either better child and handles left-only children', () => {
 for(const values of [[0,3,1,7,6,2,5],[0,1,3,2,6,5],[0,1,2,3]]){
  const q=new TinyQueue(); for(const n of values) q.push(n);
  assert.deepEqual(Array.from({length:values.length},()=>q.pop()),[...values].sort((a,b)=>a-b));
 }
});
test('emptying and reusing preserves peek pop and length', () => {
 const q=new TinyQueue();
 for(let round=0;round<4;round++){
  q.push(round);assert.equal(q.peek(),round);assert.equal(q.length,1);
  assert.equal(q.pop(),round);assert.equal(q.length,0);assert.equal(q.peek(),undefined);
  assert.equal(q.pop(),undefined);assert.equal(q.length,0);assert.equal(q.peek(),undefined);
 }
});
test('reverse comparator governs construction and later insertions', () => {
 const compare=(a,b)=>b-a, q=new TinyQueue([2,8,4,0,6],compare); const model=[2,8,4,0,6];
 for(const n of [10,3,12,1]){q.push(n);model.push(n);assert.equal(q.peek(),Math.max(...model));}
 model.sort(compare);assert.deepEqual(Array.from({length:model.length},()=>q.pop()),model);
});
test('object comparators retain all equal-priority entries', () => {
 const entries=[{id:'a',priority:3},{id:'b',priority:1},{id:'c',priority:2},{id:'d',priority:1},{id:'e',priority:4}];
 const q=new TinyQueue(entries.slice(0,3),(a,b)=>a.priority-b.priority);q.push(entries[3]);q.push(entries[4]);
 const out=Array.from({length:entries.length},()=>q.pop());
 assert.deepEqual(out.map(x=>x.priority),[1,1,2,3,4]);
 assert.deepEqual(out.map(x=>x.id).sort(),entries.map(x=>x.id).sort());
 for(const item of out)assert.ok(entries.includes(item));
});
test('deterministic mixed operations agree with a sorted-array model', () => {
 let seed=11939; const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const q=new TinyQueue(),model=[];
 for(let step=0;step<240;step++){
  if(next()%3!==0||model.length===0){const value=(next()%101)-50;q.push(value);model.push(value);model.sort((a,b)=>a-b);}
  else assert.equal(q.pop(),model.shift());
  assert.equal(q.length,model.length);assert.equal(q.peek(),model[0]);assert.equal(q.peek(),model[0]);
 }
 while(model.length){assert.equal(q.pop(),model.shift());assert.equal(q.length,model.length);assert.equal(q.peek(),model[0]);}
 assert.equal(q.pop(),undefined);assert.equal(q.peek(),undefined);assert.equal(q.length,0);
});
