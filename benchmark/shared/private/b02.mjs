import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {default:memoize}=await import(pathToFileURL(process.cwd()+'/index.ts'));
for(const asyncFailure of [false,true]) {
 const seen=new Set(),reason=new Error('recover');let calls=0;
 const cache={has(key){if(!seen.has(key)){seen.add(key);if(asyncFailure)return Promise.reject(reason);throw reason;}return false;},get(){},set(){},delete(){}};
 const f=memoize(async x=>{calls++;return x*3;},{cache});
 for(const key of [2,7]){await assert.rejects(f(key),error=>error===reason);assert.equal(await f(key),key*3);}
 assert.equal(calls,2);
}
let calls=0;const done=Promise.withResolvers();
const f=memoize(async x=>{calls++;await done.promise;return x;});
const a=f(5),b=f(5);done.resolve();assert.deepEqual(await Promise.all([a,b]),[5,5]);
assert.equal(await f(5),5);assert.equal(calls,1,'inflight deduplication and successful cache still work');
