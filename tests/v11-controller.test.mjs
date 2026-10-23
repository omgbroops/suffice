import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {executeV11} from '../src/v11/controller.mjs';
import {runPublicCheck} from '../src/v9/checks.mjs';

// Fresh development fixtures test controller behavior, not benchmark accuracy.
const PROMPT='Implement normalizeLabel(value). Lowercase letters, trim surrounding whitespace, and preserve punctuation.';
const GOOD="export const normalizeLabel=value=>value.trim().toLowerCase();\n";
const UNTRIMMED="export const normalizeLabel=value=>value.toLowerCase();\n";
const REGRESSION="export const normalizeLabel=value=>value.trim().toLowerCase().replaceAll('!','');\n";
const QUOTE='trim surrounding whitespace';
const PUBLIC="import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizeLabel} from './impl.mjs';test('letter case',()=>assert.equal(normalizeLabel('READY'),'ready'));test('punctuation',()=>assert.equal(normalizeLabel('HELLO!'),'hello!'));\n";
const cite=(source='task',quote=QUOTE)=>[{source,quote}];
function generated({content,expected='ready',citations=cite()}={}){
  const path='.suffice-v10-checks/labels.test.mjs';
  return {path,content:content??`import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizeLabel} from '../impl.mjs';test('surrounding whitespace',()=>assert.equal(normalizeLabel(' READY '),'${expected}'));\n`,command:[process.execPath,'--test',path],citations};
}
const decision=(kind='implementation_bug',extra={})=>({decision:kind,citations:cite(),reason:'The public contract determines this behavior.',correction:null,question:null,...extra});
const ambiguous=()=>decision('ambiguous',{question:'Should surrounding whitespace be removed?',reason:'The public interface does not define whitespace handling.'});
async function fixture(t,{source=UNTRIMMED,prompt=PROMPT,files={}}={}){
  const root=await realpath(await mkdtemp(join(tmpdir(),'suffice-v11-controller-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const workspace=join(root,'repo');await mkdir(workspace);execFileSync('git',['init','--quiet'],{cwd:workspace});
  for(const [path,text]of Object.entries({'impl.mjs':source,'public.test.mjs':PUBLIC,...files})){
    const target=join(workspace,path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,text);
  }
  return {workspace,prompt,runDir:join(root,'receipts'),maxCostUsd:1,timeoutMs:30_000,
    checks:[{id:'public-labels',command:[process.execPath,'--test','public.test.mjs'],testsRequired:true}]};
}
function adapter({initial=UNTRIMMED,repair=GOOD,takeover=GOOD,writer=generated(),arbiter=decision(),recovery=arbiter,reply,onCall}={}){
  const calls=[];
  return {calls,callModel:async c=>{
    calls.push(c);
    const source=c.role==='implement'?initial:c.role==='repair'?repair:c.role==='takeover'?takeover:null;
    if(source!==null)await writeFile(join(c.workspace,'impl.mjs'),source);
    await onCall?.(c,calls);
    let body=c.role.startsWith('test-writer')?writer:c.role==='arbiter'?arbiter:c.role==='verification-recovery'?recovery:'Changes ready; public checks are authoritative.';
    if(typeof body==='function')body=await body(c,calls);
    const result={status:'completed',text:typeof body==='string'?body:JSON.stringify(body),costUsd:.01,costKnown:true,toolCalls:0,
      usage:{inputTokens:11,cachedInputTokens:0,outputTokens:7}};
    return {...result,...await reply?.(c,calls,result)};
  }};
}
const roles=a=>a.calls.map(c=>c.role);

for(const malformed of ['JSON','citation'])test(`a malformed ${malformed} response gets one blind retry and executes the recovered suite`,async t=>{
  const r=await fixture(t),a=adapter({initial:GOOD,writer:c=>c.role==='test-writer'?(malformed==='JSON'?'{ unfinished':generated({citations:cite('task','an invented requirement')})):generated()});
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'completed',JSON.stringify(out.notes));assert.equal(out.verificationStatus,'passed');
  assert.deepEqual(roles(a),['implement','test-writer','test-writer-retry']);assert.equal(out.writerRetries,1);
  assert.match(a.calls[2].prompt,/Previous response was invalid/);assert.equal(out.repairs,0);assert.equal(out.takeovers,0);
  assert.ok(out.checks.some(c=>c.outcomes.some(o=>o.kind==='generated'&&o.status==='passed'&&o.tests===1)));
  assert.equal(out.costUsd,.03);assert.equal(Object.hasOwn(out,'accepted'),false);
});

test('repeated invalid writer output stops at two writer calls and remains unverified',async t=>{
  const r=await fixture(t),a=adapter({initial:GOOD,writer:generated({citations:cite('impl.mjs','worker output is not a contract')})});
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'unverified');assert.equal(out.writerRetries,1);assert.equal(out.repairs,0);assert.equal(out.takeovers,0);
  assert.deepEqual(roles(a),['implement','test-writer','test-writer-retry']);
  assert.equal(out.notes.filter(n=>n.kind==='invalid_generated_test').length,2);
});

test('generated file byte limit rejects oversized Unicode despite a smaller character count',async t=>{
  const r=await fixture(t),oversized=generated({content:'//'+'é'.repeat(8100)+'\n'+generated().content});
  assert.ok(oversized.content.length<16_000);assert.ok(Buffer.byteLength(oversized.content)>16_000);
  const a=adapter({initial:GOOD,writer:c=>c.role==='test-writer'?oversized:generated()});
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'completed');assert.equal(out.writerRetries,1);assert.equal(out.notes.filter(n=>n.kind==='invalid_generated_test').length,1);
  assert.deepEqual(roles(a),['implement','test-writer','test-writer-retry']);
});

