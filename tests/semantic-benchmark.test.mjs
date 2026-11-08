import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {CampaignBudget,boundedRuntime,SEMANTIC_PROTOCOL} from '../src/semantic-benchmark.mjs';

async function budget(t,options={}){const root=await mkdtemp(resolve(tmpdir(),'suffice-budget-semantic-'));t.after(async()=>{assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});});return new CampaignBudget({path:resolve(root,'budget.jsonl'),prices:{input:2,output:10,cacheRead:.1,cacheWrite:2.5,tiers:[{input:4,output:15,cacheRead:.2,cacheWrite:5}]},...options});}
const payload={model:SEMANTIC_PROTOCOL.model,input:[]};
test('campaign reserves before dispatch, reconciles known cost and retains unknown charges',async t=>{
  const ledger=await budget(t);ledger.begin();const reservation=await ledger.reserve(payload);assert.ok(reservation.usd>0);assert.equal(ledger.used,reservation.usd);
  await ledger.settle({usage:{cost:{total:.01}},stopReason:'stop'});assert.ok(Math.abs(ledger.used-.01)<1e-10);
  await ledger.reserve(payload);const reserved=ledger.used;await ledger.settle({usage:{cost:{total:0}},stopReason:'error'});assert.equal(ledger.used,reserved);assert.equal(ledger.unknown,true);assert.throws(()=>ledger.begin(),/unknown/);
  const events=(await readFile(ledger.path,'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(events.map(e=>e.type),['reserve','settle','reserve','settle']);assert.equal(events.at(-1).cost,null);
});
test('shared and per-attempt budgets block oversized requests before dispatch',async t=>{
  const ledger=await budget(t,{capUsd:.001});ledger.begin();await assert.rejects(ledger.reserve(payload),/budget bound/);assert.equal(ledger.pending,null);assert.equal(ledger.used,0);
  const attempt=await budget(t,{attemptCapUsd:.001});attempt.begin();await assert.rejects(attempt.reserve(payload),/budget bound/);
  assert.throws(()=>attempt.upperBound({...payload,input:['x'.repeat(300000)]}),/context/);
});
test('runtime wrapper enforces output cap, validates model and propagates budget errors outside extension catch handlers',async t=>{
  const ledger=await budget(t);ledger.begin();let requested;
  const fake={streamSimple:async(_m,_c,options)=>{requested=await options.onPayload(payload);return requested;}};
  await boundedRuntime(fake,ledger,()=>{}).streamSimple({id:SEMANTIC_PROTOCOL.model},{},{});assert.equal(requested.max_output_tokens,4096);assert.ok(ledger.pending);
  await ledger.settle({usage:{cost:{total:0}},stopReason:'stop'});
  await assert.rejects(boundedRuntime(fake,ledger,()=>{}).streamSimple({id:'different'},{},{}),/Unexpected/);
  const blocked=await budget(t,{capUsd:.001});blocked.begin();await assert.rejects(boundedRuntime(fake,blocked,()=>{}).streamSimple({id:SEMANTIC_PROTOCOL.model},{},{}),/budget bound/);
});
