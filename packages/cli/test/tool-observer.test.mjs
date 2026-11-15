import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';import {repositoryTools} from '../src/tools.mjs';
test('native observer receives actual tool success and error without changing tool behavior',async()=>{
 const workspace=await mkdtemp(resolve(tmpdir(),'suffice-observer-')),events=[],token={};
 const tools=repositoryTools({workspace,toolObserver:{before:()=>token,after:(observed,event)=>{assert.equal(observed,token);events.push(event);}}});
 const result=await tools.find(t=>t.name==='write').execute('write',{path:'a.txt',content:'fixture'},undefined,()=>{});assert.equal(events[0].result,result);assert.equal(events[0].name,'write');assert.equal(events[0].error,undefined);
 await assert.rejects(tools.find(t=>t.name==='read').execute('read',{path:'missing.txt'},undefined,()=>{}));assert.ok(events[1].error);assert.equal(events[1].result,undefined);
});
