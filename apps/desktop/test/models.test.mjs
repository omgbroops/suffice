import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHarnessHost} from '../electron/worker.mjs';
test('selected catalog model reaches the harness and unsupported model requests are rejected',async()=>{
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-model-test-'));
 const model={id:'fixture-model',name:'Fixture model',provider:'fixture',reasoning:true};
 const replies=[];let options,thinking;
 const session={model,subscribe:()=>{},setThinkingLevel:value=>{thinking=value;}};
 const host=createHarnessHost({send:m=>replies.push(m),createRuntime:async()=>({getAvailable:async()=>[model],isUsingSubscription:()=>false}),createSession:async value=>{options=value;return {session,run:async()=>'ok',sessionPath:()=>null,totals:{}};}});
 await host({id:1,action:'status'});
 await host({id:2,action:'models'});assert.equal(replies.find(r=>r.id===2).result[0].provider,'fixture');
 await host({id:3,action:'run',payload:{prompt:'test',cwd,effort:'low',model:model.id,provider:model.provider}});
 assert.equal(options.modelObject,model);
 await host({id:4,action:'run',payload:{prompt:'continue',cwd,effort:'high',model:model.id,provider:model.provider}});assert.equal(thinking,'high');
 await host({id:5,action:'run',payload:{prompt:'test',cwd,effort:'low',model:'missing',provider:model.provider}});assert.match(replies.find(r=>r.id===5).error,/unavailable/);
});
