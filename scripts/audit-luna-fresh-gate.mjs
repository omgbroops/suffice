// Model-free positive/negative controls for the single public regression gate.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
process.env.SUFFICE_FRESH_ARM='B';
const {executeIsolated,stageRuntime,ROOT}=await import('../experiments/luna-fresh-v1/execution.mjs');
await stageRuntime();const DIR=resolve(ROOT,'.suffice/luna-fresh-v1/gate-validation-v5');await mkdir(DIR,{recursive:true});
const data=(mode,file,out)=>{const r=spawnSync('python3',['-I',resolve(ROOT,'experiments/luna-fresh-v1/evaluator-data.py'),mode,file,out],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout);};
const source=`
 import {createPublicGate} from '/runtime/src/general/public-gate.mjs';
 import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
 let text='';for await(const b of process.stdin)text+=b;const config=JSON.parse(text),events=[];
 const controller=new AbortController();const gate=await createPublicGate({workspace:'/workspace',runDir:'/receipts',verification:config.verification,log:e=>events.push(e),signal:controller.signal});
 for(const p of config.patch??[]){const f=path.resolve('/workspace',p.path);assert(f.startsWith('/workspace/'));if(p.after===null)await fs.unlink(f);else{await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,Buffer.from(p.after,'base64'));}}
 if(config.mutation){await fs.appendFile(path.resolve('/workspace',config.mutation),'\\nTHIS IS INVALID JAVASCRIPT !!!\\n');for(const f of config.testPaths)await fs.writeFile(path.resolve('/workspace',f),'// Worker attempted to erase original tests.\\n');}
 const result=await gate.runGate('control');assert.equal(result.passed,config.expected);await fs.writeFile('/receipts/control-proof.json',JSON.stringify({expected:config.expected,passed:result.passed,inferenceCalls:0,originalsRestored:result.protectedOriginalFilesRestored,commands:result.commands}));console.log('Public gate control satisfied');
`;
const prior=JSON.parse(await readFile(resolve(ROOT,'.suffice/luna-fresh-v1/gate-validation-v4/progress.json'),'utf8'));
const rows=prior.filter(r=>r.exitCode===0).map(r=>({...r,priorReceiptRoot:r.priorReceiptRoot??'.suffice/luna-fresh-v1/gate-validation-v4'}));
for(const id of ['f01','f02','f03','f04','f05','f06']){
 const file=resolve(ROOT,'.suffice/luna-fresh-v1/tasks',id,'task.json'),task=JSON.parse(await readFile(file,'utf8'));
 for(const label of ['base','reference',...(id==='f01'?['mutation']:[])]){
  if(rows.some(r=>r.id===id&&r.label===label&&r.exitCode===0))continue;
  const workspace=resolve(DIR,id,label,'workspace'),receipts=resolve(DIR,id,label,'receipts');
  const initial=data('actor',file,workspace);const patch=label==='reference'?JSON.parse(await readFile(task.referencePatchJson,'utf8')):[];
  const execution=await executeIsolated({workspace,receipts,command:['node','--input-type=module','-e',source],input:JSON.stringify({verification:{trackedPaths:Object.keys(initial.trackedHashes),publicCommands:task.nativeCommands,commandTimeoutMs:120000},patch,expected:label!=='mutation',mutation:label==='mutation'?'index.js':null,testPaths:['test.js']}),gitMetadata:[task.dependencyDir],network:true,timeoutMs:240000});
  rows.push({id,label,exitCode:execution.exitCode,latencyMs:execution.latencyMs});await writeFile(resolve(DIR,'progress.json'),JSON.stringify(rows,null,2));if(execution.exitCode!==0)throw Error(id+' '+label+' failed: '+execution.stderr.slice(-2000));
 }
}
// Native TS loader: verify .js imports resolve to .ts; tampering with the test cannot hide a regression.
for(const mutated of [false,true]){
 const workspace=resolve(DIR,'typescript',mutated?'mutation':'positive','workspace'),receipts=resolve(DIR,'typescript',mutated?'mutation':'positive','receipts');await mkdir(workspace,{recursive:true});
 const fs=await import('node:fs/promises');const deps=resolve(ROOT,'.suffice/field-campaign-v1/tasks/q01/base/node_modules');await fs.symlink(deps,resolve(workspace,'node_modules'),'dir');
 await writeFile(resolve(workspace,'package.json'),'"invalid"');await writeFile(resolve(workspace,'package.json'),JSON.stringify({type:'module'}));
 await writeFile(resolve(workspace,'source.ts'),'export const value: number = 42;\n');await writeFile(resolve(workspace,'original.test.ts'),"import {test} from 'node:test';import assert from 'node:assert/strict';import {value} from './source.js';test('public value',()=>assert.equal(value,42));\n");
 const run=await executeIsolated({workspace,receipts,command:['node','--input-type=module','-e',source],input:JSON.stringify({verification:{trackedPaths:['package.json','source.ts','original.test.ts'],publicCommands:[['node','--import=tsx/esm','--test','original.test.ts']]},expected:!mutated,mutation:mutated?'source.ts':null,testPaths:['original.test.ts']}),gitMetadata:[deps],network:true,timeoutMs:30000});
 rows.push({id:'typescript-loader',mutated,exitCode:run.exitCode});if(run.exitCode!==0)throw Error('TS compatibility control failed '+run.stderr);
}
await writeFile(resolve(DIR,'proof.json'),JSON.stringify({at:new Date().toISOString(),passed:rows.every(r=>r.exitCode===0),inferenceCalls:0,rows},null,2));console.log(JSON.stringify({controls:rows.length,passed:true}));
