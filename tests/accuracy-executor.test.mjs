import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ModelRuntime,createCodemodeExtension} from '@earendil-works/pi-coding-agent';
import {executeAccuracyPipeline} from '../src/accuracy/executor.mjs';
import {executePipeline} from '../src/pipeline/executor.mjs';
import {createReviewTools} from '../src/accuracy/tools.mjs';
import {validateReview} from '../src/accuracy/review.mjs';
import {createPipelineSession} from '../src/pipeline/session.mjs';
import {REVIEW_PROMPT} from '../src/accuracy/policy.mjs';

const exec=promisify(execFile);
const original='export function cents(amount=0) { return Math.round(amount * 100); }\n';
const broken='export function cents(amount=0) { return Math.floor(amount * 100); }\n';
const finding={contract:'Payments retain nearest-cent rounding and a default of zero.',sourcePath:'payment.js',evidence:'Math.floor(amount * 100)',action:'Preserve nearest-cent rounding while retaining the default.'};
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'suffice-accuracy-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const workspace=join(root,'repo');await mkdir(workspace);await writeFile(join(workspace,'payment.js'),original);
  const git=async args=>exec('git',args,{cwd:workspace});
  await git(['init','--quiet']);await git(['add','--','payment.js']);await git(['-c','user.name=Offline Test','-c','user.email=offline@example.invalid','commit','--quiet','-m','fixture']);
  return {experimental:true,workspace,runDir:join(root,'receipts'),prompt:'Repair cancellation cleanup while preserving the existing payment API.',checks:[{command:['node','public-check.mjs']}],maxCostUsd:.25};
}
function fake({costs=[.01,.002,.01],checks=[true,true],review=JSON.stringify({verdict:'pass',findings:[]}),inspect=true,extraReview,unreceipted=false}={}) {
  const options=[],prompts=[],order=[];let stage=0,check=0;
  return {options,prompts,order,
    createSession:async(opt,_runtime,callbacks)=>{
      const index=stage++,reviewer=opt.allowedTools?.includes('changes'),hooks=new Map();let aborted=false;
      options.push(opt);
      for(const install of opt.extensions??[])install({on(name,fn){const list=hooks.get(name)??[];list.push(fn);hooks.set(name,list);}});
      const emit=async(name,event)=>{for(const fn of hooks.get(name)??[]){const out=await fn(event);if(out?.block)throw Error(out.reason);}};
      const assistant=(cost,content=[{type:'text',text:'done'}])=>callbacks.onAssistant({usage:{input:10,cacheRead:5,cacheWrite:1,output:3,...(cost===null?{}:{cost:{total:cost}})},content,stopReason:'stop'});
      const tool=async(name,args)=>{await emit('tool_call',{toolName:name,input:args});if(aborted)throw Error('Task allowance exhausted');return opt.tools.find(t=>t.name===name).execute('offline',args);};
      return {eventPath:null,abort(){aborted=true;},dispose:async()=>{},run:async text=>{
        prompts.push(text);order.push(reviewer?'review':index?'worker-followup':'solve');
        await emit('before_provider_request',{});
        if(unreceipted&&reviewer)throw Error('Connection ended before usage receipt');
        const cost=index<costs.length?costs[index]:.001;
        if(!reviewer){await writeFile(join(opt.cwd,'payment.js'),index?original:broken);assistant(cost);return 'Implemented and checked.';}
        assistant(cost===null?null:cost/2,[{type:'toolCall',name:'codemode'}]);
        if(aborted)throw Error('Task allowance exhausted');
        if(inspect){await tool('read',{path:'payment.js'});await tool('changes',{mode:'list'});await tool('changes',{mode:'diff',path:'payment.js'});}
        if(extraReview)await extraReview({emit,assistant,tool,opt});
        await emit('before_provider_request',{});assistant(cost===null?null:cost/2);
        return review;
      }};
    },
    runCheck:async({check:c})=>{order.push('check');const passed=checks[check++]??true;return {command:c.command,exitCode:passed?0:1,passed,output:passed?'ok':'cancellation cleanup leaked a timer'};}
  };
}

