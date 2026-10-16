// Independent post-primary checks. No model calls and no actor feedback.
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {executeIsolated,ROOT} from '../../experiments/codex-sol-xhigh-v2/execution.mjs';
const json=p=>readFile(p,'utf8').then(JSON.parse),exists=async p=>{try{await stat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const DIR=resolve(ROOT,'.suffice/codex-sol-xhigh-posthoc-v2'),OUT=resolve(ROOT,'reports/codex-sol-xhigh-v2');
const probeRoot=resolve(ROOT,'research/field-campaign-v1/audits/historical-patch-review/probes');
const nextProbe=`import assert from 'node:assert/strict';import PQueue from './source/index.ts';let finish;const q=new PQueue({concurrency:1,autoStart:false});for(let i=0;i<3;i++)void q.add(()=>new Promise(r=>{finish=r}));let next=0;q.on('next',()=>next++);q.start();const beforeCompletion=next;q.clear();finish();await q.onIdle();console.log(JSON.stringify({beforeCompletion,expected:0}));assert.equal(beforeCompletion,0,'starting work must preserve the existing completion-event contract');`;
const emptyProbe=`import assert from 'node:assert/strict';import PQueue from './source/index.ts';let finish;const q=new PQueue({concurrency:1,autoStart:false});const job=q.add(()=>new Promise(r=>{finish=r}));let settled=false;const waiter=q.onSizeLessThan(1).then(()=>{settled=true});q.start();await new Promise(setImmediate);const beforeCompletion=settled;finish();await Promise.all([job,waiter]);console.log(JSON.stringify({beforeCompletion,expected:true}));assert.equal(beforeCompletion,true,'onSizeLessThan(1) must settle when the last waiting job starts, before it completes');`;
const specifications=[
 {id:'s01',arms:['suffice','codex'],probes:[{name:'reserved-window',source:await readFile(resolve(probeRoot,'posthoc-s01.mjs'),'utf8')}]},
 {id:'i04',arms:['suffice','codex'],probes:[{name:'reentrant-resume',source:await readFile(resolve(probeRoot,'posthoc-i04.mjs'),'utf8'),args:['resume']},{name:'reentrant-setter',source:await readFile(resolve(probeRoot,'posthoc-i04.mjs'),'utf8'),args:['setter']}]},
 {id:'q04',arms:['suffice','codex'],probes:[{name:'dormant-foreign-computed',source:await readFile(resolve(probeRoot,'posthoc-q04.mjs'),'utf8')}]},
 {id:'q02',arms:['suffice','codex'],probes:[{name:'next-before-completion',source:nextProbe,loader:true},{name:'last-waiter-before-completion',source:emptyProbe,loader:true}]}
];
const rows=[];
for(const s of specifications){const tfile=resolve(ROOT,'.suffice/field-campaign-v1/tasks',s.id,'task.json'),t=await json(tfile);let deps=await (await import('node:fs/promises')).realpath(t.dependencyDir);if(!deps.endsWith('/node_modules'))deps=await (await import('node:fs/promises')).realpath(resolve(deps,'node_modules'));
 const reference=[];if(t.referenceFiles?.length){for(const x of t.referenceFiles)reference.push({path:x.target,after:(await readFile(x.source)).toString('base64')});}else reference.push(...await json(resolve(ROOT,'.suffice/luna-baseline-v2/preflight',s.id,'reference-patch-completion/captured-production.json')));
 for(const arm of ['baseline','reference',...s.arms]){const folder=resolve(DIR,s.id,arm),receipt=resolve(folder,'result.json');if(await exists(receipt)){rows.push(await json(receipt));continue;}await mkdir(folder,{recursive:true});const patch=arm==='baseline'?[]:arm==='reference'?reference:await json(resolve(ROOT,'.suffice/codex-sol-xhigh-v2/attempts',s.id+'-'+arm,'patch.json'));await writeFile(resolve(folder,'patch.json'),JSON.stringify(patch));const workspace=resolve(folder,'public');const prep=spawnSync('python3',['-I',resolve(ROOT,'scripts/sonion-data-v2.py'),'grade',tfile,workspace,resolve(folder,'patch.json')],{encoding:'utf8'});if(prep.status!==0)throw Error(prep.stderr);
  const probes=[];for(const p of s.probes){const filename='posthoc-'+p.name+'.mjs';await writeFile(resolve(workspace,filename),p.source);const r=await executeIsolated({workspace,receipts:resolve(folder,p.name),command:['node',...p.loader?['--import=tsx/esm']:[],filename,...p.args??[]],privateRoots:[resolve(ROOT,'research')],gitMetadata:[deps],network:false,timeoutMs:s.id==='i04'?2500:10000});probes.push({name:p.name,exitCode:r.exitCode,outputLimited:r.outputLimited,latencyMs:r.latencyMs,stdout:r.stdout.slice(-6000),stderr:r.stderr.slice(-3000)});}
  const row={task:s.id,arm,inferenceCalls:0,actorFeedback:false,probes,at:new Date().toISOString()};await writeFile(receipt,JSON.stringify(row,null,2));rows.push(row);
 }
}
await mkdir(OUT,{recursive:true});await writeFile(resolve(OUT,'posthoc-regressions.json'),JSON.stringify({at:new Date().toISOString(),inferenceCalls:0,primaryScoresModified:false,rows},null,2));console.log(JSON.stringify(rows.map(r=>({task:r.task,arm:r.arm,probes:r.probes.map(p=>({name:p.name,exit:p.exitCode,stdout:p.stdout.slice(-1000)}))}))));
