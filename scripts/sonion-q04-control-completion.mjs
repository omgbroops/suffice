// Complete q04's exact-path reference control when both referenceFiles and a
// redundant referencePatch are present. Frozen campaign/evaluator files stay intact.
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const ROOT=resolve(import.meta.dirname,'..'),luna=process.argv.includes('--luna');
const {executeIsolated}=await import(luna?'../experiments/luna-baseline-v1/execution.mjs':'./sonion-execution.mjs');
const DIR=resolve(ROOT,luna?'.suffice/luna-baseline-v2':'.suffice/field-campaign-v2');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(p,x)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(x,null,2)+'\n');};
const m=await load(resolve(DIR,'frozen/q04.json')),t=m.task,out=resolve(DIR,'preflight/q04');
const initial=await load(resolve(out,'initial.json')),baseline=await load(resolve(out,'baseline/grade.json'));
if(JSON.stringify(initial.trackedHashes)!==JSON.stringify(m.baseHashes)||!baseline.originalNativeValid||baseline.accepted)throw new Error('Original exact-path controls missing/invalid');
if(!t.referenceFiles?.length||!t.referencePatch)throw new Error('This bridge only accepts redundant reference representations');
for(const[p,h]of Object.entries(m.inputs))if(createHash('sha256').update(await readFile(p)).digest('hex')!==h)throw new Error('Frozen task changed: '+p);
const reference=resolve(out,'reference'),workspace=resolve(DIR,'evaluation/q04-reference');
await mkdir(reference,{recursive:true});
const patch=[];for(const x of t.referenceFiles)patch.push({path:x.target,after:(await readFile(x.source)).toString('base64')});
await save(resolve(reference,'patch.json'),patch);
const prepared=spawnSync('python3',['-I',resolve(ROOT,'scripts/sonion-data-v2.py'),'grade',m.taskFile,workspace,resolve(reference,'patch.json')],{encoding:'utf8'});
if(prepared.status!==0)throw new Error(prepared.stderr||prepared.stdout);
const dep=await (await import('node:fs/promises')).realpath(t.dependencyDir);
const native=[],acceptance=[];
for(let i=0;i<t.nativeCommands.length;i++)native.push(await executeIsolated({workspace,receipts:resolve(reference,'grade/native-'+i),command:t.nativeCommands[i],privateRoots:[resolve(ROOT,'research'),resolve(ROOT,'.suffice/field-campaign-v1/tasks/q04/private')],gitMetadata:[dep],network:false,timeoutMs:120000}));
for(const x of t.graderOverlay){const target=resolve(workspace,x.target);if(!target.startsWith(workspace+'/'))throw new Error('Overlay escape');await mkdir(dirname(target),{recursive:true});await copyFile(x.source,target);}
for(let i=0;i<t.acceptanceCommands.length;i++)acceptance.push(await executeIsolated({workspace,receipts:resolve(reference,'grade/acceptance-'+i),command:t.acceptanceCommands[i],privateRoots:[resolve(ROOT,'research')],gitMetadata:[dep],network:false,timeoutMs:120000}));
if(native.some((r,i)=>r.outputLimited||r.exitCode!==(t.controls.nativeExitCodes?.[i]??0))||acceptance.some(r=>r.outputLimited||r.exitCode!==0))throw new Error('Reference control failed');
const brief=r=>({exitCode:r.exitCode,latencyMs:r.latencyMs,outputLimited:r.outputLimited});
const rg={accepted:true,originalNativeValid:true,native:native.map(brief),acceptance:acceptance.map(brief),workspace,actorTestEditsExcluded:[]};
await save(resolve(reference,'grade.json'),rg);
const receipt={id:'q04',at:new Date().toISOString(),actorNativeValid:true,baseline,reference:rg,dependencyMount:dep,networkForGrading:false,sourceHashes:m.baseHashes,operationalExtension:'Redundant referencePatch rejected before referenceFiles processing; completed identical exact-path source-only reference checks without altering frozen code or task.',extensionSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')};
await save(resolve(out,'validated.json'),receipt);console.log(JSON.stringify({q04Validated:true,luna,extensionSha256:receipt.extensionSha256}));