test('blind writer and arbiter receive original README and adjacent helper context',async t=>{
  const original="import {LabelPolicy} from './LabelPolicy.mjs';\nexport const normalizeLabel=value=>LabelPolicy(value);\n";
  const contract='Surrounding whitespace must be removed before lowercase conversion.';
  const helper="// Public helper takes one string and preserves punctuation.\nexport const LabelPolicy=value=>value.toLowerCase();\n";
  const r=await fixture(t,{source:original,files:{'README.md':contract,'LabelPolicy.mjs':helper}});
  const worker="// CANDIDATE_ONLY_MARKER\n"+UNTRIMMED;
  const a=adapter({initial:worker,writer:generated({citations:cite('README.md',contract)}),arbiter:decision('implementation_bug',{citations:cite('README.md',contract)})});
  const out=await executeV11({...r,contextPaths:['impl.mjs']},{callModel:a.callModel});
  assert.equal(out.status,'completed');assert.equal(out.repairs,1);
  const writer=a.calls.find(c=>c.role==='test-writer'),arbiter=a.calls.find(c=>c.role==='arbiter');
  for(const call of [writer,arbiter]){assert.equal(call.noTools,true);assert.notEqual(call.workspace,r.workspace);assert.ok(call.prompt.includes(contract));assert.ok(call.prompt.includes('Public helper takes one string'));}
  assert.ok(!writer.prompt.includes('CANDIDATE_ONLY_MARKER'));
  const payload=JSON.parse(arbiter.prompt.slice(arbiter.prompt.indexOf('\n')+1));
  assert.equal(payload.publicContext.interfaces.find(f=>f.path==='impl.mjs').text,original);
  assert.ok(payload.changed.some(f=>f.content.includes('CANDIDATE_ONLY_MARKER')));
  assert.ok(!payload.publicContext.interfaces.some(f=>f.text.includes('CANDIDATE_ONLY_MARKER')));
});

test('an invalid generated test is corrected once, rerun, and leaves valid implementation unchanged',async t=>{
  const r=await fixture(t),valid=generated(),invalid=valid.content.replace("'ready'));","'ready')));");
  const a=adapter({initial:GOOD,writer:generated({content:invalid}),arbiter:decision('test_bug',{correction:{old:"'ready')));",new:"'ready'));"}})});
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'completed',JSON.stringify(out.arbitrations));assert.equal(out.repairs,0);assert.equal(out.takeovers,0);
  assert.deepEqual(roles(a),['implement','test-writer','arbiter']);assert.equal(out.arbitrations[0].applied,true);
  assert.equal(await readFile(join(r.workspace,'impl.mjs'),'utf8'),GOOD);
  assert.ok(out.checks.some(c=>c.label==='corrected-suite'&&c.outcomes.some(o=>o.kind==='generated'&&o.observedStatus==='passed')));
});

test('a grounded executed implementation failure activates one worker repair',async t=>{
  const r=await fixture(t),a=adapter();const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'completed');assert.equal(out.repairs,1);assert.equal(out.takeovers,0);assert.equal(out.verificationRecoveries,0);
  assert.deepEqual(roles(a),['implement','test-writer','arbiter','repair']);assert.equal(await readFile(join(r.workspace,'impl.mjs'),'utf8'),GOOD);
});

