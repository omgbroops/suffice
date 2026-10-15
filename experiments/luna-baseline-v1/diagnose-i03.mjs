// Separate post-hoc diagnostic. Never edits primary grades, sources, or actor receipts.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ROOT,executeIsolated} from './execution.mjs';
const DIR=resolve(ROOT,'.suffice/luna-baseline-v2'),out=resolve(DIR,'diagnostics/i03-no-arraylike'),m=JSON.parse(await readFile(resolve(DIR,'frozen/i03.json'),'utf8')),t=m.task;
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
for(const[p,h]of Object.entries(m.inputs))if(hash(await readFile(p))!==h)throw new Error('Frozen task changed');
const luna=JSON.parse(await readFile(resolve(DIR,'attempts/i03-suffice/patch.json'),'utf8'));
const reference=await Promise.all(t.referenceFiles.map(async x=>({path:x.target,after:(await readFile(x.source)).toString('base64')})));
const omitted="assert.deepEqual(await limit.map({0: 3, 1: 5, length: 2}, (value, index) => value + index), [3, 6]);";
const rows=[];
for(const[name,patch]of [['original',[]],['luna',luna],['reference',reference]]){
 const dir=resolve(out,name),workspace=resolve(dir,'workspace');await mkdir(dir,{recursive:true});
 const patchPath=resolve(dir,'patch.json');await writeFile(patchPath,JSON.stringify(patch,null,2)+'\n');
 const prepared=spawnSync('python3',['-I',resolve(import.meta.dirname,'evaluator-data.py'),'grade',m.taskFile,workspace,patchPath],{encoding:'utf8'});if(prepared.status!==0)throw new Error(prepared.stderr||prepared.stdout);
 const changes=[];
 for(const overlay of t.graderOverlay){const target=resolve(workspace,overlay.target);await mkdir(dirname(target),{recursive:true});const before=await readFile(overlay.source,'utf8');let after=before;
  if(before.includes(omitted)){if(before.split(omitted).length!==2)throw new Error('Assertion not unique');after=before.replace(omitted,'// Post-hoc diagnostic only: omitted disputed non-Iterable array-like assertion.');}
  await writeFile(target,after);changes.push({path:overlay.target,originalSha256:hash(before),diagnosticSha256:hash(after),onlyChange:before===after?'none':omitted});
 }
 if(changes.filter(x=>x.onlyChange!=='none').length!==1)throw new Error('Expected exactly one assertion omission');
 let dep=await (await import('node:fs/promises')).realpath(t.dependencyDir);if(!dep.endsWith('/node_modules'))dep=resolve(dep,'node_modules');
 const runs=[];for(let i=0;i<t.acceptanceCommands.length;i++)runs.push(await executeIsolated({workspace,receipts:resolve(dir,'acceptance-'+i),command:t.acceptanceCommands[i],privateRoots:[resolve(ROOT,'research')],gitMetadata:[dep],network:false,timeoutMs:120000}));
 rows.push({variant:name,changes,results:runs.map(x=>({exitCode:x.exitCode,latencyMs:x.latencyMs,outputLimited:x.outputLimited,stdout:x.stdout,stderr:x.stderr}))});
}
const result={at:new Date().toISOString(),postHoc:true,primaryGradesUnchanged:true,diagnostic:'Omit only disputed array-like assertion; reach later iterator-settlement checks',scriptSha256:hash(await readFile(new URL(import.meta.url))),rows};
await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
