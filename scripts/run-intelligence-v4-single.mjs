// User amendment: retain prior repetitions, dispatch only repetition zero.
import {readFile,writeFile,mkdir,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {freemem} from 'node:os';
import {sourceInputs} from '../src/eval-v4/protocol.mjs';
import {hash} from '../src/workspace.mjs';
const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),base=resolve(root,'.suffice/intelligence-v4/single'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const protocol=await load(resolve(out,'protocol.json')),priority=await load(resolve(out,'infrastructure/priority-amendment.json'));
if(JSON.stringify(await sourceInputs(root))!==JSON.stringify(protocol.inputs))throw new Error('Frozen source drift');
const replace=(source,before,after)=>{if(source.split(before).length!==2)throw new Error('Unexpected single-run derivation: '+before);return source.replace(before,after);};
await mkdir(base,{recursive:true});
const files={};
for(const name of ['coordinator','campaign']){
 let source=await readFile(resolve(root,priority.files[name].path),'utf8');if(hash(source)!==priority.files[name].sha256)throw new Error('Priority executor drift');
 if(name==='coordinator'){
  source=replace(source,'outer:for(const round of protocol.schedule){','outer:for(const round of protocol.schedule.filter(round=>round[0].repetition===0)){');
  source=replace(source,'target:192','target:96');
 }else source=replace(source,'.suffice/intelligence-v4/priority/coordinator.mjs','.suffice/intelligence-v4/single/coordinator.mjs');
 const path='.suffice/intelligence-v4/single/'+name+'.mjs';await writeFile(resolve(root,path),source);files[name]={path,sha256:hash(source)};
}
const path=resolve(out,'infrastructure/single-repetition-amendment.json');
let saved;try{saved=await load(path);}catch(e){if(e.code!=='ENOENT')throw e;}
const amendment={version:1,at:new Date().toISOString(),authorization:'User requested no further repetitions on November 10, 2026, America/Chicago.',originalTarget:192,target:96,repetitions:[0],retainedLegacyRepetitions:16,originalProtocolSha256:hash(await readFile(resolve(out,'protocol.json'))),priorityPolicySha256:priority.policySha256,files,unchanged:'Exact models and efforts, first-repetition inputs and arm order, prompts, graph/controller, tools, grading, limits, one concurrent attempt and total $25 cap.',analysis:'Primary evaluation uses repetition zero only. Previously executed repetition-one results remain a separate legacy stratum; never select a repetition by its outcome. First-repetition order retains the original schedule and therefore does not preserve all four rows of the original two-repetition Williams balance. No repeatability claim from a single run.'};
if(saved){if(JSON.stringify(saved.files)!==JSON.stringify(files)||saved.originalProtocolSha256!==amendment.originalProtocolSha256)throw new Error('Single-run amendment drift');}
else await writeFile(path,JSON.stringify(amendment,null,2),{flag:'wx'});
if(process.argv.includes('--check-only')){console.log(JSON.stringify({event:'single_run_derivation_verified',target:96,repetitions:[0],modelRequests:0}));process.exit(0);}
// The old controller sees the pause flag at its next worker boundary. Let its
// active first repetition finish and release its lease before replacing it.
while(true){try{await readFile(resolve(root,'.suffice/native-evaluation.lock'));await new Promise(r=>setTimeout(r,2000));}catch(e){if(e.code==='ENOENT')break;throw e;}}
if((await load(resolve(out,'spending.json'))).entries.some(e=>e.state==='dispatched'))throw new Error('Orphaned inference requires audit');
await writeFile(resolve(out,'control.json'),JSON.stringify({pause:false,reason:'Single-repetition controller only; original schedule/source preserved',at:new Date().toISOString()},null,2));
const run=file=>new Promise((done,reject)=>{const child=spawn(process.execPath,['--max-old-space-size=768',file],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));child.on('error',reject);child.on('close',done);});
for(let cycle=0;cycle<100;cycle++){
 const disk=await statfs(root);if(disk.bavail*disk.bsize<6*1024**3)break;
 if(freemem()<0.75*1024**3){await new Promise(r=>setTimeout(r,20000));continue;}
 const code=await run('.suffice/intelligence-v4/single/campaign.mjs'),state=await load(resolve(out,'execution-status.json'));
 await run('scripts/report-intelligence-v4.mjs');await run('scripts/archive-intelligence-v4-workspaces.mjs');
 console.log(JSON.stringify({event:'single_run_campaign_status',code,status:state.status,target:96}));
 if(code!==0||state.status!=='resource_limited')break;
 await new Promise(r=>setTimeout(r,20000));
}
