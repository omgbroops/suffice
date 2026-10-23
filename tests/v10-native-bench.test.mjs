import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pairedSchedule,finishSource,summarizeComparison} from '../scripts/v10-native-bench.mjs';
import {captureTree,treeHash,hash} from '../src/v9/workspace.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {freezeEvaluators,gradeComparison} from '../scripts/v10-native-grade.mjs';
import {realTasks} from '../benchmarks/real/tasks.mjs';
import {efficiencyTasks} from '../benchmarks/efficiency/tasks.mjs';
import {workflowTasks} from '../benchmarks/workflow/tasks.mjs';

test('paired schedule is reproducible and gives each task one independent attempt per arm',()=>{
 const tasks=Array.from({length:15},(_,i)=>({id:'task-'+i})),a=pairedSchedule(tasks,17);
 assert.deepEqual(a,pairedSchedule(tasks,17));assert.notDeepEqual(a,pairedSchedule(tasks,18));assert.equal(a.length,30);
 for(const t of tasks){const rows=a.filter(x=>x.taskId===t.id);assert.deepEqual(rows.map(x=>x.strategy).sort(),['native','v10']);assert.equal(new Set(rows.map(x=>x.id)).size,2);}
});

test('finalization restores explicit immutable files after an interrupted actor while preserving production edits',async()=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'suffice-paired-test-'))),workspace=join(dir,'workspace');await mkdir(join(workspace,'src'),{recursive:true});
 await writeFile(join(workspace,'README.md'),'original instructions');await writeFile(join(workspace,'src/main.mjs'),'export const value=1;');
 await runProcess('git',['init','--quiet'],{cwd:workspace});const original=await captureTree(workspace,{includeIgnored:true});
 await writeFile(join(workspace,'README.md'),'actor changed immutable instructions');await writeFile(join(workspace,'src/main.mjs'),'export const value=2;');
 await writeFile(join(workspace,'jest.config.mjs'),'export default {testMatch:[]};');
 const result=await finishSource({workspace,original,immutablePaths:['README.md'],snapshot:join(dir,'snapshot')});
 assert.ok(result.violations.includes('README.md'));assert.ok(result.violations.includes('jest.config.mjs'));
 assert.equal(await readFile(join(workspace,'README.md'),'utf8'),'original instructions');assert.match(await readFile(join(workspace,'src/main.mjs'),'utf8'),/value=2/);
 assert.equal(treeHash(await captureTree(workspace,{includeIgnored:true})),result.sourceHash);assert.equal(treeHash(await captureTree(result.snapshot,{includeIgnored:true})),result.sourceHash);
});

test('comparison summaries retain unknown costs and distinguish source acceptance from valid completion',()=>{
 const make=(id,taskId,strategy,overrides={})=>({id,taskId,strategy,status:'completed',costKnown:true,costUsd:.1,knownCostFloorUsd:.1,latencyMs:1000,repairs:0,takeovers:0,policyValid:true,...overrides});
 const attempts=[make('a','one','v10'),make('b','one','native',{status:'timeout',timedOut:true,costKnown:false,costUsd:null,knownCostFloorUsd:.04,policyValid:false}),make('c','two','v10'),make('d','two','native')];
 const grades=[{id:'a',accepted:true},{id:'b',accepted:true},{id:'c',accepted:false},{id:'d',accepted:true}];
 const s=summarizeComparison({attempts},{grades}),native=s.arms.find(a=>a.strategy==='native');
 assert.equal(native.accepted,2);assert.equal(native.policyValidAccepted,1);assert.equal(native.costUsd,null);assert.equal(native.costPerAcceptedUsd,null);assert.ok(Math.abs(native.knownCostFloorUsd-.14)<1e-9);assert.equal(native.timeouts,1);
 assert.deepEqual(s.paired,{bothPass:1,v10Only:0,nativeOnly:1,bothFail:0,ungraded:0});
});

test('missing private grades remain ungraded rather than being counted as task failures',()=>{
 const attempts=['v10','native'].map(strategy=>({id:strategy,taskId:'task',strategy,status:'completed',costKnown:true,costUsd:0,latencyMs:1,policyValid:true,repairs:0,takeovers:0}));
 const s=summarizeComparison({attempts});assert.equal(s.paired.ungraded,1);assert.equal(s.paired.bothFail,0);assert.ok(s.arms.every(a=>a.graded===0&&a.costPerAcceptedUsd===null));
});

async function protocolFixture(){
 const dir=await realpath(await mkdtemp(join(tmpdir(),'suffice-grade-gate-')));
 const excluded=new Set(['prerelease-subset','build-metadata','shell-quote-15']);
 const tasks=[...realTasks.filter(t=>!excluded.has(t.id)),...efficiencyTasks,...workflowTasks].map(({id})=>({id}));
 const plan={tasks,fingerprint:'frozen-plan'};const bytes=JSON.stringify(plan);
 await writeFile(join(dir,'plan.json'),bytes);return {dir,plan,planSha256:hash(bytes)};
}
test('evaluators cannot be frozen or replaced once execution starts',async()=>{
 const {dir}=await protocolFixture();await writeFile(join(dir,'execution-started.json'),'{}');
 await assert.rejects(freezeEvaluators(dir),/forbidden after execution starts/);
});
test('grading rejects a replacement freeze before reading or executing any evaluator',async()=>{
 const {dir,planSha256}=await protocolFixture();
 await writeFile(join(dir,'grading-freeze.json'),JSON.stringify({planFingerprint:'frozen-plan',planSha256}));
 await writeFile(join(dir,'execution-started.json'),JSON.stringify({planFingerprint:'frozen-plan',gradingFreezeSha256:'original-digest'}));
 await writeFile(join(dir,'execution-complete.json'),JSON.stringify({closed:true,planFingerprint:'frozen-plan',gradingFreezeSha256:'original-digest'}));
 await assert.rejects(gradeComparison(dir),/bound before actor execution/);
});
