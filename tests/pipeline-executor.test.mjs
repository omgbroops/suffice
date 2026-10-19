import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {executePipeline,runPublicCheck} from '../src/pipeline/executor.mjs';
import {normalizeRequest} from '../src/pipeline/policy.mjs';

async function fixture(t){const root=await mkdtemp(join(tmpdir(),'suffice-pipeline-'));t.after(()=>rm(root,{recursive:true,force:true}));const workspace=join(root,'repo');await mkdir(workspace);return {experimental:true,workspace,runDir:join(root,'receipts'),prompt:'Repair the public contract.',checks:[{command:['node','check.mjs']}],maxCostUsd:1};}
function fake(costs,checks){const options=[],prompts=[];let call=0,check=0;return {options,prompts,
  createSession:async(opt,_runtime,callbacks)=>{options.push(opt);return {eventPath:null,abort(){},dispose:async()=>{},run:async text=>{prompts.push(text);const cost=costs[call++];callbacks.onAssistant({usage:{input:10,cacheRead:5,cacheWrite:0,output:3,cost:cost===null?undefined:{total:cost}},content:[{type:'text',text:'done'}],stopReason:'stop'});return 'Short advice or completed implementation';}};},
  runCheck:async({check:c})=>({command:c.command,exitCode:checks[check++]?0:1,passed:checks[check-1],output:checks[check-1]?'passed':'expected cancellation cleanup; failed'}),};}

test('advice and repairs share usage, preserve public failure feedback, and advisor has no tools',async t=>{
  const r=await fixture(t),d=fake([.01,.02,.03],[false,true]);
  const out=await executePipeline({...r,features:{repairs:true,advice:'on_failure'}},d);
  assert.equal(out.status,'completed');assert.equal(out.adviceCalls,1);assert.equal(out.repairs,1);assert.equal(out.escalations,0);
  assert.ok(Math.abs(out.usage.estimatedApiUsd-.06)<1e-10);assert.equal(out.usage.modelCalls,3);
  assert.deepEqual(d.options[1].allowedTools,[]);assert.equal(d.options[1].noTools,true);assert.equal(d.options[1].noContextFiles,true);
  assert.match(d.prompts[1],/expected cancellation cleanup/);assert.match(d.prompts[2],/Advisory hypotheses/);
  assert.equal(JSON.parse(await readFile(join(r.runDir,'worker.json'),'utf8')).budgetEligible,true);
});
test('takeover follows failed repair and all stages count even when final public checks fail',async t=>{
  const d=fake([.02,.03,.04],[false,false,false]);
  const out=await executePipeline({...await fixture(t),features:{repairs:true,solTakeover:true}},d);
  assert.equal(out.status,'verification_failed');assert.equal(out.escalations,1);assert.equal(out.stages[2].model,'gpt-6.1-sol');assert.equal(out.budgetEligible,false);
  assert.ok(Math.abs(out.usage.estimatedApiUsd-.09)<1e-10);
});
test('response overshoot is preserved and stops new paid stages',async t=>{
  const d=fake([.12],[false]);const out=await executePipeline({...await fixture(t),maxCostUsd:.1,features:{advice:'on_failure',solTakeover:true}},d);
  assert.equal(out.status,'budget_stopped');assert.equal(out.stages.length,1);assert.equal(out.usage.estimatedApiUsd,.12);assert.equal(out.budgetEligible,false);
});
test('unknown paid usage stops and never becomes a zero-cost success',async t=>{
  const d=fake([null],[true]);const out=await executePipeline({...await fixture(t),features:{advice:'on_failure'}},d);
  assert.equal(out.status,'cost_unknown');assert.equal(out.usage.costUnknown,true);assert.equal(out.budgetEligible,false);assert.equal(out.stages.length,1);
});
test('a provider request without a corresponding response keeps cost unknown',async t=>{
  const hooks=new Map();
  const d={createSession:async opt=>{for(const install of opt.extensions)install({on:(name,fn)=>hooks.set(name,fn)});return {dispose:async()=>{},run:async()=>{hooks.get('before_provider_request')();throw Error('Connection ended before usage receipt');}};}};
  const out=await executePipeline(await fixture(t),d);
  assert.equal(out.status,'cost_unknown');assert.equal(out.usage.costUnknown,true);assert.equal(out.stages[0].providerRequests,1);assert.equal(out.budgetEligible,false);
});
test('missing checks are reported unverified and never trigger advice',async t=>{
  const d=fake([.01],[]);const out=await executePipeline({...await fixture(t),checks:[],features:{advice:'on_failure',repairs:true}},d);
  assert.equal(out.verificationStatus,'not_configured');assert.equal(out.adviceCalls,0);assert.equal(out.repairs,0);
});
test('receipt path cannot expose runtime records inside actor workspace',async t=>{
  const r=await fixture(t);await assert.rejects(executePipeline({...r,runDir:join(r.workspace,'receipts')},fake([.01],[true])),/outside/);
});
test('configuration rejects mistyped features and invalid check protocols',()=>{
  const base={experimental:true,workspace:'/repo',runDir:'/out',prompt:'fix'};
  assert.throws(()=>normalizeRequest({...base,features:{oops:true}}),/Unknown feature/);
  assert.throws(()=>normalizeRequest({...base,checks:[{command:'npm test'}]}),/argv/);
  assert.throws(()=>normalizeRequest({...base,features:{repairs:'false'}}),/boolean/);
  assert.throws(()=>normalizeRequest({...base,maxTurns:1.1}),/maxTurns/);
  assert.throws(()=>normalizeRequest({...base,checks:[{command:['node'],timeoutMs:-1}]}),/timeoutMs/);
});
test('terminal completion at exact response allowance may run deterministic checks',async t=>{
  const d=fake([.01],[true]);const out=await executePipeline({...await fixture(t),maxTurns:1},d);
  assert.equal(out.status,'completed');assert.equal(out.budgetEligible,true);assert.equal(out.verification[0].passed,true);
});
test('repair refreshes source previews and retains explicit public contracts',async t=>{
  const r=await fixture(t);await writeFile(join(r.workspace,'index.js'),'export const answer=1;\n');
  const d=fake([.01,.02],[false,true]);let checks=0;
  d.runCheck=async({check})=>{checks++;if(checks===1)await writeFile(join(r.workspace,'index.js'),'export const answer=2;\n');return {command:check.command,passed:checks>1,exitCode:checks>1?0:1,output:'check'};};
  const out=await executePipeline({...r,contextPaths:['index.js'],contracts:['Keep cancellation idempotent.'],features:{preparedContext:true,repairs:true}},d);
  assert.equal(out.status,'completed');assert.match(d.prompts[1],/Keep cancellation idempotent/);assert.match(d.prompts[1],/answer=2/);
});
test('real public check detects actual nonzero exit code, without parsing output words',async t=>{
  const r=await fixture(t);const out=await runPublicCheck({workspace:r.workspace,check:{command:[process.execPath,'-e','console.log("passed");process.exit(3)'],expectedExitCode:0},timeoutMs:10000});
  assert.equal(out.exitCode,3);assert.equal(out.passed,false);
});
