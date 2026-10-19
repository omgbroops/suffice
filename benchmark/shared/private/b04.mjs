import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {default:retry}=await import(pathToFileURL(process.cwd()+'/index.js'));
for(const inHook of [false,true]) {
 const c=new AbortController(),reason=new Error('independent reason');let calls=0;const start=performance.now();
 await assert.rejects(retry(async()=>{calls++;if(!inHook)c.abort(reason);throw new Error('attempt');},
 {signal:c.signal,minTimeout:1800,retries:2,onFailedAttempt(){if(inHook)c.abort(reason);}}),error=>error===reason);
 assert.equal(calls,1);assert.ok(performance.now()-start<1200);
}
let attempts=0;assert.equal(await retry(async()=>{if(++attempts===1)throw new Error('transient');return 42;},{minTimeout:1,retries:1}),42);assert.equal(attempts,2);
