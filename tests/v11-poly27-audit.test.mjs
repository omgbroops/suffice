import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {hash,treeHash} from '../src/v9/workspace.mjs';
import {parseNativeEvents} from '../src/bench/native-codex.mjs';
import {summarizeCohort} from '../scripts/v11-poly27-evaluate.mjs';
import {auditCohort,assertEvidencePath,stagePolicy,reconcilePiMessage,pairedChanges} from '../scripts/v11-poly27-audit.mjs';

const models={worker:'gpt-6-luna',expert:'gpt-6.1-sol',native:'gpt-6.1-sol'},efforts={worker:'high',advisor:'low',expert:'high'};
const rates={input:1,output:2,cacheRead:.1,cacheWrite:1.25};
async function temporary(t){const root=await mkdtemp(join(tmpdir(),'v11-audit-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function save(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');return path;}
const fileDigest=async path=>({path,sha256:hash(await readFile(path))});

test('all seven V11 stage roles retain pinned model and reviewer tool policy',()=>{
  for(const role of ['test-writer','test-writer-retry','arbiter','verification-recovery'])assert.deepEqual(stagePolicy(role,models,efforts),{model:models.expert,effort:'low',reviewer:true});
  assert.deepEqual(stagePolicy('repair',models,efforts),{model:models.worker,effort:'high',reviewer:false});
  assert.deepEqual(stagePolicy('takeover',models,efforts),{model:models.expert,effort:'high',reviewer:false});
  assert.throws(()=>stagePolicy('private-grader-rescue',models,efforts),/Unrecognized/);
});
test('Pi reconciliation includes cache reads, tier thresholds and one-hour writes',()=>{
  const pricing={...rates,tiers:[{inputTokensAbove:100,input:3,output:4,cacheRead:.3,cacheWrite:3.75}]};
  const message={model:models.expert,provider:'openai',usage:{input:70,cacheRead:20,cacheWrite:20,cacheWrite1h:5,output:4,cost:{total:(210+6+15*3.75+5*6+16)/1e6}}};
  const result=reconcilePiMessage(message,{model:models.expert,pricing});
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.usage,{inputTokens:110,cachedInputTokens:20,outputTokens:4});
  message.usage.cost.total+=.01;assert.ok(reconcilePiMessage(message,{model:models.expert,pricing}).errors.includes('total_cost'));
  message.model='fallback';assert.ok(reconcilePiMessage(message,{model:models.expert,pricing}).errors.includes('response_identity'));
  delete message.usage;assert.equal(reconcilePiMessage(message,{model:models.expert,pricing}).complete,false);
});
test('audit refuses credential paths and incomplete actor or grading closure',async t=>{
  for(const path of ['C:/Users/name/.codex/auth.json','/root/private-auth/v11/auth.json','/repo/.env','C:\\test\\private-auth\\native\\auth.json'])assert.throws(()=>assertEvidencePath(path),/outside audit scope/);
  const root=await temporary(t);await save(join(root,'execution-complete.json'),{closed:false,attempts:[]});
  await assert.rejects(auditCohort(root),/54 terminal actors/);
  await save(join(root,'execution-complete.json'),{closed:true,attempts:Array.from({length:54},(_,i)=>({id:String(i),status:'completed'}))});
  await save(join(root,'grades.json'),{grades:[]});await assert.rejects(auditCohort(root),/54 candidate grading rows/);
});
test('same-suite changes compare original V10 grades without inventing a held-out cohort',()=>{
  const tasks=[{id:'one',taskId:'python/one'},{id:'two',taskId:'python/two'}];
  const execution=strategy=>({attempts:tasks.flatMap(task=>[strategy,'native'].map(arm=>({id:task.id+'-'+arm,taskId:task.id,strategy:arm})))});
  const grades=(state,pass)=>state.attempts.map(a=>({id:a.id,accepted:pass(a)}));
  const before=execution('v10'),after=execution('v11'),result=pairedChanges(tasks,after,grades(after,a=>a.taskId==='one'),before,grades(before,a=>a.taskId==='two'));
  assert.equal(result.gained,1);assert.equal(result.lost,1);assert.equal(result.ungraded,0);assert.equal(result.rows.length,2);
});

