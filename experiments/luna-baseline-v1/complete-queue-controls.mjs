// Setup adapter completion only. Frozen evaluator/task/model files remain unchanged.
import {readFile,writeFile,mkdir,copyFile,realpath,lstat} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ROOT,executeIsolated} from './execution.mjs';
const task=process.argv[2];if(!['q01','q02'].includes(task))throw new Error('Only declared queue tasks');
const DIR=resolve(ROOT,'.suffice/luna-baseline-v2'),m=JSON.parse(await readFile(resolve(DIR,'frozen',task+'.json'),'utf8')),t=m.task,out=resolve(DIR,'preflight',task);
const load=async p=>JSON.parse(await readFile(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const save=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});};
const initial=await load(resolve(out,'initial.json')),baseline=await load(resolve(out,'baseline/grade.json'));
if(JSON.stringify(initial.trackedHashes)!==JSON.stringify(m.baseHashes)||!baseline.originalNativeValid||baseline.accepted)throw new Error('Original exact-path controls missing/invalid');
if(!t.referencePatch||t.referenceFiles?.length)throw new Error('Patch-only bridge scope mismatch');
for(const[p,h]of Object.entries(m.inputs))if(hash(await readFile(p))!==h)throw new Error('Frozen task changed: '+p);
const beforeActor=resolve(DIR,'attempts',task+'-suffice/worker/events.live.jsonl');
try{if((await readFile(beforeActor,'utf8')).includes('provider_request'))throw new Error('An actor already made requests; no retry');}catch(e){if(e.code!=='ENOENT')throw e;}
const patchText=await readFile(t.referencePatch,'utf8'),oldPaths=[],newPaths=[];
for(const line of patchText.split('\n')){
 if(line.startsWith('--- ')){if(!line.startsWith('--- a/'))throw new Error('Only existing production modifications supported');oldPaths.push(line.slice(6).split('\t')[0]);}
 if(line.startsWith('+++ ')){if(!line.startsWith('+++ b/'))throw new Error('Only existing production modifications supported');newPaths.push(line.slice(6).split('\t')[0]);}
}
if(!newPaths.length||JSON.stringify(oldPaths)!==JSON.stringify(newPaths)||new Set(newPaths).size!==newPaths.length)throw new Error('Unsupported patch path structure');
const protectedPath=p=>p.split('/').some(x=>['test','tests','test-d','__tests__','fixtures','__fixtures__','node_modules','.git','.suffice'].includes(x))||/(^|[./_-])(test|spec)([./_-]|$)/.test(p);
for(const p of newPaths)if(isAbsolute(p)||p.includes('\\')||p.includes(':')||p.split('/').includes('..')||p.split('/').includes('')||protectedPath(p)||!Object.hasOwn(m.baseHashes,p)||!/[.](?:[cm]?js|[cm]?ts)$/.test(p))throw new Error('Not an existing authorized production path: '+p);
const completion=resolve(out,'reference-patch-completion'),workspace=resolve(DIR,'evaluation',task+'-reference-patch-completion');await mkdir(completion,{recursive:true});
const emptyPatch=resolve(completion,'empty-patch.json');await save(emptyPatch,[]);
const data=(mode,...args)=>{const r=spawnSync('python3',['-I',resolve(import.meta.dirname,'evaluator-data.py'),mode,m.taskFile,...args],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout);return JSON.parse(r.stdout);};
data('grade',workspace,emptyPatch);
for(const p of newPaths){let current=workspace;for(const part of p.split('/')){current=resolve(current,part);if((await lstat(current)).isSymbolicLink())throw new Error('Reference patch follows symlink');}const absolute=await realpath(current);if(relative(workspace,absolute).startsWith('..'))throw new Error('Reference patch escapes workspace');}
let dep=await realpath(t.dependencyDir);if(!dep.endsWith('/node_modules'))dep=await realpath(resolve(dep,'node_modules'));if(!dep.endsWith('/node_modules'))throw new Error('Invalid dependency directory');
const privateRoots=[resolve(ROOT,'research'),resolve(ROOT,'.suffice/field-campaign-v1/tasks',task,'private')];
const apply=[];for(const[step,command]of [['check',['git','apply','--check','/receipts/frozen-reference.patch']],['apply',['git','apply','/receipts/frozen-reference.patch']]]){
 const receipts=resolve(completion,step);await mkdir(receipts,{recursive:true});await copyFile(t.referencePatch,resolve(receipts,'frozen-reference.patch'));
 const r=await executeIsolated({workspace,receipts,command,privateRoots,gitMetadata:[dep],network:false,timeoutMs:30000});apply.push({step,exitCode:r.exitCode,latencyMs:r.latencyMs,stderr:r.stderr});if(r.exitCode!==0||r.outputLimited)throw new Error('Reference patch '+step+' failed');
}
const captured=data('capture',workspace);if(captured.some(x=>x.protectedTest)||JSON.stringify(captured.map(x=>x.path).sort())!==JSON.stringify([...newPaths].sort()))throw new Error('Reference patch changed an unauthorized path');
await save(resolve(completion,'captured-production.json'),captured);
const native=[],acceptance=[];
for(let i=0;i<t.nativeCommands.length;i++)native.push(await executeIsolated({workspace,receipts:resolve(completion,'grade/native-'+i),command:t.nativeCommands[i],privateRoots,gitMetadata:[dep],network:false,timeoutMs:120000}));
for(const x of t.graderOverlay){const target=resolve(workspace,x.target);if(!target.startsWith(workspace+'/'))throw new Error('Overlay escape');await mkdir(dirname(target),{recursive:true});await copyFile(x.source,target);}
for(let i=0;i<t.acceptanceCommands.length;i++)acceptance.push(await executeIsolated({workspace,receipts:resolve(completion,'grade/acceptance-'+i),command:t.acceptanceCommands[i],privateRoots,gitMetadata:[dep],network:false,timeoutMs:120000}));
if(native.some((r,i)=>r.outputLimited||r.exitCode!==(t.controls.nativeExitCodes?.[i]??0))||acceptance.some(r=>r.outputLimited||r.exitCode!==0))throw new Error('Reference controls failed; preserve receipts');
const brief=r=>({exitCode:r.exitCode,latencyMs:r.latencyMs,outputLimited:r.outputLimited});
const reference={accepted:true,originalNativeValid:true,native:native.map(brief),acceptance:acceptance.map(brief),workspace,actorTestEditsExcluded:[]};await save(resolve(completion,'grade.json'),reference);
const receipt={id:task,at:new Date().toISOString(),actorNativeValid:true,baseline,reference,dependencyMount:dep,networkForGrading:false,sourceHashes:m.baseHashes,operationalExtension:'Completed missing referencePatch-only setup branch on fresh physical base; production-only paths and symlinks validated; primary evaluator/task/model unchanged.',extensionSha256:hash(await readFile(new URL(import.meta.url))),referencePatchSha256:hash(patchText),validatedProductionPaths:newPaths,apply};
await save(resolve(out,'validated.json'),receipt);console.log(JSON.stringify({task,validated:true,extensionSha256:receipt.extensionSha256,paths:newPaths}));