test('green public checks still trigger fresh same-medium read-only review and exact shared accounting',async t=>{
  const r=await fixture(t),d=fake(),out=await executeAccuracyPipeline(r,d);
  assert.equal(out.status,'completed');assert.equal(out.reviewStatus,'pass');assert.equal(out.compatibilityReviewPassed,true);assert.equal(out.budgetEligible,true);
  assert.deepEqual(d.order,['solve','check','review']);assert.equal(out.stages[1].reviewer,true);assert.equal(out.stages[1].label,'contract-review');
  assert.equal(out.model,'gpt-6-luna');assert.equal(out.effort,'medium');assert.equal(d.options[1].model,d.options[0].model);assert.equal(d.options[1].effort,d.options[0].effort);
  assert.equal(d.options[1].noContextFiles,true);assert.equal(d.options[1].maxTurns,6);assert.equal(d.options[1].maxCalls,24);assert.equal(d.options[1].maxCost,.01);
  assert.deepEqual(d.options[1].tools.map(x=>x.name).sort(),['changes','read','symbol_read','symbol_references','symbols']);
  assert.equal(out.usage.modelCalls,3);assert.equal(out.usage.toolCalls,3);assert.equal(out.usage.input,30);assert.equal(out.usage.cacheRead,15);assert.equal(out.usage.cacheWrite,3);assert.equal(out.usage.output,9);
  assert.ok(Math.abs(out.usage.estimatedApiUsd-.012)<1e-12);
  for(const key of ['estimatedApiUsd','modelCalls','toolCalls','input','cacheRead','cacheWrite','output'])assert.ok(Math.abs(out.usage[key]-out.stages.reduce((n,s)=>n+s.usage[key],0))<1e-12);
  assert.match(d.prompts[0],/public documentation, callers and tests/);
  assert.equal(JSON.parse(await readFile(join(r.runDir,'review-validation.json'),'utf8')).valid,true);
});

test('source-supported revision permits one same-medium correction and rechecks, without fabricated second acceptance',async t=>{
  const d=fake({review:JSON.stringify({verdict:'revise',findings:[finding]})}),out=await executeAccuracyPipeline(await fixture(t),d);
  assert.equal(out.status,'completed');assert.equal(out.reviewStatus,'revised_unreviewed');assert.equal(out.compatibilityReviewPassed,false);assert.equal(out.reviewCorrections,1);
  assert.deepEqual(d.order,['solve','check','review','worker-followup','check']);assert.equal(out.stages.length,3);assert.equal(out.stages[2].label,'contract-correction');
  assert.equal(out.stages[2].model,'gpt-6-luna');assert.equal(out.stages[2].effort,'medium');assert.equal(out.reviews[0].findings[0].supported,true);
  assert.equal(out.verification[1].label,'contract-correction');assert.ok(Math.abs(out.usage.estimatedApiUsd-.022)<1e-12);
});

test('ordinary failed-check repair precedes mandatory compatibility review',async t=>{
  const d=fake({costs:[.01,.01,.002],checks:[false,true]});
  const out=await executeAccuracyPipeline({...await fixture(t),features:{repairs:true}},d);
  assert.equal(out.repairs,1);assert.equal(out.reviewStatus,'pass');assert.deepEqual(d.order,['solve','check','worker-followup','check','review']);assert.match(d.prompts[1],/leaked a timer/);
});

for(const [label,review] of [
  ['hallucinated evidence',JSON.stringify({verdict:'revise',findings:[{...finding,evidence:'does not exist'}]})],
  ['malformed JSON','```json\n{"verdict":"pass","findings":[]}\n```'],
  ['contradictory pass',JSON.stringify({verdict:'pass',findings:[finding]})],
  ['extra schema fields',JSON.stringify({verdict:'pass',findings:[],confidence:1})],
])test(`${label} remains inconclusive and cannot authorize correction`,async t=>{
  const out=await executeAccuracyPipeline(await fixture(t),fake({review}));
  assert.equal(out.status,'review_inconclusive');assert.equal(out.reviewStatus,'inconclusive');assert.equal(out.budgetEligible,false);assert.equal(out.reviewCorrections,0);assert.equal(out.usage.modelCalls,3);
});

test('uninspected pass does not become independent acceptance',async t=>{
  const out=await executeAccuracyPipeline(await fixture(t),fake({inspect:false}));assert.equal(out.reviewStatus,'inconclusive');assert.equal(out.budgetEligible,false);
});

test('review dollar overshoot preserves full spend and marks the result ineligible',async t=>{
  const out=await executeAccuracyPipeline(await fixture(t),fake({costs:[.01,.015]}));
  assert.equal(out.reviewStatus,'inconclusive');assert.equal(out.status,'budget_stopped');assert.equal(out.budgetEligible,false);assert.ok(Math.abs(out.usage.estimatedApiUsd-.025)<1e-12);
  assert.equal(out.reviews[0].capHit,true);assert.equal(out.reviews[0].stopReason,'review_cost');assert.equal(out.stages[1].error,'Review allowance exhausted: review_cost');
});

test('shared response budget prevents a paid review after terminal implementation allowance',async t=>{
  const d=fake(),out=await executeAccuracyPipeline({...await fixture(t),maxTurns:1},d);
  assert.equal(out.status,'budget_stopped');assert.equal(out.stages.length,1);assert.equal(d.options.length,1);assert.equal(out.budgetEligible,false);
});

