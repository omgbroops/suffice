// Wholly fictional receipts and SDK event injection. No provider/model/checker runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import {ModelRuntime,SessionManager} from '@earendil-works/pi-coding-agent';
import {connectLearner,armLearner,learnerAction,invoke,learningText} from '../src/learner.mjs';
import {parseOptions} from '../src/options.mjs';
import {createSufficeSession} from '../src/session.mjs';
import {sufficeInterface} from '../src/interactive.mjs';
const MODEL_LEARNER=process.env.SUFFICE_MODEL_LEARNER_TEST_PROJECT;
const integration={skip:!MODEL_LEARNER};
const now=()=>new Date().toISOString();
const line=value=>JSON.stringify(value)+'\n';
async function fixture(t) {
  const root=await mkdtemp(resolve(tmpdir(),'suffice-learning-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const cwd=resolve(root,'repo'),home=resolve(root,'state');await mkdir(cwd);await mkdir(home);
  const artifact=resolve(cwd,'artifact.txt');await writeFile(artifact,'fictional final artifact');
  const options={...parseOptions([]),cwd,home,learnArtifact:'artifact.txt',learnTests:['fixture::case']};
  const backend=resolve(root,'backend');await mkdir(resolve(backend,'src/model_learner/adapters'),{recursive:true});await writeFile(resolve(backend,'src/model_learner/adapters/suffice.py'),'# synthetic connection fixture\n');
  return {root,cwd,home,artifact,options,backend};
}
async function syntheticCapture(f) {
  const receipts=resolve(f.root,'events.jsonl'),piSession=resolve(f.root,'pi.jsonl'),id=randomUUID(),at=now();
  let rows=[{type:'startup',at,version:'suffice-cli-0.1.0-alpha.2',profile:'general-v1-derived',cwd:f.cwd,model:'fixture-model',provider:'openai',effort:'low',systemPrompt:'FICTIONAL_PRIVATE_PROMPT'}];
  await writeFile(receipts,rows.map(line).join(''));
  const source={hasHistory:()=>false,receipts,piSession:()=>piSession,startedAt:at,
    async link(ids){rows.push({type:'learner_link',at:now(),...ids,pi_session_id:id});await writeFile(receipts,rows.map(line).join(''));}};
  const control=await armLearner(f.options,source);
  const usage={input:10,cacheRead:0,cacheWrite:0,output:2,cost:{total:.02}},message={role:'assistant',model:'fixture-model',provider:'openai',usage,stopReason:'stop',content:[{type:'text',text:'FICTIONAL_PRIVATE_REPLY'}]};
  const after=now();
  rows.push({type:'provider_request',at:after,model:'fixture-model',reasoning:{effort:'low'}},
    {type:'provider_usage',at:after,responseId:'fixture-response',usage:{input_tokens:10,output_tokens:2}},
    {type:'assistant',at:after,...message},{type:'task_end',at:after});
  await writeFile(receipts,rows.map(line).join(''));
  await writeFile(piSession,[{type:'session',version:3,id,timestamp:at,cwd:f.cwd},
    {type:'model_change',id:'a',parentId:null,timestamp:at,modelId:'fixture-model',provider:'openai'},
    {type:'thinking_level_change',id:'b',parentId:'a',timestamp:at,thinkingLevel:'low'},
    {type:'message',id:'c',parentId:'b',timestamp:after,message:{role:'user',content:'FICTIONAL_PRIVATE_PROMPT'}},
    {type:'message',id:'d',parentId:'c',timestamp:after,message}].map(line).join(''));
  return {control,receipts,piSession};
}

test('learning options are explicit and cannot accidentally start inference for verify flags',()=>{
  assert.equal(parseOptions(['--learn']).learn,true);
  assert.throws(()=>parseOptions(['--learn','--continue','--learn-artifact','a','--learn-test','x']),/fresh/);
  assert.throws(()=>parseOptions(['--report','x','task']),/verify/);
  assert.throws(()=>parseOptions(['learn','verify','--exit-code','']),/required|Missing value/);
  const parsed=parseOptions(['learn','verify','--report','r','--generated-at',now(),'--exit-code','1','--independent']);
  assert.equal(parsed.command,'learn');assert.equal(parsed.learnExitCode,1);assert.equal(parsed.learnIndependent,true);
  assert.deepEqual(parseOptions(['--learn-test','a','--learn-test','b']).learnTests,['a','b']);
});

test('connection failure preserves the old private connection',async t=>{
  const f=await fixture(t),good=async()=>({protocol:'suffice-learner/v1',runtime_manifests:true,capture_only:true});
  await connectLearner(f.options,f.backend,{call:good});
  const path=resolve(f.home,'learner/connection.json'),before=await readFile(path);
  await assert.rejects(connectLearner(f.options,f.backend,{call:async()=>{throw Error('offline');}}),/offline/);
  assert.deepEqual(await readFile(path),before);assert.equal((await stat(path)).mode&0o777,0o600);
});

for(const failure of [false,true])test(`real local adapter capture and independent ${failure?'failure':'success'} are replayable`,integration,async t=>{
  const f=await fixture(t);await connectLearner(f.options,MODEL_LEARNER);
  const {control}=await syntheticCapture(f),captured=await control.finish();
  assert.equal(captured.outcome,'unknown');assert.equal(captured.eligible,false);
  assert.equal(captured.summary.linkage,'suffice_runtime');assert.equal(captured.summary.api_equivalent_usd,.02);
  assert.equal(await control.finish(),captured);
  const db=await readFile(resolve(f.home,'learner/ledger.sqlite3'));
  assert.ok(!db.includes(Buffer.from('FICTIONAL_PRIVATE_PROMPT')));assert.ok(!db.includes(Buffer.from('FICTIONAL_PRIVATE_REPLY')));
  const report=resolve(f.root,'independent.xml');
  await writeFile(report,`<testsuite tests="1" failures="${Number(failure)}" errors="0" skipped="0"><testcase classname="fixture" name="case">${failure?'<failure/>':''}</testcase></testsuite>`);
  const options={...f.options,learnReport:report,learnGeneratedAt:now(),learnExitCode:Number(failure),learnIndependent:true};
  const result=await learnerAction(options,'verify');
  assert.equal(result.outcome,failure?'failure':'success');assert.equal(result.eligible,true);
  const repeated=await learnerAction(options,'verify');assert.equal(repeated.observation_id,result.observation_id);assert.equal(repeated.outcome_id,result.outcome_id);
  assert.match(learningText(result),/verified/);
  await writeFile(f.artifact,'changed after verification');
  await assert.rejects(learnerAction(options,'verify'),/rejected/);
});

test('capture failure leaves normal task bookkeeping unverified and can be retried',integration,async t=>{
  const f=await fixture(t);await connectLearner(f.options,MODEL_LEARNER);
  const capture=await syntheticCapture(f);
  await writeFile(capture.piSession,'truncated');
  assert.equal((await capture.control.finish()).capture_failed,true);
  assert.equal((await learnerAction(f.options,'status')).outcome,'unknown');
  await assert.rejects(learnerAction({...f.options,learnReport:'x'},'verify'),/Capture must/);
});

test('real pinned SDK lifecycle emits linkage and captures on final settlement without inference',integration,async t=>{
  const f=await fixture(t);await connectLearner(f.options,MODEL_LEARNER);
  const runtime=await ModelRuntime.create({authPath:resolve(f.home,'fictional-auth.json'),refreshOnCreate:false,allowModelNetwork:false});
  const notices=[];
  const manager=SessionManager.create(f.cwd,resolve(f.home,'sessions'));
  await new Promise(r=>setTimeout(r,5)); // Native UI supplies a pre-existing fresh manager.
  const control=await createSufficeSession({...f.options,sessionManager:manager,model:'gpt-6.1-sol',learn:true,onLearning:m=>notices.push(m)},runtime);
  try {
    const session=control.session;
    // Deliberately inject authored SDK events. Never call prompt()/provider APIs.
    await session._handleAgentEvent({type:'agent_start'});
    await session._handleAgentEvent({type:'message_end',message:{role:'user',content:[{type:'text',text:'fictional task'}],timestamp:Date.now()}});
    await session._extensionRunner.emit({type:'before_provider_request',payload:{model:'gpt-6.1-sol',reasoning:{effort:'low'}}});
    await session._extensionRunner.emit({type:'provider_stream_event',data:{response:{id:'fixture-response',usage:{input_tokens:10,output_tokens:2}}}});
    await session._handleAgentEvent({type:'message_end',message:{role:'assistant',provider:'openai',api:'openai-responses',model:'gpt-6.1-sol',timestamp:Date.now(),stopReason:'stop',usage:{input:10,cacheRead:0,cacheWrite:0,output:2,cost:{total:.03}},content:[{type:'text',text:'fictional answer'}]}});
    await session._extensionRunner.emit({type:'agent_settled',aborted:false});
    const result=await learnerAction(f.options,'status');
    assert.equal(result.outcome,'unknown');assert.equal(result.summary.linkage,'suffice_runtime');
    assert.deepEqual(result.summary.attribution_issues,[]);
    assert.equal(result.summary.usage.complete,true);assert.equal(notices.length,1);
  }finally{await control.dispose();}
});

test('interactive /learn starts fresh and invokes the current controller',async()=>{
  const commands=new Map(),notices=[],armed=[];let current={hasHistory:()=>true};
  sufficeInterface({home:'/fictional',getControl:()=>current})({on(){},registerCommand:(n,c)=>commands.set(n,c)});
  let fresh=0;
  const ctx={cwd:'/fictional',waitForIdle:async()=>{},newSession:async()=>{fresh++;current={enableLearning:async o=>armed.push(o)};return {cancelled:false};},ui:{input:async()=>{throw Error('Learning must not ask setup questions');},setStatus(){},notify:m=>notices.push(m)}};
  await commands.get('learn').handler('',ctx);
  assert.equal(fresh,1);assert.deepEqual(armed,[{learnArtifact:undefined,learnTests:undefined}]);assert.match(notices[0],/Learning is on/);
});

test('backend stderr and malformed output never escape into errors',async()=>{
  const spawnProcess=()=>{const child=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>queueMicrotask(()=>{child.stdout.emit('data','PRIVATE_BODY');child.emit('close',1);});child.stdout=new EventEmitter();child.kill=()=>{};return child;};
  await assert.rejects(invoke({stateRoot:'/fictional',project:'/fictional'},'probe',{}, {spawnProcess}),error=>!error.message.includes('PRIVATE_BODY'));
});

test('native learn command does not initialize credentials or a provider',async t=>{
  const f=await fixture(t),entry=resolve(import.meta.dirname,'../bin/suffice.mjs');
  const result=spawnSync(process.execPath,[entry,'--home',f.home,'--cwd',f.cwd,'learn','status'],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Connect first/);
  await assert.rejects(stat(resolve(f.home,'auth.json')),e=>e.code==='ENOENT');
});

test('leaving an armed session cannot masquerade as an active task',integration,async t=>{
  const f=await fixture(t);await connectLearner(f.options,MODEL_LEARNER);
  const at=now();
  const control=await armLearner(f.options,{hasHistory:()=>false,receipts:resolve(f.root,'unused.jsonl'),piSession:()=>resolve(f.root,'unused-pi.jsonl'),startedAt:at,link:async()=>{}});
  await control.cancel();assert.equal((await learnerAction(f.options,'status')).status,'cancelled');
});

test('a failed native link never leaves an apparently armed task',integration,async t=>{
  const f=await fixture(t);await connectLearner(f.options,MODEL_LEARNER);
  await assert.rejects(armLearner(f.options,{hasHistory:()=>false,receipts:'unused',piSession:()=> 'unused',startedAt:now(),link:async()=>{throw Error('FICTIONAL_PRIVATE_FAILURE');}}),/not armed/);
  assert.equal((await learnerAction(f.options,'status')).status,'cancelled');
});

test('already captured retry does not reinterpret subsequently growing session files',integration,async t=>{
  const f=await fixture(t);await connectLearner(f.options,MODEL_LEARNER);
  const capture=await syntheticCapture(f);const original=await capture.control.finish();
  await writeFile(capture.piSession,'subsequent unrelated content');
  const retried=await learnerAction(f.options,'retry');assert.equal(retried.observation_id,original.observation_id);
});

for(const [review,expected] of [['success','success'],['failure','failure'],['unknown','unknown']])test(`one-step capture and optional ${review} feedback need no artifact or tests`,integration,async t=>{
  const f=await fixture(t);delete f.options.learnArtifact;delete f.options.learnTests;
  await connectLearner(f.options,MODEL_LEARNER);
  const capture=await syntheticCapture(f);const first=await capture.control.finish();
  assert.equal(first.outcome,'unknown');assert.equal(first.eligible,false);assert.equal(first.summary.capture_only,true);
  assert.match(learningText(first),/Optional/);
  const result=await learnerAction({...f.options,learnReview:review},'review');
  assert.equal(result.outcome,expected);assert.equal(result.verification,'unverified');assert.equal(result.eligible,false);
  const repeated=await learnerAction({...f.options,learnReview:review},'review');assert.equal(repeated.outcome_id,result.outcome_id);
  await assert.rejects(learnerAction({...f.options,learnReport:'unused'},'verify'),/without a verification target/);
});
