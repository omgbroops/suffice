import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {default:retry}=await import(pathToFileURL(process.cwd()+'/index.js'));
const controller=new AbortController(),reason=new Error('public abort');
const began=performance.now();let calls=0;
await assert.rejects(retry(async()=>{calls++;controller.abort(reason);throw new Error('input failed');},
 {signal:controller.signal,minTimeout:1500,retries:2}),error=>error===reason);
assert.ok(performance.now()-began<1000,'an already aborted retry must not wait its retry delay');
assert.equal(calls,1);
console.log('public contract: abortion during input stops before the retry delay');
