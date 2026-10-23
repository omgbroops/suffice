import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {executeV9} from '../src/v9/controller.mjs';
import {runPublicCheck,testCount} from '../src/v9/checks.mjs';
const GOOD='export const add=(a,b)=>a+b;\n',BAD='export const add=(a,b)=>a-b;\n';
const PROMPT='Add two numbers. Export add(a,b) and preserve its public interface.';
const generated=(want=5)=>({path:'.suffice-v9-checks/add.test.mjs',content:`import {test} from 'node:test';import assert from 'node:assert/strict';import {add} from '../impl.mjs';test('add',()=>assert.equal(add(2,3),${want}));\n`,command:['node','--test','.suffice-v9-checks/add.test.mjs'],requirementQuote:'Add two numbers.'});
async function fixture(t){const root=await realpath(await mkdtemp(join(tmpdir(),'suffice-v9-test-')));t.after(()=>rm(root,{recursive:true,force:true}));const workspace=join(root,'repo');await mkdir(workspace);execFileSync('git',['init','--quiet'],{cwd:workspace});
  await writeFile(join(workspace,'impl.mjs'),BAD);await writeFile(join(workspace,'public.test.mjs'),"import {test} from 'node:test';import assert from 'node:assert/strict';import {add} from './impl.mjs';test('public add',()=>assert.equal(add(1,2),3));\n");
  return {workspace,prompt:PROMPT,runDir:join(root,'receipts'),maxCostUsd:1,timeoutMs:30_000,checks:[{id:'tests',command:['node','--test','public.test.mjs'],testsRequired:true}]};}
function adapter({initial=BAD,repair=GOOD,takeover=GOOD,writer=generated(),decision={decision:'implementation_bug',requirementQuote:'Add two numbers.',reason:'The result must be the sum.',correction:null},unknown=false,cost=.01}={}){
  const calls=[];return {calls,callModel:async c=>{calls.push(c);if(c.role==='implement')await writeFile(join(c.workspace,'impl.mjs'),initial);if(c.role==='repair')await writeFile(join(c.workspace,'impl.mjs'),repair);if(c.role==='takeover')await writeFile(join(c.workspace,'impl.mjs'),takeover);
    return {status:'completed',text:c.role==='test-writer'?JSON.stringify(writer):c.role==='arbiter'?JSON.stringify(decision):'Implemented; inspect check receipts.',costUsd:unknown?null:cost,costKnown:!unknown,toolCalls:0,usage:{inputTokens:10,cachedInputTokens:0,outputTokens:5}};}};}
