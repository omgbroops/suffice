import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {createPipelineSession} from '../src/pipeline/session.mjs';
import {createObservedRepositoryTools} from '../src/pipeline/tools.mjs';
import {ADVICE_PROMPT,THIN_PROMPT} from '../src/pipeline/policy.mjs';

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
