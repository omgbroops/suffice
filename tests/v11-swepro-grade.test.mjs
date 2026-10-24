import test from 'node:test';
import assert from 'node:assert/strict';
import {assertClosedCohort,verdict,requiredCases,verifyClosedRoot,evidenceInventory,cachedGrade,preserveVerifierFailure,officialReward,confirmedDockerFailure,verifierRetryCount} from '../scripts/v11-swepro-grade.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hash} from '../src/v9/workspace.mjs';

const closed=()=>({closed:true,relayCleanup:{removed:true},attempts:Array.from({length:16},(_,i)=>({id:String(i),status:'completed',patchSha256:'a'.repeat(64),cleanup:{safeToContinue:true,removed:true}}))});
test('private SWEPro candidate grading requires complete, closed actor cohort',()=>{
  assert.doesNotThrow(()=>assertClosedCohort(closed()));
  for(const mutate of [x=>x.closed=false,x=>x.attempts.pop(),x=>x.attempts[2].cleanup.safeToContinue=false,x=>x.relayCleanup.removed=false,x=>x.attempts[2].patchSha256=null,x=>x.attempts[2].id='0',x=>x.attempts[2].status='still_coding']){const x=closed();mutate(x);assert.throws(()=>assertClosedCohort(x),/sealed/);}
  const missing=closed();Object.assign(missing.attempts[3],{status:'closure_failure',artifactStatus:'missing',patchSha256:null,error:'Container terminated before source capture'});assert.doesNotThrow(()=>assertClosedCohort(missing));
});
test('official reward cannot hide missing results, failed process or unsafe closure',()=>{
  const r={process:{exitCode:0},reward:'1\n',output:{tests:[{name:'case',status:'PASSED'}]},required:{fail_to_pass:['case'],pass_to_pass:[]},removed:true};
  assert.equal(verdict(r),'pass');
  assert.equal(verdict({...r,removed:false}),'infrastructure_error');
  assert.equal(verdict({...r,output:null}),'infrastructure_error');
  assert.equal(verdict({...r,output:{tests:[]}}),'infrastructure_error');
  assert.equal(verdict({...r,process:{exitCode:1}}),'infrastructure_error');
  assert.equal(verdict({...r,process:{exitCode:1},reward:'0',output:{tests:[{name:'case',status:'FAILED'}]}}),'test_fail');
  assert.equal(verdict({...r,process:{exitCode:97},output:null,reward:null}),'patch_apply_failed');
  assert.equal(verdict({...r,process:{exitCode:null,timedOut:true},reward:'0'}),'timeout');
});
test('unrelated passing cases cannot authenticate a failing acceptance suite',()=>{
  const required={fail_to_pass:['regression'],pass_to_pass:['public-stable']},process={exitCode:1};
  assert.equal(verdict({process,reward:'0',removed:true,required,output:{tests:[{name:'unrelated',status:'PASSED'}]}}),'incomplete_verification');
  const output={tests:[{name:'regression',status:'FAILED'},{name:'public-stable',status:'PASSED'}]};
  assert.equal(verdict({process,reward:'0',removed:true,required,output}),'test_fail');
  assert.deepEqual(requiredCases(output,required),{required:2,missing:0,allPassed:false,confirmedFailures:1,failToPassFailures:1,passToPassMissing:0,passToPassFailures:0});
  for(const malformed of [null,{}, {tests:{}},{tests:[null]},{tests:[{name:'x',status:'invented'}]}])assert.equal(requiredCases(malformed,required),null);
});
test('missing official verdicts stay unknown and candidate timeouts do not imply infrastructure failure',()=>{
  assert.equal(officialReward({exitCode:0},'1\n'),true);assert.equal(officialReward({exitCode:1},'0\n'),false);
  for(const[p,r]of[[{exitCode:0},null],[{exitCode:1},null],[{exitCode:1,timedOut:true},'0'],[{exitCode:0,error:'engine failed'},'1'],[{exitCode:0},'0']])assert.equal(officialReward(p,r),null);
  assert.equal(confirmedDockerFailure({exitCode:null,timedOut:true},''),false);assert.equal(confirmedDockerFailure({exitCode:1},'candidate failed'),false);assert.equal(confirmedDockerFailure({exitCode:125},'daemon unavailable'),true);
});
async function rootFixture(root){
  const tasks=Array.from({length:8},(_,i)=>({id:'instance_fixture__project-'+i.toString(16).padStart(40,'0')}));
  const schedule=tasks.flatMap(t=>['v11','native'].map(strategy=>({id:t.id+'-r1-'+strategy,taskId:t.id,strategy,repeat:1})));
  const plan={version:'v11-swepro-v2-compatible8-1',tasks,schedule,runtimeFiles:[],evaluationFiles:[]};plan.fingerprint=hash(JSON.stringify(plan));
  const planBytes=JSON.stringify(plan);await writeFile(join(root,'plan.json'),planBytes);
  const execution={closed:true,planFingerprint:plan.fingerprint,planSha256:hash(planBytes),relayCleanup:{removed:true},attempts:[]};
  for(const item of schedule){const directory=join(root,'attempts',item.id);await mkdir(directory,{recursive:true});const patchPath=join(directory,'patch.diff');await writeFile(patchPath,'sealed-'+item.id);const cleanup={safeToContinue:true,removed:true};const attempt={...item,status:'completed',attemptPath:directory,patchPath,patchSha256:hash(await readFile(patchPath)),cleanup};execution.attempts.push(attempt);await writeFile(join(directory,'scheduled-attempt.json'),JSON.stringify(attempt));await writeFile(join(directory,'cleanup.json'),JSON.stringify(cleanup));}
  await writeFile(join(root,'execution-started.json'),JSON.stringify({planFingerprint:plan.fingerprint,planSha256:hash(planBytes)}));await writeFile(join(root,'execution-complete.json'),JSON.stringify(execution));return execution;
}
test('root proof authenticates every patch and start receipt before private grading',async()=>{
  const root=await mkdtemp(join(tmpdir(),'suffice-swepro-root-test-'));let dockerCalls=0;const dockerRun=async()=>{dockerCalls++;return{exitCode:0,stdout:''};};
  try{const execution=await rootFixture(root);assert.match((await verifyClosedRoot(root,{dockerRun})).proofSha256,/^[a-f0-9]{64}$/);
    await writeFile(execution.attempts.at(-1).patchPath,'tampered-last-patch');dockerCalls=0;await assert.rejects(()=>verifyClosedRoot(root,{dockerRun}),/patch changed/);assert.equal(dockerCalls,0);
    await rootFixture(root);await writeFile(join(root,'execution-started.json'),JSON.stringify({planFingerprint:'wrong',planSha256:'wrong'}));await assert.rejects(()=>verifyClosedRoot(root,{dockerRun}),/start receipts/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('cached verifier results require exact request identity and unchanged raw evidence',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'suffice-swepro-cache-test-'));
  try{
    const required={fail_to_pass:['case'],pass_to_pass:[]},output={tests:[{name:'case',status:'PASSED'}]},expected={purpose:'gold',id:'fixture',imageId:'sha256:'+'a'.repeat(64),taskSha256:'b'.repeat(64),patchSha256:hash('patch'),closedCohortProofSha256:null,graderCodeSha256:'c'.repeat(64),timeoutMs:3000_000};
    await mkdir(join(directory,'verifier'));await writeFile(join(directory,'request.json'),JSON.stringify(expected));await writeFile(join(directory,'sealed.patch'),'patch');
    await writeFile(join(directory,'verifier/required-cases.json'),JSON.stringify(required));await writeFile(join(directory,'verifier/output.json'),JSON.stringify(output));await writeFile(join(directory,'verifier/reward.txt'),'1\n');
    const grade={...expected,kind:'pass',pass:true,removed:true,process:{exitCode:0},rawOfficialPass:true,caseSummary:requiredCases(output,required),evidenceFiles:await evidenceInventory(directory)};await writeFile(join(directory,'grade.json'),JSON.stringify(grade));
    assert.equal((await cachedGrade(directory,expected)).pass,true);
    await assert.rejects(()=>cachedGrade(directory,{...expected,patchSha256:'wrong'}),/request differs/);
    await writeFile(join(directory,'verifier/reward.txt'),'0\n');await assert.rejects(()=>cachedGrade(directory,expected),/evidence changed/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('verifier retry preserves partial logs after confirmed closure and cannot move actor sources',async()=>{
  const root=await mkdtemp(join(tmpdir(),'suffice-swepro-retry-test-'));
  try{
    const directory=join(root,'candidate-grades','fixture'),source=join(root,'attempts','fixture');await mkdir(directory,{recursive:true});await mkdir(source,{recursive:true});
    await writeFile(join(directory,'request.json'),JSON.stringify({args:['run','--name','suffice-swepro-verifier-'+'a'.repeat(14)]}));await writeFile(join(directory,'partial-log.txt'),'preserve me');
    await assert.rejects(()=>preserveVerifierFailure(root,directory,{dockerRun:async args=>({exitCode:0,stdout:args[0]==='ps'?'still-running':''})}),/removal could not be confirmed/);
    assert.equal(await readFile(join(directory,'partial-log.txt'),'utf8'),'preserve me');assert.equal(await verifierRetryCount(root,directory),0);
    const calls=[],dockerRun=async args=>{calls.push(args);return{exitCode:0,stdout:''};};
    const history=await preserveVerifierFailure(root,directory,{dockerRun});assert.equal(await readFile(join(history,'partial-log.txt'),'utf8'),'preserve me');assert.ok(calls.some(x=>x[0]==='rm'));assert.ok(calls.some(x=>x[0]==='ps'));assert.equal(await verifierRetryCount(root,directory),1);
    await assert.rejects(()=>preserveVerifierFailure(root,source,{dockerRun}),/verifier directories only/);
  }finally{await rm(root,{recursive:true,force:true});}
});
