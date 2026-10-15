// Post-primary environment sensitivity control; no model/actor continuation.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {executeIsolated,ROOT} from '../experiments/luna-safeguards-v1/execution.mjs';
const DIR=resolve(ROOT,'.suffice/luna-safeguards-gate-audit-v1'),rows=[];
for(const id of ['i01','i02']){
 const tfile=resolve(ROOT,'.suffice/field-campaign-v1/tasks',id,'task.json'),t=JSON.parse(await readFile(tfile,'utf8'));const folder=resolve(DIR,id),workspace=resolve(folder,'public');await mkdir(folder,{recursive:true});
 const patchFile=resolve(ROOT,'.suffice/luna-safeguards-v1/attempts',id+'-B/patch.json');const p=spawnSync('python3',['-I',resolve(ROOT,'experiments/luna-safeguards-v1/evaluator-data.py'),'grade',tfile,workspace,patchFile],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);
 let deps=await (await import('node:fs/promises')).realpath(t.dependencyDir);if(!deps.endsWith('/node_modules'))deps=await (await import('node:fs/promises')).realpath(resolve(deps,'node_modules'));
 for(const network of [true,false]){
  const r=await executeIsolated({workspace,receipts:resolve(folder,network?'network-on':'network-off'),command:t.nativeCommands[0],privateRoots:[resolve(ROOT,'research')],gitMetadata:[deps],network,timeoutMs:120000});let d;try{d=JSON.parse(r.stdout);}catch{d={parseError:true};}
  rows.push({task:id,network,exitCode:r.exitCode,latencyMs:r.latencyMs,tests:d.stats?.tests,failureNames:(d.failures??[]).map(f=>f.fullTitle).sort(),frozenExpectedFailures:t.controls.nativeFailureNames,sourcePatch:patchFile});
 }
}
const out={at:new Date().toISOString(),modelCalls:0,primaryResultsModified:false,samePhysicalPublicWorkspacePerTask:true,onlyChangedSetting:'network',rows};await mkdir(resolve(ROOT,'reports/luna-safeguards-v1'),{recursive:true});await writeFile(resolve(ROOT,'reports/luna-safeguards-v1/gate-environment-audit.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
