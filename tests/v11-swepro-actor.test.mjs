import test from 'node:test';
import assert from 'node:assert/strict';
import {actorPrompt,privateWorkspaceArtifacts,sourceAuditReady} from '../scripts/v11-swepro-container-entry.mjs';
import {publicImageTask,runtimeFiles} from '../scripts/v11-swepro-build.mjs';
import {assertCompletedOrigin,publicActorTask,schedule,sweDockerArgs,assertImageBinding,successfulCanary,runSerialSchedule,canarySetupAccounting} from '../scripts/v11-swepro-bench.mjs';
import {reusableProbe} from '../scripts/v11-swepro-prepare.mjs';
import {hash} from '../src/v9/workspace.mjs';

const id='instance_fixture__project-'+'a'.repeat(40),sha='b'.repeat(64);
test('actor request preserves the complete instruction and omits hidden metadata',()=>{
  const instruction='Problem\nRequirements:\nReturn the public value.\nNew interfaces:\npublic_fn(x)',task={id,instruction,goldPatch:'PRIVATE_GOLD',selectedTestFiles:['PRIVATE_CASE'],directory:'PRIVATE_VERIFIER'};
  assert.ok(actorPrompt(instruction).startsWith(instruction));assert.throws(()=>actorPrompt('x'.repeat(80_000)),/allowance/);
  const row={id,imageId:'sha256:'+sha,probe:{workspace:'/app',core:{eligible:true,sourceHash:sha}},hiddenPaths:['PRIVATE_CASE']};
  const image=publicImageTask(task,row);assert.deepEqual(Object.keys(image).sort(),['id','instructionSha256','sourceHash','workspace']);
  const request=publicActorTask(task,'/empty');assert.equal(request.prompt,instruction);assert.deepEqual(request.solutionFiles,[]);
  assert.doesNotMatch(JSON.stringify({image,request}),/PRIVATE/);
  assert.throws(()=>publicImageTask(task,{...row,probe:{...row.probe,core:{eligible:false}}}),/qualification/);
});
test('source audit rejects private assets in the workspace and stale Git channels',()=>{
  assert.deepEqual(privateWorkspaceArtifacts(new Map([['src/a.py',{}],['.hidden/gold_patch.diff',{}],['test_patch.patch',{}]]),'/app'),['/app/.hidden/gold_patch.diff','/app/test_patch.patch']);
  const clean={sourceHash:sha,expectedSourceHash:sha,exposed:[],objectProbeReady:true,fixingCommitObjectPresent:false,refs:['refs/heads/main'],gitProbeReady:true,unreachableObjects:'',artifactProbeReady:true,privateArtifactPaths:[],metadataProbeReady:true,gitMetadata:[],localRuntimeReady:true};
  assert.equal(sourceAuditReady(clean),true);
  for(const override of[{privateArtifactPaths:['/app/.hidden/gold_patch.diff']},{fixingCommitObjectPresent:true},{refs:['refs/stash']},{gitMetadata:['ORIG_HEAD']},{gitMetadata:['reflog']},{gitMetadata:['hooks/pre-commit']},{metadataProbeReady:false},{localRuntimeReady:false},{sourceHash:'wrong'}])assert.equal(sourceAuditReady({...clean,...override}),false);
});
test('SWE authentication cannot start until both prior27 lanes are fully closed',()=>{
  const origin={closed:true,relayCleanup:{removed:true},attempts:Array.from({length:54},(_,i)=>({id:String(i),strategy:i<27?'v11':'native',cleanup:{safeToContinue:true,removed:true}}))};
  assert.doesNotThrow(()=>assertCompletedOrigin(origin));
  for(const mutate of[x=>x.closed=false,x=>x.attempts[0].strategy='native',x=>x.attempts[0].cleanup.removed=false,x=>x.relayCleanup.removed=false]){const copy=structuredClone(origin);mutate(copy);assert.throws(()=>assertCompletedOrigin(copy),/prior27/);}
});
test('SWE schedule pairs every task once and partial capture uses its real workspace',()=>{
  const tasks=Array.from({length:8},(_,i)=>({id:id+i})),rows=schedule(tasks);assert.equal(rows.length,16);
  for(const task of tasks)assert.deepEqual(rows.filter(x=>x.taskId===task.id).map(x=>x.strategy).sort(),['native','v11']);
  const original=['create','--cpus','2','--memory','3g'];assert.deepEqual(sweDockerArgs(original),['create','--cpus','1','--memory','4g']);assert.deepEqual(original,['create','--cpus','2','--memory','3g']);
  const copy=['cp','container:/work/'+id,'/preserved'];assert.equal(sweDockerArgs(copy,{sourceWorkspace:'/testbed',taskName:id})[1],'container:/testbed');
  assert.equal(sweDockerArgs(['cp','container:/home/node/.codex/auth.json','/opaque'],{sourceWorkspace:'/testbed',taskName:id})[1],'container:/home/node/.codex/auth.json');
  assert.throws(()=>sweDockerArgs(copy,{sourceWorkspace:'/',taskName:id}),/Unsafe/);
});
test('image code binding cannot be transferred to another image or omit runtime files',()=>{
  const files=runtimeFiles.map(path=>({path,sha256:sha})),binding={image:'sha256:'+sha,files,codeSha256:hash(JSON.stringify(files))};
  assert.doesNotThrow(()=>assertImageBinding({actorImage:binding.image,binding}));
  assert.throws(()=>assertImageBinding({actorImage:'sha256:'+'c'.repeat(64),binding}),/binding/);
  assert.throws(()=>assertImageBinding({actorImage:binding.image,binding:{...binding,files:files.slice(1)}}),/binding/);
});
test('qualification resume cannot skip an errored, unsafe or unfinished probe',()=>{
  const task={taskSha256:sha,image:'public-image'},previous={probe:{core:{eligible:false}},taskSha256:sha,image:'public-image',probeClosure:{removed:true,processCompleted:true}};
  assert.equal(reusableProbe(previous,task),true);
  for(const override of[{error:'engine failure'},{probeClosure:{removed:false,processCompleted:true}},{probeClosure:{removed:true,processCompleted:false}},{probeClosure:undefined},{taskSha256:'wrong'}])assert.equal(reusableProbe({...previous,...override},task),false);
});
test('discarded model smoke requires actual public behavior, known usage and stopped clients',()=>{
  const result={status:'completed',sourceSealed:true,canaryPassed:true,costKnown:true,costUsd:0.01,cleanup:{safeToContinue:true,removed:true,authSync:{status:'updated'}}};
  assert.equal(successfulCanary(result),true);
  for(const override of[{status:'unverified'},{sourceSealed:false},{canaryPassed:false},{costKnown:false},{costUsd:NaN},{cleanup:{safeToContinue:true,removed:true,authSync:{status:'failed'}}}])assert.equal(successfulCanary({...result,...override}),false);
  const args=sweDockerArgs(['create','--cpus','2','--memory','3g','image','run'],{mode:'canary'});assert.equal(args.at(-1),'canary');
});
test('SWE actors run serially in seeded order and latch off after unsafe closure',async()=>{
  const items=schedule(Array.from({length:8},(_,i)=>({id:id+i}))),events=[];let active=0;
  const result=await runSerialSchedule(items,async item=>{
    assert.equal(active++,0);events.push('start:'+item.id);await new Promise(resolve=>setImmediate(resolve));
    active--;return{...item,cleanup:{safeToContinue:true,removed:true}};
  },async row=>{assert.equal(active,0);events.push('sealed:'+row.id);await new Promise(resolve=>setImmediate(resolve));});
  assert.equal(result.halted,false);assert.deepEqual(result.attempts.map(x=>x.id),items.map(x=>x.id));
  assert.deepEqual(events,items.flatMap(x=>['start:'+x.id,'sealed:'+x.id]));
  for(const cleanup of[{safeToContinue:false,removed:true},{safeToContinue:true,removed:false},undefined]){
    const started=[],recorded=[];const halted=await runSerialSchedule(items,async item=>{started.push(item.id);return{...item,cleanup};},async row=>recorded.push(row.id));
    assert.equal(halted.halted,true);assert.deepEqual(started,[items[0].id]);assert.deepEqual(recorded,started);
  }
});
test('canary setup totals retain earlier failed runs and unknown usage floors',()=>{
  const first={setupCostKnown:true,setupCostUsd:0.1,setupKnownCostFloorUsd:0.1},second={setupCostKnown:true,setupCostUsd:0.2,setupKnownCostFloorUsd:0.2};
  const known=canarySetupAccounting([first,second]);assert.equal(known.known,true);assert.ok(Math.abs(known.costUsd-0.3)<1e-12);
  const unknown=canarySetupAccounting([first,{setupCostKnown:false,setupCostUsd:null,setupKnownCostFloorUsd:0.05},second]);
  assert.equal(unknown.known,false);assert.equal(unknown.costUsd,null);assert.ok(Math.abs(unknown.knownCostFloorUsd-0.35)<1e-12);
  assert.equal(canarySetupAccounting([first,undefined]).known,false);assert.equal(canarySetupAccounting([{setupCostKnown:true,setupCostUsd:NaN}]).known,false);
});