test('v9 generates checks, arbitrates, and repairs without a grading dependency',async t=>{
  const r=await fixture(t),a=adapter();const out=await executeV9(r,{callModel:a.callModel});
  assert.equal(out.status,'completed',JSON.stringify(out.notes));assert.equal(out.verificationStatus,'passed');assert.equal(out.repairs,1);assert.equal(out.takeovers,0);
  assert.deepEqual(a.calls.map(c=>c.role),['implement','test-writer','arbiter','repair']);assert.equal(await readFile(join(r.workspace,'impl.mjs'),'utf8'),GOOD);
  assert.ok(a.calls.filter(c=>c.noTools).every(c=>c.workspace!==r.workspace));assert.equal(out.costUsd,.04);
  assert.equal(out.completionEvidence,'public_checks_passed');assert.equal(Object.hasOwn(out,'accepted'),false);
});
test('a justified assertion correction rechecks checkpoints instead of granting acceptance',async t=>{
  const r=await fixture(t),a=adapter({initial:GOOD,writer:generated(6),decision:{decision:'test_bug',requirementQuote:'Add two numbers.',reason:'2 plus 3 is 5.',correction:{old:'add(2,3),6',new:'add(2,3),5'}}});
  const out=await executeV9(r,{callModel:a.callModel});assert.equal(out.status,'completed');assert.equal(out.repairs,0);assert.equal(out.arbitrations[0].applied,true);
  assert.ok(out.checks.some(c=>c.label==='corrected-suite'));assert.equal(out.takeovers,0);
});
test('public regressions cannot be outvoted by generated tests; restore earlier source',async t=>{
  const r=await fixture(t),a=adapter({initial:GOOD,writer:generated(-1),repair:BAD,takeover:BAD});
  const out=await executeV9(r,{callModel:a.callModel});assert.equal(out.status,'verification_failed');assert.equal(out.selectedCheckpoint,'initial');
  assert.equal(await readFile(join(r.workspace,'impl.mjs'),'utf8'),GOOD);assert.equal(out.takeovers,1);
});
test('existing public test edits are restored and cannot make a broken implementation pass',async t=>{
  const r=await fixture(t),a=adapter(),original=await readFile(join(r.workspace,'public.test.mjs'),'utf8');const call=a.callModel;
  const out=await executeV9({...r,strategy:'luna'},{callModel:async c=>{const v=await call(c);await writeFile(join(c.workspace,'public.test.mjs'),"console.log('# tests 1');\n");return v;}});
  assert.equal(out.status,'verification_failed');assert.equal(await readFile(join(r.workspace,'public.test.mjs'),'utf8'),original);assert.ok(out.notes.some(n=>n.kind==='protected_checks_restored'));
});
test('unknown usage stops every further paid stage and remains unknown',async t=>{
  const r=await fixture(t),a=adapter({unknown:true});const out=await executeV9(r,{callModel:a.callModel});
  assert.equal(out.status,'cost_unknown');assert.equal(out.costUsd,null);assert.equal(out.budgetEligible,false);assert.equal(a.calls.length,1);
});
test('a response crossing the allowance is retained and prevents another call',async t=>{
  const r=await fixture(t),a=adapter({cost:.6});const out=await executeV9({...r,maxCostUsd:.5},{callModel:a.callModel});assert.equal(out.status,'budget_stopped');assert.equal(out.costUsd,.6);assert.equal(a.calls.length,1);
});
test('empty checks stay unverified and do not activate a ladder takeover',async t=>{
  const r=await fixture(t),a=adapter();const out=await executeV9({...r,strategy:'ladder',checks:[]},{callModel:a.callModel});assert.equal(out.status,'unverified');assert.equal(out.takeovers,0);assert.equal(a.calls.length,1);
});
test('hidden grader inputs/dependencies are rejected before inference',async t=>{
  const r=await fixture(t),a=adapter();await assert.rejects(executeV9({...r,verify:()=>true},{callModel:a.callModel}),/Unknown v9 request/);
  await assert.rejects(executeV9(r,{callModel:a.callModel,verify:()=>true}),/hidden grading/);assert.equal(a.calls.length,0);
});
test('zero-test and missing-runner summaries cannot become successful verification',async t=>{
  const r=await fixture(t);const c={id:'zero',command:['node','-e',"console.log('# tests 0')"],testsRequired:true};
  assert.equal((await runPublicCheck({workspace:r.workspace,check:c,timeoutMs:10_000})).status,'unverified');
  assert.equal(testCount('BUILD SUCCESSFUL'),null);assert.equal(testCount('running 0 tests\ntest result: ok. 0 passed; 0 failed;'),0);
});
test('unsafe generated paths cannot be materialized',async t=>{
  const r=await fixture(t),a=adapter({initial:GOOD,writer:{...generated(),path:'../escape.mjs'}});const out=await executeV9(r,{callModel:a.callModel});
  assert.equal(out.verificationStatus,'unverified');assert.equal(out.takeovers,0);assert.ok(out.notes.some(n=>n.kind==='invalid_generated_test'));
});
test('ignored implementation artifacts belong to checkpoints and rollback with source',async t=>{
  const r=await fixture(t);await writeFile(join(r.workspace,'.gitignore'),'artifact.mjs\n');
  const a=adapter({initial:GOOD,writer:generated(-1),repair:BAD,takeover:BAD}),call=a.callModel;
  const out=await executeV9(r,{callModel:async c=>{const v=await call(c);if(!c.noTools)await writeFile(join(c.workspace,'artifact.mjs'),c.role==='implement'?'initial':'later');return v;}});
  assert.equal(out.selectedCheckpoint,'initial');assert.equal(await readFile(join(r.workspace,'artifact.mjs'),'utf8'),'initial');
});
test('package runner configuration cannot exclude an original failing test',async t=>{
  const r=await fixture(t);const original={scripts:{test:'node --test'},jest:{testPathIgnorePatterns:[]}};
  await writeFile(join(r.workspace,'package.json'),JSON.stringify(original));const a=adapter(),call=a.callModel;
  const out=await executeV9({...r,strategy:'luna'},{callModel:async c=>{const v=await call(c);await writeFile(join(c.workspace,'package.json'),JSON.stringify({...original,jest:{testPathIgnorePatterns:['public.test.mjs']}}));await writeFile(join(c.workspace,'jest.config.cjs'),'module.exports={testMatch:[]}');return v;}});
  assert.equal(out.status,'verification_failed');assert.deepEqual(JSON.parse(await readFile(join(r.workspace,'package.json'),'utf8')),original);
  await assert.rejects(readFile(join(r.workspace,'jest.config.cjs')),/ENOENT/);
});
test('ambiguous generated failure stays unverified without funding a takeover',async t=>{
  const r=await fixture(t),a=adapter({initial:GOOD,writer:generated(6),decision:{decision:'ambiguous',requirementQuote:'Add two numbers.',reason:'Insufficient evidence for this assertion.',correction:null}});
  const out=await executeV9(r,{callModel:a.callModel});assert.equal(out.status,'unverified');assert.equal(out.repairs,0);assert.equal(out.takeovers,0);
});
test('legitimate package exports survive check-configuration protection',async t=>{
  const r=await fixture(t),before={scripts:{test:'node --test'}};await writeFile(join(r.workspace,'package.json'),JSON.stringify(before));const a=adapter({initial:GOOD}),call=a.callModel;
  const out=await executeV9({...r,strategy:'luna'},{callModel:async c=>{const v=await call(c);await writeFile(join(c.workspace,'package.json'),JSON.stringify({...before,exports:'./impl.mjs'}));return v;}});
  assert.equal(out.status,'completed');assert.equal(JSON.parse(await readFile(join(r.workspace,'package.json'),'utf8')).exports,'./impl.mjs');
});
