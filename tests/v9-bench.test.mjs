import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,realpath,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {planBenchmark,runBenchmark,gradeBenchmark,schedule} from '../scripts/v9-bench.mjs';
import {captureTree,writeTree,treeHash} from '../src/v9/workspace.mjs';
import {summarize} from '../scripts/v9-report.mjs';
async function fixture(t){const root=await realpath(await mkdtemp(join(tmpdir(),'suffice-v9-bench-')));t.after(()=>rm(root,{recursive:true,force:true}));const source=join(root,'source');await mkdir(source);execFileSync('git',['init','--quiet'],{cwd:source});await writeFile(join(source,'impl.mjs'),'export const value=0;\n');
  const manifest=join(root,'manifest.json'),planDir=join(root,'plan');await writeFile(manifest,JSON.stringify({id:'fixture',label:'development fixture',seed:42,limits:{maxCostUsd:.1,overallCostUsd:1,timeoutMs:1000},tasks:[{id:'task',workspace:source,prompt:'Return one.',checks:[]}]}));return {root,source,manifest,planDir};}
test('schedule is reproducible and every task gets four interleaved arms',()=>{const tasks=[{id:'a'},{id:'b'}];const a=schedule(tasks,42,2);assert.deepEqual(a,schedule(tasks,42,2));assert.equal(a.length,16);assert.equal(new Set(a.slice(0,4).map(x=>x.strategy)).size,4);});
test('execution receives only public inputs and grading runs after all actors close',async t=>{
  const f=await fixture(t);await planBenchmark(f.manifest,f.planDir);const starts=[];
  const execute=async request=>{starts.push(await readFile(join(request.workspace,'impl.mjs'),'utf8'));assert.equal(Object.hasOwn(request,'verify'),false);assert.equal(Object.hasOwn(request,'grader'),false);
    await writeFile(join(request.workspace,'impl.mjs'),'export const value=1;\n');const tree=await captureTree(request.workspace),snapshot=join(request.runDir,'final-source');await writeTree(snapshot,tree);
    return {workspace:request.workspace,status:'completed',snapshot,sourceHash:treeHash(tree),costUsd:.01,costKnown:true,budgetEligible:true,latencyMs:1};};
  await assert.rejects(gradeBenchmark(f.planDir,join(f.root,'not-created-yet.json')),/ENOENT/);
  const run=await runBenchmark(f.planDir,{execute});assert.equal(run.attempts.length,4);assert.equal(new Set(starts).size,1);assert.equal(starts[0],'export const value=0;\n');
  const evaluator=join(f.root,'evaluator.json');await writeFile(evaluator,JSON.stringify({checks:{task:[process.execPath,'-e','process.exit(0)']}}));let calls=0;
  const grades=await gradeBenchmark(f.planDir,evaluator,{run:async()=>{calls++;return {exitCode:0,stdout:'',stderr:''};}});assert.equal(calls,4);assert.equal(grades.filter(g=>g.accepted).length,4);
  await assert.rejects(runBenchmark(f.planDir,{execute}),/EEXIST/);
});
test('changed frozen source is refused before any inference',async t=>{const f=await fixture(t);await planBenchmark(f.manifest,f.planDir);await writeFile(join(f.source,'impl.mjs'),'changed');let calls=0;await assert.rejects(runBenchmark(f.planDir,{execute:async()=>{calls++;}}),/Public source changed/);assert.equal(calls,0);});
test('unknown cost stops unscheduled paid work and is reported as a floor',async t=>{const f=await fixture(t);await planBenchmark(f.manifest,f.planDir);let calls=0;const out=await runBenchmark(f.planDir,{execute:async()=>{calls++;return {status:'timeout',costKnown:false,costUsd:null,knownCostFloorUsd:.02};}});assert.equal(calls,1);assert.equal(out.costKnown,false);assert.equal(out.knownCostFloorUsd,.02);assert.equal(out.attempts.filter(a=>a.status==='not_started').length,3);assert.equal(summarize(out).reduce((n,r)=>n+r.unknownCosts,0),1);});
test('grader configuration is rejected in the public manifest',async t=>{const f=await fixture(t);const m=JSON.parse(await readFile(f.manifest,'utf8'));m.grader='secret';await writeFile(f.manifest,JSON.stringify(m));await assert.rejects(planBenchmark(f.manifest,f.planDir),/grading fields/);});
test('schedule tampering is rejected before the evaluator file is opened',async t=>{
  const f=await fixture(t);await planBenchmark(f.manifest,f.planDir);const out=await runBenchmark(f.planDir,{execute:async()=>({status:'unverified',costKnown:true,costUsd:0})});
  out.attempts[0].taskId='other';await writeFile(join(f.planDir,'execution-complete.json'),JSON.stringify(out));
  await assert.rejects(gradeBenchmark(f.planDir,join(f.root,'nonexistent-evaluator.json')),/schedule identity/);
});
test('unknown total usage cannot yield an exact cost per acceptance',()=>{
  const rows=summarize({attempts:[{id:'x',strategy:'v9',status:'cost_unknown',costKnown:false,knownCostFloorUsd:.03}]},{grades:[{id:'x',accepted:true,status:'graded'}]});
  assert.equal(rows[3].knownCostFloorUsd,.03);assert.equal(rows[3].costPerAcceptedUsd,null);
});
test('setup failure before inference is a known zero-cost operational failure',async t=>{
  const f=await fixture(t),manifest=JSON.parse(await readFile(f.manifest,'utf8'));manifest.tasks[0].setup=[[process.execPath,'-e','process.exit(1)']];await writeFile(f.manifest,JSON.stringify(manifest));
  await planBenchmark(f.manifest,f.planDir);let calls=0;const out=await runBenchmark(f.planDir,{execute:async()=>{calls++;}});
  assert.equal(calls,0);assert.equal(out.costKnown,true);assert.equal(out.knownCostFloorUsd,0);assert.ok(out.attempts.every(a=>a.status==='operational_failure'));
});