test('unreceipted reviewer usage is unknown and all prior spend remains archived',async t=>{
  const out=await executeAccuracyPipeline(await fixture(t),fake({unreceipted:true}));
  assert.equal(out.status,'cost_unknown');assert.equal(out.reviewStatus,'inconclusive');assert.equal(out.usage.costUnknown,true);assert.equal(out.usage.estimatedApiUsd,.01);assert.equal(out.stages[1].providerRequests,1);assert.equal(out.budgetEligible,false);
});

test('review has at most 24 attempted tools and preserves the blocked-call count',async t=>{
  const d=fake({extraReview:async({tool})=>{for(let n=0;n<30;n++)await tool('read',{path:'payment.js'});}});
  const out=await executeAccuracyPipeline(await fixture(t),d);
  assert.equal(out.status,'budget_stopped');assert.equal(out.reviewStatus,'inconclusive');assert.equal(out.stages[1].usage.toolCalls,25);assert.equal(out.reviewCorrections,0);assert.equal(out.reviews[0].stopReason,'review_tools');
});

test('six review responses block a seventh request and archive the response cap',async t=>{
  const d=fake({extraReview:async({emit,assistant})=>{for(let n=0;n<5;n++){await emit('before_provider_request',{});assistant(.0001);}await emit('before_provider_request',{});}});
  const out=await executeAccuracyPipeline(await fixture(t),d);
  assert.equal(out.status,'budget_stopped');assert.equal(out.stages[1].replyCount,6);assert.equal(out.stages[1].providerRequests,6);assert.equal(out.reviews[0].stopReason,'review_responses');assert.equal(out.reviews[0].capHit,true);
});

test('review clock expiration blocks further calls and records its local time cap',async t=>{
  let tick=0;
  const d=fake({extraReview:async({tool})=>{tick=11;await tool('read',{path:'payment.js'});}});d.now=()=>tick;
  const out=await executeAccuracyPipeline({...await fixture(t),reviewTimeoutMs:10},d);
  assert.equal(out.status,'budget_stopped');assert.equal(out.reviews[0].stopReason,'review_time');assert.equal(out.reviews[0].capHit,true);assert.equal(out.budgetEligible,false);
});

test('last tool-bearing review response records the cap that prevents continuation',async t=>{
  const d=fake({extraReview:async({emit,assistant,tool})=>{for(let n=0;n<5;n++){await emit('before_provider_request',{});assistant(.0001,[{type:'toolCall',name:'codemode'}]);}await tool('read',{path:'payment.js'});}});
  const out=await executeAccuracyPipeline(await fixture(t),d);
  assert.equal(out.status,'budget_stopped');assert.equal(out.stages[1].replyCount,6);assert.equal(out.reviews[0].stopReason,'review_responses');assert.equal(out.reviews[0].capHit,true);
});

test('global dollar overshoot and missing implementation receipts never start review',async t=>{
  const expensive=await executeAccuracyPipeline({...await fixture(t),maxCostUsd:.005},fake({costs:[.01]}));
  assert.equal(expensive.reviewStatus,'not_run');assert.equal(expensive.status,'budget_stopped');assert.equal(expensive.stages.length,1);assert.equal(expensive.usage.estimatedApiUsd,.01);
  const unknown=await executeAccuracyPipeline(await fixture(t),fake({costs:[null]}));
  assert.equal(unknown.reviewStatus,'not_run');assert.equal(unknown.status,'cost_unknown');assert.equal(unknown.usage.costUnknown,true);assert.equal(unknown.budgetEligible,false);
});

test('fresh evidence mismatch is archived and does not trigger a correction',async t=>{
  const d=fake({review:JSON.stringify({verdict:'revise',findings:[finding]}),extraReview:async({opt})=>writeFile(join(opt.cwd,'payment.js'),original)});
  const out=await executeAccuracyPipeline(await fixture(t),d);
  assert.equal(out.reviewStatus,'inconclusive');assert.equal(out.reviewCorrections,0);assert.match(out.reviews[0].errors.join(' '),/absent from current source/);
});

test('disabled path preserves original defaults, options, receipts and result behavior',async t=>{
  const r=await fixture(t),a=fake({costs:[.01]}),b=fake({costs:[.01]});
  const disabled=await executeAccuracyPipeline({...r,accuracy:false},a);
  const baseline=await executePipeline({...r,runDir:join(r.workspace,'..','baseline')},b);
  for(const key of ['version','model','effort','status','usage','features','budgetEligible','verificationStatus'])assert.deepEqual(disabled[key],baseline[key]);
  assert.equal(disabled.reviewStatus,undefined);assert.equal(a.options.length,1);assert.equal(a.options[0].effort,'high');assert.equal(a.options[0].systemPrompt,b.options[0].systemPrompt);
});

