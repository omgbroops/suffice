// Explicit post-restart resource-policy amendment. The prospective source and
// protocol remain immutable. Derived executors change admission floors and
// bookkeeping only; every experiment input and every prior result is retained.
import {readFile,writeFile,mkdir,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {freemem} from 'node:os';
import {hash} from '../src/workspace.mjs';
import {sourceInputs} from '../src/eval-v4/protocol.mjs';
const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),generatedRoot=resolve(root,'.suffice/intelligence-v4/low-memory'),load=async path=>JSON.parse(await readFile(path,'utf8'));
const protocol=await load(resolve(out,'protocol.json'));
if(JSON.stringify(await sourceInputs(root))!==JSON.stringify(protocol.inputs))throw new Error('Frozen agent/evaluation source drift');
const ledger=await load(resolve(out,'spending.json'));if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Unfinished dispatch requires audit');
try{await readFile(resolve(root,'.suffice/native-evaluation.lock'));throw new Error('Another evaluator owns the serial lease');}catch(e){if(e.code!=='ENOENT')throw e;}
const policy={phase:'post-restart-low-memory-v2',authorization:'User explicitly asked to try continuing while studying after restarting the PC.',originalProtocolSha256:hash(await readFile(resolve(out,'protocol.json'))),parentMinimumFreeRAMGiB:0.75,workerMinimumFreeRAMGiB:0.5,preparationMinimumFreeRAMGiB:0.75,minimumFreeDiskGiB:6,workerHeapMiB:768,projectHeapMiB:384,maxConcurrent:1,temperatureC:null,unchanged:'Exact models/efforts, prompts, graph, controller, tools, grading, token/wall/tool budgets and total $25 cap.',analysis:'Preserve and identify the first four model attempts under the original launch floors. Report phase-stratified results; do not describe host starting conditions as identical.'};
const policySha256=hash(JSON.stringify(policy));await mkdir(generatedRoot,{recursive:true});
const relative=name=>'.suffice/intelligence-v4/low-memory/'+name+'.mjs';
const rebase=source=>source.replace(/(from\s*|import\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,(_all,prefix,quote,path)=>prefix+quote+pathToFileURL(resolve(root,'scripts',path)).href+quote);
const replacements={
  worker:[['resources[0].freeRAM<1.75*1024**3','resources[0].freeRAM<0.5*1024**3'],['version:1,item,limits:LIMITS',`version:1,resourcePolicyPhase:${JSON.stringify(policy.phase)},resourcePolicySha256:${JSON.stringify(policySha256)},item,limits:LIMITS`]],
  coordinator:[['freemem()<2*1024**3','freemem()<0.75*1024**3'],['scripts/intelligence-v4-worker.mjs',relative('worker')]],
  prepare:[['freemem()<1.75*1024**3','freemem()<0.75*1024**3'],['need 1.75 GiB RAM','need 0.75 GiB RAM']],
  campaign:[['scripts/intelligence-v4.mjs',relative('coordinator')],['scripts/prepare-intelligence-v4.mjs',relative('prepare')]]
};
const originals={worker:'scripts/intelligence-v4-worker.mjs',coordinator:'scripts/intelligence-v4.mjs',prepare:'scripts/prepare-intelligence-v4.mjs',campaign:'scripts/campaign-intelligence-v4.mjs'},files={};
for(const [name,path]of Object.entries(originals)){
  const original=await readFile(resolve(root,path),'utf8');let changed=original;
  for(const [before,after]of replacements[name]){if(changed.split(before).length!==2)throw new Error('Unexpected derivation target: '+name+' '+before);changed=changed.replace(before,after);}
  if(name==='worker')changed=changed.replace('result.cellId=cell;result.attempt=0;',`result.resourcePolicyPhase=${JSON.stringify(policy.phase)};result.resourcePolicySha256=${JSON.stringify(policySha256)};result.cellId=cell;result.attempt=0;`);
  const generated=rebase(changed),target=resolve(generatedRoot,name+'.mjs');await writeFile(target,generated);files[name]={originalPath:path,originalSha256:hash(original),derivedPath:relative(name),derivedSha256:hash(generated),changes:replacements[name],importRebase:'Relative imports become absolute file URLs to the exact same original modules.'};
}
const amendmentPath=resolve(out,'infrastructure/low-memory-amendment.json'),amendment={version:1,createdAt:new Date().toISOString(),policy,policySha256,files};
try{const existing=await load(amendmentPath);if(existing.policySha256!==policySha256||JSON.stringify(existing.files)!==JSON.stringify(files))throw new Error('Existing low-memory amendment drift');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(amendmentPath,JSON.stringify(amendment,null,2),{flag:'wx'});}
if(process.argv.includes('--check-only')){console.log(JSON.stringify({event:'low_memory_derivation_verified',policySha256,files:Object.keys(files),modelRequests:0}));process.exit(0);}
const run=(path,args=[])=>new Promise(done=>{const child=spawn(process.execPath,['--max-old-space-size=768',path,...args],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));child.on('error',e=>done({code:1,error:e.message}));child.on('close',code=>done({code}));});
for(let cycle=0;cycle<100;cycle++){
  const disk=await statfs(root);if(disk.bavail*disk.bsize<6*1024**3){console.log(JSON.stringify({event:'low_memory_disk_stop'}));break;}
  if(freemem()<0.75*1024**3){await new Promise(r=>setTimeout(r,20000));continue;}
  const result=await run(relative('campaign')),state=await load(resolve(out,'execution-status.json'));
  // Postprocess only after the serial campaign has released its lease.
  await run('scripts/report-intelligence-v4.mjs');await run('scripts/archive-intelligence-v4-workspaces.mjs');
  console.log(JSON.stringify({event:'low_memory_campaign_status',...result,status:state.status}));
  if(state.status!=='resource_limited')break;
  await new Promise(r=>setTimeout(r,20000));
}