test('public regressions dominate a generated pass and restore the earlier implementation',async t=>{
  const r=await fixture(t),a=adapter({repair:REGRESSION,takeover:REGRESSION});
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'verification_failed');assert.equal(out.selectedCheckpoint,'initial');assert.equal(out.repairs,1);assert.equal(out.takeovers,1);
  assert.equal(await readFile(join(r.workspace,'impl.mjs'),'utf8'),UNTRIMMED);
  assert.ok(out.checks.some(c=>c.candidate==='repair-1'&&c.outcomes.some(o=>o.kind==='public'&&o.status==='failed')&&c.outcomes.some(o=>o.kind==='generated'&&o.status==='passed')));
});

test('a genuinely unspecified convention stays unverified and asks for clarification without code repair',async t=>{
  const r=await fixture(t,{prompt:'Implement normalizeLabel(value). Lowercase letters and preserve punctuation.'});
  const a=adapter({writer:generated({citations:cite('task','Lowercase letters')}),arbiter:ambiguous(),recovery:ambiguous()});
  // The dispute cites the documented behavior, rather than inventing a missing whitespace requirement.
  a.callModel=((call)=>async c=>{const v=await call(c);if(['arbiter','verification-recovery'].includes(c.role)){const d=JSON.parse(v.text);d.citations=cite('task','Lowercase letters');v.text=JSON.stringify(d);}return v;})(a.callModel);
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'unverified');assert.equal(out.repairs,0);assert.equal(out.takeovers,0);assert.equal(out.verificationRecoveries,1);
  assert.equal(out.clarification,'Should surrounding whitespace be removed?');assert.deepEqual(roles(a),['implement','test-writer','arbiter','verification-recovery']);
});

test('a later public repair passing a disputed test cannot silently settle an ambiguous contract',async t=>{
  const r=await fixture(t,{prompt:'Implement normalizeLabel(value). Lowercase letters and preserve punctuation.'});
  const a=adapter({initial:"export const normalizeLabel=value=>value.toUpperCase();\n",writer:generated({citations:cite('task','Lowercase letters')}),
    arbiter:ambiguous(),recovery:ambiguous(),reply:c=>['arbiter','verification-recovery'].includes(c.role)?{text:JSON.stringify(ambiguousWithValidCitation())}:undefined});
  function ambiguousWithValidCitation(){return {...ambiguous(),citations:cite('task','Lowercase letters')};}
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.repairs,1,'A real public failure justifies the repair');assert.equal(out.takeovers,0);
  assert.equal(out.status,'unverified');assert.equal(out.verificationStatus,'unverified');assert.equal(out.clarification,'Should surrounding whitespace be removed?');
  assert.equal(out.selectedCheckpoint,'repair-1');
  assert.ok(out.checks.some(c=>c.candidate==='repair-1'&&c.outcomes.some(o=>o.kind==='generated'&&o.observedStatus==='passed'&&o.status==='unverified')));
  const repairPrompt=a.calls.find(c=>c.role==='repair').prompt;
  const failures=JSON.parse(repairPrompt.split('Confirmed failures:\n')[1].split('\nConfirmed implementation reviews')[0]);
  assert.deepEqual(failures.map(f=>f.id),['public-labels']);
  assert.ok(!repairPrompt.includes('Should surrounding whitespace be removed?'));
  assert.ok(!repairPrompt.includes('"id":"independent"'));
});

test('bounded recovery can establish an executed failure after the first review was ambiguous',async t=>{
  const r=await fixture(t),a=adapter({arbiter:ambiguous(),recovery:decision()});
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'completed');assert.equal(out.verificationRecoveries,1);assert.equal(out.repairs,1);assert.equal(out.takeovers,0);assert.equal(out.clarification,null);
  assert.deepEqual(roles(a),['implement','test-writer','arbiter','verification-recovery','repair']);
});

test('recovery cannot confirm implementation failure without actual failing tests',async t=>{
  for(const observed of [
    {status:'failed',exitCode:1,tests:0,output:'No tests ran'},
    {status:'passed',exitCode:0,tests:0,output:'No tests ran'},
    {status:'passed',exitCode:1,tests:1,output:'Runner exit contradicts pass'},
    {status:'unavailable',exitCode:null,tests:null,output:'Runner missing'},
    {status:'invented',exitCode:1,tests:1,output:'Unsupported status'},
  ])await t.test(`${observed.status}/${observed.exitCode}/${observed.tests}`,async sub=>{
    const r=await fixture(sub),a=adapter({initial:GOOD});
    const out=await executeV11(r,{callModel:a.callModel,runCheck:c=>c.check.kind==='generated'?Promise.resolve(observed):runPublicCheck(c)});
    assert.equal(out.status,'unverified');assert.equal(out.repairs,0);assert.equal(out.takeovers,0);
    assert.deepEqual(roles(a),['implement','test-writer','arbiter','verification-recovery']);
    assert.ok(out.arbitrations.every(a=>a.decision==='unresolved'));
  });
});

