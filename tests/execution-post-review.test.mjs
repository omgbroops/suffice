import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {executeStrategy,strategyRequest} from '../src/execution/strategies.mjs';
import {parseReview,reviewPacket,reviewBaseline} from '../src/execution/post-review.mjs';
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'post-review-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const workspace=join(root,'repo');await mkdir(workspace);await writeFile(join(workspace,'code.txt'),'old\n');
  const git=args=>execFileSync('git',args,{cwd:workspace,stdio:'pipe'});
  git(['init']);git(['add','code.txt']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture']);
  return {strategy:'efficient-review',experimental:true,workspace,runDir:join(root,'receipts'),prompt:'Keep the public contract',checks:[{command:['public-check']}],maxCostUsd:1,
    features:{preparedContext:false,guidance:false,notices:false,outputControl:false}};
}
function fake(r,{decision={decision:'approve',corrections:[]},costs=[.002,.003,.004],check=true}={}){
  const options=[],prompts=[];let calls=0;
  return {options,prompts,runCheck:async()=>({passed:check,exitCode:check?0:1,output:'public only'}),
    createSession:async(opt,_runtime,cb)=>({dispose:async()=>{},abort(){},run:async prompt=>{
      const i=calls++;options.push(opt);prompts.push(prompt);
      if(i===0){await writeFile(join(r.workspace,'code.txt'),'new\n');await writeFile(join(r.workspace,'added.txt'),'new file\n');}
      if(i===2)await writeFile(join(r.workspace,'code.txt'),'repaired\n');
      cb.onAssistant({usage:{input:10,cacheRead:2,output:3,cost:costs[i]===null?undefined:{total:costs[i]}},stopReason:'stop',content:[]});
      return i===1?(typeof decision==='string'?decision:JSON.stringify(decision)):'implementation';
    }})};
}
test('review runs after passing checks, sees real tracked/untracked diff, and cannot execute tools',async t=>{
  const r=await fixture(t),d=fake(r);const out=await executeStrategy(r,d);
  assert.equal(out.status,'completed');assert.equal(out.stages.length,2);assert.equal(out.repairs,0);
  assert.equal(out.reviewCalls,1);assert.equal(out.adviceCalls,0);
  assert.equal(out.review.decision,'approve');assert.equal(out.stages[1].model,'gpt-6.1-sol');assert.equal(out.stages[1].effort,'low');
  assert.deepEqual(d.options[1].allowedTools,[]);assert.equal(d.options[1].noTools,true);assert.equal(d.options[1].noContextFiles,true);assert.equal(d.options[1].maxTurns,1);assert.ok(d.options[1].timeout<=60);
  const packet=JSON.parse(d.prompts[1]);assert.equal(packet.originalTask,r.prompt);assert.match(packet.patch,/-old\n\+new/);assert.equal(packet.newFiles[0].path,'added.txt');assert.equal(packet.publicVerification.status,'passed');
  assert.ok(Math.abs(out.usage.estimatedApiUsd-.005)<1e-10);
});
test('correction permits exactly one Luna High repair, rechecks and accounts all stages',async t=>{
  for(const check of [true,false]){
  const r=await fixture(t),d=fake(r,{check,decision:{decision:'correct',corrections:[{path:'code.txt',action:'Preserve the original public invariant'}]}});
  const out=await executeStrategy(r,d);assert.equal(out.repairs,1);assert.equal(out.stages.length,3);assert.equal(out.escalations,0);assert.equal(out.review.status,'repair_completed');
  assert.equal(d.options[2].model,'gpt-6-luna');assert.equal(d.options[2].effort,'high');assert.match(d.prompts[2],/Preserve the original public invariant/);
  assert.equal(out.verification.length,2);assert.ok(Math.abs(out.usage.estimatedApiUsd-.009)<1e-10);
  assert.equal(out.status,check?'completed':'verification_failed');
  }
});
test('review also runs with unavailable checks; approval is not a verification certificate',async t=>{
  const r=await fixture(t),d=fake(r);d.runCheck=async()=>({status:'unavailable',passed:false,exitCode:null,output:'missing checker'});
  const out=await executeStrategy(r,d);assert.equal(out.stages.length,2);assert.equal(out.review.decision,'approve');assert.equal(out.status,'verification_unavailable');assert.equal(out.budgetEligible,false);
});
test('malformed review and unknown usage preserve cost and never fund repair',async t=>{
  for(const variant of [{decision:'approve please'},{costs:[.002,null]}]){
    const r=await fixture(t),d=fake(r,variant);const out=await executeStrategy(r,d);
    assert.equal(out.repairs,0);assert.notEqual(out.status,'completed');assert.equal(out.stages.length,2);assert.equal(out.budgetEligible,false);
    if(variant.costs)assert.equal(out.usage.costUnknown,true);else assert.ok(out.usage.estimatedApiUsd>0);
  }
});
test('shared task budget and reviewer cost overshoot stop repair',async t=>{
  for(const costs of [[.002,.04],[1.1]]){
    const r=await fixture(t),d=fake(r,{costs});const out=await executeStrategy(r,d);
    assert.equal(out.status,'budget_stopped');assert.equal(out.repairs,0);assert.equal(out.budgetEligible,false);assert.ok(out.usage.estimatedApiUsd>=costs[0]);
  }
});
test('dirty initial workspace rejects before any paid calls; oversize diff is never silently truncated',async t=>{
  const r=await fixture(t);await writeFile(join(r.workspace,'code.txt'),'dirty');const d=fake(r);
  const out=await executeStrategy(r,d);assert.equal(d.options.length,0);assert.equal(out.status,'operational_failure');
  await writeFile(join(r.workspace,'code.txt'),'old\n');const baseline=await reviewBaseline(r.workspace);
  await writeFile(join(r.workspace,'code.txt'),'x'.repeat(50000));await assert.rejects(reviewPacket({workspace:r.workspace,baseline,prompt:r.prompt,evidence:{}}),/allowance/);
});
test('strict correction schema rejects unsafe paths and inconsistent decisions',()=>{
  for(const value of [{decision:'approve',corrections:[{path:'a',action:'fix'}]}, {decision:'correct',corrections:[]}, {decision:'correct',corrections:[{path:'../secret',action:'fix'}]}])assert.throws(()=>parseReview(JSON.stringify(value)));
  assert.equal(strategyRequest({}).strategy,'flexible');assert.throws(()=>strategyRequest({strategy:'efficient-review',model:'gpt-6.1-sol'}));
  assert.throws(()=>strategyRequest({strategy:'flexible',features:{postReview:true}}));
});
