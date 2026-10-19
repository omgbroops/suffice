import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
const {default:debounce}=await import(pathToFileURL(process.cwd()+'/index.js'));
for(const reason of [new Error('secondary abort'),{code:73}]) {
 const started=Promise.withResolvers(),release=Promise.withResolvers(),c=new AbortController();let count=0;
 const f=debounce(async x=>{count++;started.resolve();await release.promise;return x;},120,{signal:c.signal});
 const a=f(17);await started.promise;
 const b=f(29).then(value=>({value}),error=>({error}));
 const d=f(31).then(value=>({value}),error=>({error}));
 release.resolve();assert.equal(await a,17);c.abort(reason);
 assert.equal((await b).error,reason);assert.equal((await d).error,reason);
 await sleep(140);assert.equal(count,1);
}
const normal=debounce(async x=>x*2,5);
assert.deepEqual(await Promise.all([normal(2),normal(4)]),[8,8]);