test('generated coverage lost after a correction cannot establish a new implementation failure',async t=>{
  const r=await fixture(t),a=adapter({initial:GOOD,arbiter:decision('test_bug',{correction:{old:"'ready'));",new:"'ready!'));"}}),recovery:decision()});
  let generatedCalls=0;
  const out=await executeV11(r,{callModel:a.callModel,runCheck:c=>c.check.kind==='generated'?Promise.resolve({status:'failed',exitCode:1,tests:++generatedCalls<=2?2:1,output:'A synthetic runner reports fewer executed tests after correction'}):runPublicCheck(c)});
  assert.equal(out.status,'unverified');assert.equal(out.repairs,0);assert.equal(out.takeovers,0);
  assert.ok(out.arbitrations.some(a=>a.error==='No executed failing test with retained coverage supports implementation repair'));
});

test('a failed public suite with zero tests still triggers repair after a larger baseline',async t=>{
  const r=await fixture(t),a=adapter({initial:UNTRIMMED});let publicCalls=0;
  const out=await executeV11({...r,generatedTests:false},{callModel:a.callModel,runCheck:async()=>{
    publicCalls++;if(publicCalls===1)return {status:'passed',exitCode:0,tests:3,output:'baseline tests 3'};
    const source=await readFile(join(r.workspace,'impl.mjs'),'utf8');
    return source===GOOD?{status:'passed',exitCode:0,tests:3,output:'repaired tests 3'}:{status:'failed',exitCode:1,tests:0,output:'Import crashed before test execution'};
  }});
  assert.equal(out.status,'completed');assert.equal(out.repairs,1);assert.deepEqual(roles(a),['implement','repair']);
  assert.ok(out.checks.some(c=>c.outcomes.some(o=>o.kind==='public'&&o.tests===0&&o.status==='failed'&&o.coverageInsufficient)));
});

for(const stop of ['unknown cost','overshoot','deadline'])test(`${stop} after arbitration prevents the planned recovery call`,async t=>{
  const r=await fixture(t);let clock=0;
  const a=adapter({arbiter:ambiguous(),reply:c=>{
    if(c.role!=='arbiter')return;
    if(stop==='unknown cost')return {costKnown:false,costUsd:null,knownCostFloorUsd:.004};
    if(stop==='overshoot')return {costUsd:2};
    clock=31_000;
  }});
  const out=await executeV11(r,{callModel:a.callModel,now:()=>clock});
  assert.equal(out.status,stop==='unknown cost'?'cost_unknown':'budget_stopped');assert.equal(out.budgetEligible,false);
  assert.deepEqual(roles(a),['implement','test-writer','arbiter']);assert.equal(out.verificationRecoveries,0);
  if(stop==='unknown cost'){assert.equal(out.costUsd,null);assert.equal(out.knownCostFloorUsd,.024);}
  else if(stop==='overshoot')assert.equal(out.costUsd,2.02);
  assert.equal(await readFile(join(r.workspace,'impl.mjs'),'utf8'),UNTRIMMED);
});

test('a denied retry is not counted as a paid writer retry',async t=>{
  const r=await fixture(t),a=adapter({initial:GOOD,writer:'not JSON',reply:c=>c.role==='test-writer'?{costUsd:1}:undefined});
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'budget_stopped');assert.deepEqual(roles(a),['implement','test-writer']);assert.equal(out.writerRetries,0);
});

test('hidden evaluator inputs and dependencies are rejected before inference',async t=>{
  const r=await fixture(t),a=adapter();
  for(const extra of [{hiddenTests:'/private/tests'},{verify:()=>true},{expectedVerdict:'pass'}])await assert.rejects(executeV11({...r,...extra},{callModel:a.callModel}),/Unknown v11 request field/);
  await assert.rejects(executeV11(r,{callModel:a.callModel,verify:()=>true}),/hidden grading belongs after execution/);
  assert.equal(a.calls.length,0);
});

test('original protected tests are restored even when the first model response has unknown cost',async t=>{
  const r=await fixture(t),a=adapter({onCall:async c=>{await writeFile(join(c.workspace,'public.test.mjs'),"console.log('# tests 100');\n");},reply:()=>({costKnown:false,costUsd:null})});
  const out=await executeV11(r,{callModel:a.callModel});
  assert.equal(out.status,'cost_unknown');assert.equal(a.calls.length,1);assert.equal(await readFile(join(r.workspace,'public.test.mjs'),'utf8'),PUBLIC);
  assert.ok(out.policyViolations.some(n=>n.label==='finalization'&&n.paths.includes('public.test.mjs')));
  assert.equal(out.policyEligible,false);
});
