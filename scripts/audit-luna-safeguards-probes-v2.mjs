// Post-attempt, model-free checks of actor-authored tests. Never actor feedback.
import {readFile,writeFile,mkdir,copyFile,stat,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {executeIsolated,ROOT} from '../experiments/luna-safeguards-v1/execution.mjs';
const json=p=>readFile(p,'utf8').then(JSON.parse),sha=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>{try{await stat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const DIR=resolve(ROOT,'.suffice/luna-safeguards-probe-audit-v2'),OUT=resolve(ROOT,'reports/luna-safeguards-v1');
const tasks=JSON.parse(await readFile(resolve(ROOT,'experiments/luna-safeguards-v1/plan.json'),'utf8')).tasks;
const rows=[];
for(const id of tasks){
 const attempt=resolve(ROOT,'.suffice/luna-safeguards-v1/attempts',id+'-B');if(!await exists(resolve(attempt,'result.json')))continue;
 const receipt=resolve(DIR,id,'result.json');if(await exists(receipt)){rows.push(await json(receipt));continue;}
 const tfile=resolve(ROOT,'.suffice/field-campaign-v1/tasks',id,'task.json'),t=await json(tfile),submitted=await json(resolve(attempt,'patch.json'));
 const scripts=submitted.filter(e=>e.path.startsWith('.suffice-checks/')&&e.after!==null),reference=[];
 if(t.referenceFiles?.length){for(const x of t.referenceFiles)reference.push({path:x.target,after:(await readFile(x.source)).toString('base64')});}
 else{const p=resolve(ROOT,'.suffice/luna-baseline-v2/preflight',id,'reference-patch-completion/captured-production.json');if(await exists(p))reference.push(...await json(p));}
 const row={task:id,at:new Date().toISOString(),inferenceCalls:0,actorFeedback:false,scripts:scripts.map(e=>({path:e.path,sha256:sha(Buffer.from(e.after,'base64'))})),controls:{}};
 for(const [kind,patch]of [['baseline',[]],['reference',reference]]){
  if(kind==='reference'&&!patch.length){row.controls.reference={unavailable:true};continue;}
  const folder=resolve(DIR,id,kind),workspace=resolve(folder,'public');await mkdir(folder,{recursive:true});await writeFile(resolve(folder,'patch.json'),JSON.stringify(patch));
  const prep=spawnSync('python3',['-I',resolve(ROOT,'experiments/luna-safeguards-v1/evaluator-data.py'),'grade',tfile,workspace,resolve(folder,'patch.json')],{encoding:'utf8'});if(prep.status!==0)throw Error(prep.stderr);
  for(const e of scripts){const p=resolve(workspace,e.path);if(!p.startsWith(workspace+'/'))throw Error('Script path escape');await mkdir(dirname(p),{recursive:true});await writeFile(p,Buffer.from(e.after,'base64'));}
  let deps=await (await import('node:fs/promises')).realpath(t.dependencyDir);if(!deps.endsWith('/node_modules'))deps=await (await import('node:fs/promises')).realpath(resolve(deps,'node_modules'));
  const results={};for(const name of ['probe','preserve']){
   const p=resolve(workspace,'.suffice-checks',name+'.mjs');if(!await exists(p)){results[name]={missing:true};continue;}
   const r=await executeIsolated({workspace,receipts:resolve(folder,name),command:['node',...t.nativeCommands.some(c=>c.includes('--import=tsx/esm'))?['--import=tsx/esm']:[],'.suffice-checks/'+name+'.mjs'],privateRoots:[resolve(ROOT,'research')],gitMetadata:[deps],network:false,timeoutMs:30000});results[name]={exitCode:r.exitCode,outputLimited:r.outputLimited,latencyMs:r.latencyMs,stdout:r.stdout.slice(-3000),stderr:r.stderr.slice(-3000)};
  }row.controls[kind]=results;
 }
 row.referenceProbeFails=row.controls.reference?.probe?.exitCode!==undefined&&row.controls.reference.probe.exitCode!==0;
 row.referencePreservationFails=row.controls.reference?.preserve?.exitCode!==undefined&&row.controls.reference.preserve.exitCode!==0;
 row.interpretation='A failure on a known reference requires contract review; it can be a faulty actor check, reference incompleteness or environment mismatch. It is not automatically a coding failure or proof of invalidity.';
 await mkdir(dirname(receipt),{recursive:true});await writeFile(receipt,JSON.stringify(row,null,2));rows.push(row);
}
await mkdir(OUT,{recursive:true});await writeFile(resolve(OUT,'probe-control-audit-v2.json'),JSON.stringify({at:new Date().toISOString(),rows,inferenceCalls:0,notActorFeedback:true},null,2));
console.log(JSON.stringify(rows.map(r=>({task:r.task,baselineProbe:r.controls.baseline?.probe?.exitCode,referenceProbe:r.controls.reference?.probe?.exitCode,baselinePreserve:r.controls.baseline?.preserve?.exitCode,referencePreserve:r.controls.reference?.preserve?.exitCode}))));
