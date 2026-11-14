import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {modelRuntimeOptions,refreshModelCatalog} from '../src/model-runtime.mjs';

test('Pi restores a newer disk catalog without network or a dependency update',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-catalog-')),model={id:'fixture-new-model',name:'New model fixture',api:'openai-responses',provider:'openai',baseUrl:'https://api.openai.com/v1',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:4096};
 await writeFile(resolve(home,'catalog.json'),JSON.stringify({openai:{models:[model],checkedAt:Date.now(),lastModified:Date.now()+365*86400000}}));
 for(let i=0;i<2;i++){const runtime=await ModelRuntime.create(modelRuntimeOptions(home));assert.equal(runtime.getModel('openai',model.id)?.contextWindow,32000);}
});
test('catalog refresh coalesces requests, times out, and honors offline mode',async()=>{
 const previous=process.env.PI_OFFLINE;delete process.env.PI_OFFLINE;
 try{let calls=0;const runtime={refresh:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return {errors:new Map()};}};const results=await Promise.all([refreshModelCatalog(runtime),refreshModelCatalog(runtime)]);assert.equal(calls,1);assert.equal(results[0].checkedAt,results[1].checkedAt);
 const hung={refresh:()=>new Promise(()=>{})};assert.equal((await refreshModelCatalog(hung,{timeoutMs:10})).aborted,true);
 process.env.PI_OFFLINE='1';await refreshModelCatalog(runtime,{force:true});assert.equal(calls,1);
 }finally{if(previous===undefined)delete process.env.PI_OFFLINE;else process.env.PI_OFFLINE=previous;}
});