async function closedFixture(root){
  const tasks=Array.from({length:27},(_,i)=>({id:`example_${i}`,taskId:`python/example-${i}`,lang:'python'}));
  const pricing=Object.fromEntries(Object.values(models).map(model=>[model,rates]));
  const runtimeFiles=await Promise.all(['src/v9/workspace.mjs','src/v11/config.mjs','scripts/v11-poly27-evaluate.mjs','src/bench/native-codex.mjs'].map(path=>fileDigest(resolve(path))));
  const hostDriverSha256=runtimeFiles.find(file=>file.path===resolve('scripts/v11-poly27-evaluate.mjs')).sha256;
  const attempts=[],grades=[],validationRows=[];
  async function grader(task,mode,patchSha256){
    const directory=join(root,'evaluation',task.id,mode+(patchSha256??'')),result={schemaVersion:1,id:task.id,taskId:task.taskId,lang:task.lang,mode,
      status:mode==='baseline'?'failed':'passed',accepted:mode!=='baseline',kind:mode==='baseline'?'test_failure':'pass',
      counts:{tests:1,passed:mode==='baseline'?0:1,failed:mode==='baseline'?1:0,skipped:0},calls:[{exitCode:mode==='baseline'?1:0,error:null,timedOut:false,aborted:false,overflow:false}],...(mode==='candidate'?{expectedTests:1}:{})};
    const resultPath=await save(join(directory,'results/result.json'),result),receipt={image:'sha256:'+'f'.repeat(64),hostDriverSha256,patchSha256,result,
      process:{exitCode:mode==='baseline'?1:0,error:null,timedOut:false,aborted:false,overflow:false},evidenceFiles:[await fileDigest(resultPath)]};
    const receiptPath=join(directory,'host-receipt.json');receipt.receiptPath=receiptPath;await save(receiptPath,receipt);return receipt;
  }
  for(const [index,task]of tasks.entries()){
    validationRows.push({id:task.id,taskId:task.taskId,expectedTests:1,baseline:await grader(task,'baseline'),gold:await grader(task,'gold')});
    for(const strategy of ['v11','native']){
      const id=`${task.id}-r1-${strategy}`,attemptPath=join(root,'attempts',id),source=Buffer.from('public source\n'),patch=Buffer.from('sealed patch '+id+'\n'),patchPath=join(attemptPath,'patch.diff');
      await mkdir(join(attemptPath,'sealed-source'),{recursive:true});await writeFile(join(attemptPath,'sealed-source/source.py'),source);await writeFile(patchPath,patch);
      await save(join(attemptPath,'source-files.json'),[{path:'source.py',bytes:source.length,mode:0o644,sha256:hash(source)}]);
      const row={id,taskId:task.id,strategy,status:'completed',attemptPath,patchPath,patchSha256:hash(patch),sourceHash:treeHash(new Map([['source.py',{bytes:source,mode:0o644}]])),
        cleanup:{safeToContinue:true},protectionViolations:[],policyValid:true,actorLatencyMs:100,latencyMs:120,repairs:0,takeovers:0};
      const actor=join(attemptPath,'actor');await mkdir(actor);
      if(strategy==='native'){
        const events=[{type:'turn.started',model:models.native},{type:'item.completed',item:{type:'agent_message',text:'done'}},{type:'turn.completed',model:models.native,usage:{input_tokens:10,cached_input_tokens:2,output_tokens:3}}].map(event=>JSON.stringify(event)).join('\n')+'\n';
        const process={exitCode:0,error:null,timedOut:false,aborted:false,overflow:false},receipt={model:models.native,effort:'high',dispatched:true,process,...parseNativeEvents(events,{...process,model:models.native,pricing:rates})};
        await writeFile(join(actor,'events.jsonl'),events);await writeFile(join(actor,'final.txt'),'done');await save(join(actor,'receipt.json'),receipt);
        Object.assign(row,{costKnown:true,costUsd:receipt.costUsd,knownCostFloorUsd:receipt.costUsd,usage:receipt.usage});
      }else{
        const roles=index===0?['implement','test-writer','test-writer-retry','arbiter','verification-recovery','repair','takeover']:['implement','test-writer'];
        const stages=[];for(const [stageIndex,role]of roles.entries()){
          const policy=stagePolicy(role,models,efforts),usage={input:10,cacheRead:2,cacheWrite:0,output:3,cost:{total:16.2/1e6}},stage={role,model:policy.model,effort:policy.effort,status:'completed',costKnown:true,costUsd:usage.cost.total,knownCostFloorUsd:usage.cost.total,
            toolCalls:0,usage:{inputTokens:12,cachedInputTokens:2,outputTokens:3}};
          const directory=join(actor,`stage-${stageIndex+1}-${role}`);await mkdir(directory);
          await save(join(directory,'receipt.json'),stage);await writeFile(join(directory,'events.jsonl'),JSON.stringify({type:'assistant',model:policy.model,provider:'openai',usage,stopReason:'stop',content:[{type:'text',text:'done'}]})+'\n');stages.push(stage);
        }
        const actorResult={stages,notes:[],policyEligible:true,policyViolations:[],writerRetries:roles.includes('test-writer-retry')?1:0,verificationRecoveries:roles.includes('verification-recovery')?1:0,
          repairs:roles.includes('repair')?1:0,takeovers:roles.includes('takeover')?1:0};
        await save(join(actor,'stages.json'),stages);
        Object.assign(row,{costKnown:true,costUsd:stages.length*16.2/1e6,knownCostFloorUsd:stages.length*16.2/1e6,
          usage:{inputTokens:stages.length*12,cachedInputTokens:stages.length*2,outputTokens:stages.length*3},controllerPolicyEligible:true,controllerPolicyViolations:[],
          writerRetries:actorResult.writerRetries,verificationRecoveries:actorResult.verificationRecoveries,repairs:actorResult.repairs,takeovers:actorResult.takeovers});
        await save(join(attemptPath,'actor-result.json'),{...actorResult,status:row.status,costKnown:row.costKnown,costUsd:row.costUsd,knownCostFloorUsd:row.knownCostFloorUsd,usage:row.usage});
      }
      attempts.push(row);const receipt=await grader(task,'candidate',row.patchSha256);
      grades.push({id,taskId:task.id,strategy,accepted:true,status:'passed',expectedTests:1,receiptPath:receipt.receiptPath});
    }
  }
  await save(join(root,'public-tasks.json'),tasks);await save(join(root,'reference-validation.json'),{valid:true,tasks:validationRows});
  const evaluationFiles=await Promise.all(['public-tasks.json','reference-validation.json'].map(name=>fileDigest(join(root,name))));
  const body={tasks:tasks.map(({id,taskId})=>({id,taskId})),models,pricing,runtimeFiles,evaluationFiles,graderImage:'sha256:'+'f'.repeat(64),timeoutMs:3000000,schedule:attempts.map(({id,taskId,strategy})=>({id,taskId,strategy}))};
  const plan={...body,fingerprint:hash(JSON.stringify(body))};await save(join(root,'plan.json'),plan);const planSha256=hash(await readFile(join(root,'plan.json')));
  const execution={closed:true,attempts,planSha256,planFingerprint:plan.fingerprint};await save(join(root,'execution-complete.json'),execution);await save(join(root,'execution-started.json'),{planSha256,planFingerprint:plan.fingerprint});
  const executionSha256=hash(await readFile(join(root,'execution-complete.json')));await save(join(root,'grades.json'),{planSha256,executionSha256,graderImage:plan.graderImage,grades});
  await save(join(root,'summary.json'),{...summarizeCohort(execution,grades),planSha256,graderImage:plan.graderImage});
  await save(join(root,'evaluation/grading-complete.json'),{planSha256,executionSha256,gradesSha256:hash(await readFile(join(root,'grades.json'))),summarySha256:hash(await readFile(join(root,'summary.json')))});
  return {attempts};
}
test('54-source audit reconciles every retry/recovery, native receipt and canonical grader; tampering fails',async t=>{
  const root=await temporary(t),{attempts}=await closedFixture(root),{audit,csv}=await auditCohort(root,{writeOutput:false});
  assert.equal(audit.passed,true,JSON.stringify(audit.issues));assert.equal(audit.rawUsageComplete,true);assert.equal(audit.counters.sourceInventoriesVerified,54);
  assert.equal(audit.counters.nativeReceiptsReparsed,27);assert.equal(audit.counters.referenceGradeReceiptsVerified,54);assert.equal(audit.counters.candidateGradeReceiptsVerified,54);
  assert.equal(audit.counters.piStagesReconciled,59);assert.equal(audit.summary.arms[0].writerRetries,1);assert.equal(audit.summary.arms[0].verificationRecoveries,1);assert.equal(csv.trim().split('\n').length,28);
  const raw=join(attempts[0].attemptPath,'actor/stage-3-test-writer-retry/events.jsonl'),events=JSON.parse((await readFile(raw,'utf8')).trim());events.usage.cost.total+=1;await writeFile(raw,JSON.stringify(events)+'\n');
  const tampered=await auditCohort(root,{writeOutput:false});assert.equal(tampered.audit.passed,false);assert.ok(tampered.audit.issues.some(issue=>issue.code==='pi_message_total_cost'));
  await writeFile(join(attempts[1].attemptPath,'sealed-source/source.py'),'changed');const altered=await auditCohort(root,{writeOutput:false});assert.ok(altered.audit.issues.some(issue=>issue.code==='source_content_mismatch'));
});
