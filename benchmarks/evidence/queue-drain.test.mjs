import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const moduleApi=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/index.js')));
const api=moduleApi.default;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('drain retains all values and remaining queue',()=>{for(const values of [[undefined,1],[1,undefined,2],[null,false,0,'',undefined]]){const q=new api();for(const v of values)q.enqueue(v);assert.deepEqual([...q.drain()],values);assert.equal(q.size,0);assert.deepEqual([...q],[]);q.enqueue(9);assert.equal(q.dequeue(),9);}});
test('drain partial consumption preserves FIFO',()=>{const q=new api();q.enqueue(undefined);q.enqueue(2);const it=q.drain();assert.deepEqual(it.next(),{value:undefined,done:false});assert.equal(q.size,1);assert.equal(q.peek(),2);it.return();assert.deepEqual([...q],[2]);});