import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const moduleApi=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/index.js')));
const api=moduleApi.default;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('mapper index follows input order despite settlement',async()=>{const {pMapIterable}=moduleApi;for(const order of [[2,0,1],[1,2,0],[2,1,0]]){const resolvers=[];const input=[0,1,2].map(i=>new Promise(r=>{resolvers[i]=()=>r(String(i));}));const output=[];const consuming=(async()=>{for await(const v of pMapIterable(input,(v,i)=>[v,i],{concurrency:3}))output.push(v);})();await delay(0);for(const i of order){resolvers[i]();await delay(1);}await consuming;assert.deepEqual(output,[['0',0],['1',1],['2',2]]);}});
test('async source and skip preserve positional index',async()=>{const {pMapIterable,pMapSkip}=moduleApi;async function* src(){yield 'a';yield 'b';yield 'c';}const output=[];for await(const v of pMapIterable(src(),(v,i)=>i===1?pMapSkip:[v,i],{concurrency:2,backpressure:2}))output.push(v);assert.deepEqual(output,[['a',0],['c',2]]);});