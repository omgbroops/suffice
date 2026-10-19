import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {strategyRequest,executeStrategy} from '../src/execution/strategies.mjs';
import {validateContractPlan,verifyPublicContracts} from '../src/execution/verification.mjs';

const plan=()=>({requirements:[{id:'compatibility',statement:'A cancelled later batch must not execute.',source:{kind:'user',reference:'task',excerpt:'Cancel pending work while preserving the running invocation.'}}],
  checks:[{id:'cancel',command:['node','public-contract.mjs'],covers:['compatibility']}],maxCheckMs:10000});

test('strategy defaults preserve flexible Sol/Low and explicit arbitrary model and effort',()=>{
  const a=strategyRequest({});assert.equal(a.strategy,'flexible');assert.equal(a.model,'gpt-6.1-sol');assert.equal(a.effort,'low');assert.equal(a.profile,'baseline');assert.deepEqual(a.features,{});
  const b=strategyRequest({model:'custom-model',provider:'custom-provider',effort:'medium'});assert.equal(b.model,'custom-model');assert.equal(b.provider,'custom-provider');assert.equal(b.effort,'medium');
  const e=strategyRequest({strategy:'efficient'});assert.equal(e.model,'gpt-6-luna');assert.equal(e.effort,'high');assert.equal(e.features.advice,'on_failure');assert.equal(e.profile,'thin');
  assert.throws(()=>strategyRequest({features:{solTakeover:true}}),/does not route/);
  assert.throws(()=>strategyRequest({features:{advice:'upfront'}}),/does not route/);
});

test('contract plans reject private provenance, invented coverage, missing clauses and nonzero success',()=>{
  assert.equal(validateContractPlan(plan()).requirements.length,1);
  for(const mutate of [p=>p.requirements[0].source.kind='hidden',p=>p.checks[0].covers=['invented'],p=>p.checks=[],p=>p.checks[0].expectedExitCode=1]) {
    const p=plan();mutate(p);assert.throws(()=>validateContractPlan(p));
  }
});

test('verification uses actual exit status and keeps explicit coverage separate from acceptance',async()=>{
  const out=await verifyPublicContracts({plan:plan(),workspace:tmpdir(),runCheck:async()=>({passed:true,exitCode:2,output:'all passed'})});
  assert.equal(out.status,'failed');assert.equal(out.coverage[0].passed,false);
  const thrown=await verifyPublicContracts({plan:plan(),workspace:tmpdir(),runCheck:async()=>{throw Error('spawn failed');}});
  assert.equal(thrown.status,'failed');assert.match(thrown.outcomes[0].error,/spawn/);
});

test('a public contract failure triggers a same-model same-effort repair in Flexible, never Sol routing',async t=>{
  const root=await mkdtemp(join(tmpdir(),'suffice-strategy-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const workspace=join(root,'repo');await mkdir(workspace);const options=[];let checks=0;
  const out=await executeStrategy({experimental:true,workspace,runDir:join(root,'receipts'),prompt:'Preserve cancellation.',
    model:'gpt-6-luna',effort:'medium',contractVerification:plan(),features:{repairs:true}}, {
    createSession:async(opt,_runtime,callbacks)=>{options.push(opt);return {dispose:async()=>{},run:async()=>{
      callbacks.onAssistant({stopReason:'stop',usage:{input:10,cacheRead:0,cacheWrite:0,output:10,cost:{total:.001}},content:[]});return 'done';
    }};},
    runCheck:async()=>({passed:++checks>1,exitCode:checks>1?0:1,output:'Public cancellation contract'})
  });
  assert.equal(out.repairs,1);assert.equal(out.adviceCalls,0);assert.equal(out.escalations,0);
  assert.equal(out.status,'completed');assert.equal(out.verificationStatus,'passed');
  assert.deepEqual(options.map(o=>[o.model,o.effort]),[['gpt-6-luna','medium'],['gpt-6-luna','medium']]);
  const receipt=JSON.parse(await readFile(join(root,'receipts/request.json')));assert.equal(receipt.strategy,'flexible');assert.equal(receipt.contractVerification.requirements.length,1);
});

test('passing public checks do not secretly trigger assistance from an independent failure label',async t=>{
  const root=await mkdtemp(join(tmpdir(),'suffice-trigger-'));t.after(()=>rm(root,{recursive:true,force:true}));const workspace=join(root,'repo');await mkdir(workspace);
  const out=await executeStrategy({strategy:'efficient',experimental:true,workspace,runDir:join(root,'out'),prompt:'repair',
    checks:[{command:['node','public.mjs']}],features:{preparedContext:false,guidance:false,notices:false,outputControl:false}}, {
    createSession:async(_o,_r,cb)=>({dispose:async()=>{},run:async()=>{cb.onAssistant({stopReason:'stop',usage:{cost:{total:.001}},content:[]});return 'done';}}),
    runCheck:async()=>({passed:true,exitCode:0,output:'passed'})
  });
  assert.equal(out.adviceCalls,0);assert.equal(out.repairs,0);assert.equal(out.escalations,0);assert.equal(out.stages.length,1);
});

test('an explicit public contract failure funds selective advice and repair in Efficient',async t=>{
  const root=await mkdtemp(join(tmpdir(),'suffice-contract-escalation-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const workspace=join(root,'repo');await mkdir(workspace);let checks=0;const seen=[];
  const out=await executeStrategy({strategy:'efficient',experimental:true,workspace,runDir:join(root,'out'),prompt:'repair',
    contractVerification:plan(),features:{preparedContext:false,guidance:false,notices:false,outputControl:false}}, {
    createSession:async(o,_r,cb)=>{seen.push([o.model,o.effort,o.noTools]);return {dispose:async()=>{},run:async()=>{
      cb.onAssistant({stopReason:'stop',usage:{cost:{total:.001}},content:[]});return 'done';
    }};},runCheck:async()=>({passed:++checks>1,exitCode:checks>1?0:1,output:'public contract failed'})
  });
  assert.deepEqual(seen,[['gpt-6-luna','high',false],['gpt-6.1-sol','low',true],['gpt-6-luna','high',false]]);
  assert.equal(out.adviceCalls,1);assert.equal(out.repairs,1);assert.equal(out.usage.estimatedApiUsd,.003);
});