test('actual readonly tools expose native ranged reads, AST and bounded actual diffs, and reject escapes',async t=>{
  const r=await fixture(t);await writeFile(join(r.workspace,'payment.js'),broken);
  const surface=await createReviewTools({workspace:r.workspace}),call=(name,args)=>surface.tools.find(x=>x.name===name).execute('actual-offline',args);
  assert.ok(surface.tools.every(x=>!['bash','write','edit'].includes(x.name)));
  const read=await call('read',{path:'payment.js',offset:1,limit:1});assert.match(read.content[0].text,/Math.floor/);
  const symbols=await call('symbols',{path:'payment.js',query:'cents'});assert.equal(symbols.structuredContent.matches[0].name,'cents');
  const patch=await call('changes',{mode:'diff',path:'payment.js'});assert.match(patch.structuredContent.text,/-export.*Math.round/);assert.match(patch.structuredContent.text,/\+export.*Math.floor/);
  const before=await readFile(join(r.workspace,'payment.js'),'utf8');
  await assert.rejects(call('read',{path:'../outside.txt'}),/escapes|outside/);await assert.rejects(call('symbols',{query:'cents'}),/explicit/);
  assert.equal(await readFile(join(r.workspace,'payment.js'),'utf8'),before);
  const valid=await validateReview(JSON.stringify({verdict:'revise',findings:[finding]}),{workspace:r.workspace,inspection:surface.inspection});assert.equal(valid.valid,true);
  const unrelated={...surface.inspection,sourceReads:[{path:'other.js',text:finding.evidence}]};
  const invalid=await validateReview(JSON.stringify({verdict:'revise',findings:[finding]}),{workspace:r.workspace,inspection:unrelated});assert.equal(invalid.valid,false);
});

test('unchanged-file diff cannot satisfy actual patch inspection',async t=>{
  const r=await fixture(t),surface=await createReviewTools({workspace:r.workspace});
  await surface.tools.find(x=>x.name==='changes').execute('empty',{mode:'diff',path:'payment.js'});
  assert.deepEqual(surface.inspection.patchReads,[]);
});

test('review baseline predates worker commits and still exposes the implementation patch',async t=>{
  const r=await fixture(t),d=fake(),factory=d.createSession;
  d.createSession=async(...args)=>{const control=await factory(...args),run=control.run;control.run=async text=>{const response=await run(text);if(!args[0].allowedTools?.includes('changes')){await exec('git',['add','--','payment.js'],{cwd:r.workspace});await exec('git',['-c','user.name=Offline Test','-c','user.email=offline@example.invalid','commit','--quiet','-m','worker change'],{cwd:r.workspace});}return response;};return control;};
  const out=await executeAccuracyPipeline(r,d);assert.equal(out.reviewStatus,'pass');assert.deepEqual(out.reviews[0].inspection.patchReads,['payment.js']);
});

test('real offline Pi reviewer keeps codemode and only the readonly tools with no automatic repo instructions',async t=>{
  const r=await fixture(t);await writeFile(join(r.workspace,'AGENTS.md'),'UNTRUSTED_AUTOMATIC_REVIEW_INSTRUCTION');
  const {tools}=await createReviewTools({workspace:r.workspace});
  const home=join(r.workspace,'..','offline-review-state');
  const runtime=await ModelRuntime.create({authPath:join(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
  const session=await createPipelineSession({cwd:r.workspace,home,model:'gpt-6-luna',effort:'medium',timeout:10,maxCost:.01,maxCalls:24,maxTurns:6,tools,allowedTools:tools.map(x=>x.name),noContextFiles:true,systemPrompt:REVIEW_PROMPT},runtime);
  try {
    assert.deepEqual(session.session.getActiveToolNames().sort(),[...tools.map(x=>x.name),'codemode'].sort());
    assert.doesNotMatch(session.session.systemPrompt,/UNTRUSTED_AUTOMATIC_REVIEW_INSTRUCTION/);assert.equal(session.totals.modelCalls,0);
    let definition;
    createCodemodeExtension({models:false,mode:'only'})({registerTool:tool=>{definition=tool;},getAllTools:()=>[],appendEntry:()=>{}});
    const ctx={tools,sessionManager:{getBranch:()=>[]},async executeTool(name,args,{signal}){const tool=tools.find(x=>x.name===name);assert.ok(tool,'Only readonly tools are callable');return {toolCall:{id:'nested'},result:await tool.execute('nested',args,signal),isError:false};}};
    const result=await definition.execute('offline-script',{code:'if("bash" in tools||"edit" in tools||"write" in tools)throw Error("Writable capability exposed"); const source=await tools.read({path:"payment.js"}); text(source);'},undefined,undefined,ctx);
    assert.equal(result.isError,undefined,JSON.stringify(result));assert.match(result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'),/Math.round/);
  }finally{await session.dispose();}
});
