import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {createPipelineSession} from '../src/pipeline/session.mjs';
import {createObservedRepositoryTools} from '../src/pipeline/tools.mjs';
import {ADVICE_PROMPT,THIN_PROMPT} from '../src/pipeline/policy.mjs';
import {createSufficeSession} from '../packages/cli/src/session.mjs';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';

test('explicit V1 response allowance is enforced while the default permits a longer conversation',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-turn-allowance-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const repo=resolve(dir,'repo');await mkdir(repo);
  const runtime=await ModelRuntime.create({authPath:resolve(dir,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
  await runtime.setRuntimeApiKey('openai','offline-fixture-not-sent');
  for(const maxTurns of [2,undefined]) {
    const control=await createSufficeSession({cwd:repo,home:resolve(dir,String(maxTurns)),model:'gpt-6.1-sol',effort:'high',timeout:30,maxCost:1,...(maxTurns?{maxTurns}:{})},runtime);
    let responses=0;
    control.session.agent.streamFunction=()=>{
      const stream=createAssistantMessageEventStream(),n=++responses;
      const message={role:'assistant',api:'openai-responses',provider:'openai',model:'gpt-6.1-sol',timestamp:Date.now(),
        content:n<=3?[{type:'toolCall',id:'fixture-'+n,name:'codemode',arguments:{code:'text(1)'}}]:[{type:'text',text:'Complete'}],
        stopReason:n<=3?'toolUse':'stop',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
      queueMicrotask(()=>{stream.push({type:'done',reason:message.stopReason,message});stream.end(message);});
      return stream;
    };
    try {
      // The synthetic stream deliberately bypasses provider hooks and ignores
      // cancellation. The session must still reject the run as over allowance;
      // the default branch must accept the identical conversation.
      if(maxTurns) {await assert.rejects(control.run('Exercise the allowance'),/turn_limit/);}
      else {await control.run('Exercise the allowance');assert.equal(responses,4);}
    }finally{await control.dispose();}
  }
});

test('advisor native session has no active tools or repository instructions, worker keeps codemode and AST',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-pipeline-session-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const repo=resolve(dir,'repo'),home=resolve(dir,'home');await mkdir(repo);await mkdir(home);
  await writeFile(resolve(repo,'AGENTS.md'),'UNIQUE_REPO_CONTRACT');
  const runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
  const base={cwd:repo,home,model:'gpt-6.1-sol',effort:'low',timeout:10,maxCost:.1,maxCalls:20,maxTurns:3};
  const advice=await createPipelineSession({...base,noTools:true,allowedTools:[],noContextFiles:true,systemPrompt:ADVICE_PROMPT},runtime);
  const observed=await createObservedRepositoryTools({workspace:repo,artifactDir:resolve(dir,'observations')});
  const worker=await createPipelineSession({...base,home:resolve(dir,'worker'),tools:observed.tools,extensions:[observed.extension],systemPrompt:THIN_PROMPT},runtime);
  try {
    assert.deepEqual(advice.session.getActiveToolNames(),[]);assert.doesNotMatch(advice.session.systemPrompt,/UNIQUE_REPO_CONTRACT/);
    const names=worker.session.getActiveToolNames();assert.ok(names.includes('codemode'));assert.ok(names.includes('symbols'));assert.ok(names.includes('command_output'));
    assert.match(worker.session.systemPrompt,/UNIQUE_REPO_CONTRACT/);assert.equal(worker.totals.modelCalls,0);assert.equal(advice.totals.modelCalls,0);
  }finally{await advice.dispose();await worker.dispose();}
});

test('enhancement adapter with features off retains the V1 prompt and active tool list',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-parity-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const repo=resolve(dir,'repo');await mkdir(repo);
  const runtime=await ModelRuntime.create({authPath:resolve(dir,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
  const base={cwd:repo,home:resolve(dir,'a'),model:'gpt-6.1-sol',effort:'medium',timeout:10,maxCost:.1,maxCalls:160,maxTurns:40};
  const a=await createSufficeSession(base,runtime),b=await createPipelineSession({...base,home:resolve(dir,'b')},runtime);
  try {assert.equal(a.session.systemPrompt,b.session.systemPrompt);assert.deepEqual(a.session.getActiveToolNames(),b.session.getActiveToolNames());
    assert.equal(a.session.thinkingLevel,b.session.thinkingLevel);assert.equal(a.session.model.id,b.session.model.id);
  }finally{await a.dispose();await b.dispose();}
});
