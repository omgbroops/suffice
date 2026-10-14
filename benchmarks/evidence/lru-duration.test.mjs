import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const moduleApi=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/index.js')));
const api=moduleApi.default;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('local duration insertion replacement and infinity',()=>{const original=Date.now;let now=100000;Date.now=()=>now;try{const evicted=[];const q=new api({maxSize:5,maxAge:1000,onEviction:(k,v)=>evicted.push([k,v])});q.set('a',1,{maxAge:100});q.set('b',2);assert.equal(q.get('a'),1);now+=60;q.set('a',3,{maxAge:100});now+=60;assert.equal(q.get('a'),3);assert.equal(q.get('b'),2);now+=41;assert.equal(q.has('a'),false);assert.deepEqual(evicted,[['a',3]]);q.set('c',4,{maxAge:Infinity});q.set('d',5,{maxAge:'none'});now+=5000;assert.equal(q.get('c'),4);assert.equal(q.get('d'),5);}finally{Date.now=original;}});
test('duration across old-cache promotion and iteration',()=>{const original=Date.now;let now=200000;Date.now=()=>now;try{const q=new api({maxSize:2});q.set('x',1,{maxAge:50});q.set('y',2);now+=20;assert.equal(q.peek('x'),1);now+=31;assert.equal(q.get('x'),undefined);assert.deepEqual([...q],[['y',2]]);}finally{Date.now=original;}});