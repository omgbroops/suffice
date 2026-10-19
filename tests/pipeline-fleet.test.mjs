import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {executeFleet,parseFleetAdvice} from '../src/pipeline/fleet.mjs';

async function fixture(t,count=3) {
  const root=await mkdtemp(join(tmpdir(),'suffice-fleet-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const coordinatorWorkspace=join(root,'coordinator');await mkdir(coordinatorWorkspace);
  const tasks=[];
  for(let i=0;i<count;i++){const workspace=join(root,`workspace-${i}`);await mkdir(workspace);tasks.push({id:`t${i}`,workspace,prompt:`Implement public task ${i}`,checks:[]});}
  return {experimental:true,tasks,coordinatorWorkspace,runDir:join(root,'receipts'),maxCostUsd:1,maxAdviceCostUsd:.2,timeoutMs:5000};
}
const success=(cost=.1)=>({status:'completed',budgetEligible:true,usage:{input:5,cacheRead:10,cacheWrite:0,output:2,modelCalls:1,toolCalls:2,estimatedApiUsd:cost,costUnknown:false},stages:[],final:'done'});
function advisor(ids,{cost=.12,raw,stopReason='stop',capture=()=>{}}={}) {
  return async(options,runtime,{onAssistant})=>{
    capture(options);
    return {eventPath:'batch-events.jsonl',abort(){},async run(prompt){
      assert.deepEqual(JSON.parse(prompt).tasks.map(task=>task.taskId),ids);
      const response=raw??JSON.stringify({advice:ids.map(taskId=>({taskId,advice:`Inspect the public contract for ${taskId}.`}))});
      onAssistant({usage:{input:20,output:10,cost:{total:cost}},stopReason,content:[{type:'text',text:response}]});return response;
    },async dispose(){}};
  };
}

test('one tool-free advice call funds disjoint worker caps and reports complete spending',async t=>{
  const request=await fixture(t),workers=[],options=[];
  const out=await executeFleet({...request,features:{advice:'upfront'}},{createSession:advisor(['t0','t1','t2'],{capture:value=>options.push(value)}),executePipeline:async value=>{workers.push(value);return success();}});
  assert.equal(options.length,1);assert.equal(options[0].model,'gpt-6.1-sol');assert.equal(options[0].noTools,true);assert.deepEqual(options[0].allowedTools,[]);assert.equal(options[0].noContextFiles,true);assert.equal(options[0].maxCalls,0);assert.equal(options[0].maxTurns,1);
  assert.equal(workers.length,3);
  for(const worker of workers){assert.equal(worker.model,'gpt-6-luna');assert.equal(worker.effort,'high');assert.equal(worker.maxCostUsd,.88/3);assert.match(worker.prompt,/Advisory hypotheses/);assert.equal(worker.features.advice,false);}
  assert.ok(Math.abs(out.usage.estimatedApiUsd-.42)<1e-12);assert.equal(out.usage.modelCalls,4);
  assert.equal(out.budgetEligible,true);assert.equal(out.advice.eventPath,'batch-events.jsonl');
  assert.ok(out.tasks.every(task=>task.allocatedAdviceCostUsd===.04));
  const saved=JSON.parse(await readFile(join(request.runDir,'fleet.json'),'utf8'));assert.equal(saved.status,'completed');
});

test('concurrency is bounded at two independent workers',async t=>{
  const request=await fixture(t,5);let active=0,peak=0;
  const out=await executeFleet({...request,batchedAdvice:false},{executePipeline:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return success(.01);}});
  assert.equal(peak,2);assert.equal(out.tasks.length,5);assert.equal(out.status,'completed');
});

test('malformed advice preserves paid response and starts no workers',async t=>{
  const request=await fixture(t);let launched=0;
  const out=await executeFleet(request,{createSession:advisor(['t0','t1','t2'],{raw:'not JSON'}),executePipeline:async()=>{launched++;return success();}});
  assert.equal(launched,0);assert.equal(out.advice.status,'failed');assert.equal(out.advice.raw,'not JSON');assert.equal(out.usage.estimatedApiUsd,.12);assert.equal(out.usage.costUnknown,false);assert.equal(out.budgetEligible,false);
  assert.equal(JSON.parse(await readFile(join(request.runDir,'batch-advice.json'),'utf8')).raw,'not JSON');
});

test('unknown advice cost and reservation overshoot stop before worker launch',async t=>{
  for(const cost of [undefined,.25]){
    const request=await fixture(t);let launched=0;
    // NaN is deliberately not an absent option (which would take the default).
    const out=await executeFleet(request,{createSession:advisor(['t0','t1','t2'],{cost:cost??NaN}),executePipeline:async()=>{launched++;return success();}});
    assert.equal(launched,0);assert.equal(out.budgetEligible,false);assert.equal(out.advice.status,'failed');
    assert.equal(out.usage.costUnknown,cost===undefined);
    if(cost!==undefined)assert.equal(out.usage.estimatedApiUsd,cost);
  }
});

test('unknown worker spending halts unlaunched tasks',async t=>{
  const request=await fixture(t);let launched=0;
  const out=await executeFleet({...request,batchedAdvice:false,concurrency:1},{executePipeline:async()=>{launched++;const result=success();result.usage.costUnknown=true;return result;}});
  assert.equal(launched,1);assert.equal(out.stopReason,'worker_cost_unknown');assert.equal(out.usage.costUnknown,true);assert.equal(out.tasks[1].status,'not_started');assert.equal(out.budgetEligible,false);
});

test('worker overshoot cannot borrow from unlaunched worker allowance',async t=>{
  const request=await fixture(t);let launched=0;
  const out=await executeFleet({...request,batchedAdvice:false,concurrency:1},{executePipeline:async()=>{launched++;return success(.4);}});
  assert.equal(launched,1);assert.equal(out.stopReason,'worker_budget_overshoot');assert.equal(out.usage.estimatedApiUsd,.4);assert.equal(out.budgetEligible,false);
});

test('advice disposal failure retains spend and prevents launching workers',async t=>{
  const request=await fixture(t),factory=advisor(['t0','t1','t2']);let launched=0;
  const out=await executeFleet(request,{createSession:async(...args)=>({...await factory(...args),dispose:async()=>{throw Error('receipt flush failed');}}),executePipeline:async()=>{launched++;return success();}});
  assert.equal(launched,0);assert.equal(out.usage.estimatedApiUsd,.12);assert.equal(out.stopReason,'advice_receipt_failure');assert.equal(out.budgetEligible,false);
});

test('worker receipt failure stops scheduling while retaining consumed cost',async t=>{
  const request=await fixture(t);let launched=0;
  const out=await executeFleet({...request,batchedAdvice:false,concurrency:1},{executePipeline:async()=>{launched++;await mkdir(join(request.runDir,'task-t0.json'));return success();}});
  assert.equal(launched,1);assert.equal(out.usage.estimatedApiUsd,.1);assert.equal(out.stopReason,'receipt_failure');assert.equal(out.budgetEligible,false);
});

test('duplicate and nested task workspaces are rejected before inference',async t=>{
  const request=await fixture(t);let launched=false;
  const deps={createSession:async()=>{launched=true;throw Error('unexpected');}};
  request.tasks[1].workspace=request.tasks[0].workspace;
  await assert.rejects(executeFleet(request,deps),/must not overlap/);
  const nested=join(request.tasks[0].workspace,'nested');await mkdir(nested);request.tasks[1].workspace=nested;
  await assert.rejects(executeFleet(request,deps),/must not overlap/);assert.equal(launched,false);
});

test('realpath detects aliased repositories and coordinator overlap',async t=>{
  const request=await fixture(t),alias=join(request.coordinatorWorkspace,'alias');
  await symlink(request.tasks[0].workspace,alias,process.platform==='win32'?'junction':'dir');request.tasks[1].workspace=alias;
  await assert.rejects(executeFleet(request),/must not overlap/);
  request.tasks.splice(1,1);request.coordinatorWorkspace=request.tasks[0].workspace;
  await assert.rejects(executeFleet(request),/outside worker repositories/);
});

test('advice schema rejects omissions, duplicates, oversized instructions, and extra keys',()=>{
  for(const advice of [[],[{taskId:'a',advice:'one'},{taskId:'a',advice:'two'}],[{taskId:'a',advice:Array(121).fill('word').join(' ')},{taskId:'b',advice:'ok'}],[{taskId:'a',advice:'ok',extra:true},{taskId:'b',advice:'ok'}]])assert.throws(()=>parseFleetAdvice(JSON.stringify({advice}),['a','b']));
  assert.throws(()=>parseFleetAdvice('```json\n{}\n```',['a','b']));
  const result=parseFleetAdvice('{"advice":[{"taskId":"__proto__","advice":"one"},{"taskId":"a","advice":"two"}]}',['__proto__','a']);assert.equal(result.__proto__,'one');
});

test('reusing fleet runDir cannot spend again or replace prior receipts',async t=>{
  const request=await fixture(t);let adviceCalls=0;
  const factory=advisor(['t0','t1','t2'],{capture:()=>adviceCalls++});
  const deps={createSession:factory,executePipeline:async()=>success()};
  await executeFleet(request,deps);
  const original=await readFile(join(request.runDir,'fleet.json'),'utf8');
  const marker=await readFile(join(request.runDir,'request.json'),'utf8');
  await assert.rejects(executeFleet(request,deps),/new or empty|EEXIST/);
  assert.equal(adviceCalls,1);assert.equal(await readFile(join(request.runDir,'fleet.json'),'utf8'),original);assert.equal(await readFile(join(request.runDir,'request.json'),'utf8'),marker);
});

test('unreceipted provider request after a paid reply is unknown cost',async t=>{
  const request=await fixture(t);let launched=0;
  const out=await executeFleet(request,{createSession:async(options,runtime,{onAssistant})=>{
    let beforeRequest;for(const extension of options.extensions)extension({on(name,handler){if(name==='before_provider_request')beforeRequest=handler;}});
    return {eventPath:'events.jsonl',async run(){beforeRequest();onAssistant({usage:{cost:{total:.1}},content:[{type:'text',text:'paid first reply'}],stopReason:'stop'});beforeRequest();throw Error('Transport lost response');},async dispose(){}};
  },executePipeline:async()=>{launched++;return success();}});
  assert.equal(launched,0);assert.equal(out.advice.providerRequests,2);assert.equal(out.usage.estimatedApiUsd,.1);assert.equal(out.usage.costUnknown,true);assert.equal(out.budgetEligible,false);assert.equal(out.advice.raw,'paid first reply');
});
