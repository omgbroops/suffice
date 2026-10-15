import {executeIsolated,ROOT} from './general-execution.mjs';
import {readFile,writeFile,mkdir,cp,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const research=resolve(ROOT,'research/field-campaign-v1/integration');
const taskRoot=resolve(ROOT,'.suffice/field-campaign-v1/tasks');
const rationales={
 i01:'Asynchronous HTTP response handling must reject malformed redirect locations through the fetch promise while preserving documented manual redirect responses and valid redirects. Exercises URL parsing, redirect modes, response body consumption and request finalization.',
 i02:'Compressed HTTP response stream initialization must settle for empty deflate bodies under different HTTP framing without breaking wrapped/raw deflate and gzip decoding. Requires reasoning about stream data/end ordering and promise settlement.',
 i03:'Iterator consumption schedules work on a shared concurrency limiter; an iterator exception must retain identity and promptly reject while scheduled mapper rejections remain observed. Covers queued and active work, mapper-only errors and array-like input.',
 i04:'Queue scheduling must coordinate running workers, queued push/unshift jobs, pause/resume and mutable concurrency. Multiple public issue scenarios require a consistent state transition policy across scheduling and worker completion.'
};
const commandById={i01:[['node','node_modules/mocha/bin/mocha.js','--reporter','json']],i02:[['node','node_modules/mocha/bin/mocha.js','--reporter','json']],i03:[['node','node_modules/ava/entrypoints/cli.mjs']],i04:[['node','node_modules/tape/bin/tape','test/test.js','test/promise.js']]};
function failures(result){if(result.exitCode===0)return [];const data=JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));return data.failures.map(x=>x.fullTitle).sort();}
for(const id of process.argv.slice(2)){
 const dir=join(taskRoot,id), meta=JSON.parse(await readFile(join(dir,'task.json'),'utf8'));
 for(let waiting=0;;waiting++){try{await readFile(join(meta.baseDir,'package-lock.json'));break;}catch(e){if(waiting>=900)throw e;await new Promise(r=>setTimeout(r,1000));}}
 meta.nativeCommands=commandById[id];meta.complexity=rationales[id];if(id==='i01'||id==='i02')meta.nativeParser='mocha-json';
 const init=spawnSync('git',['init'],{cwd:meta.baseDir,encoding:'utf8'});if(init.status!==0)throw Error(init.stderr);
 for(const args of [['config','user.name','Historical task fixture'],['config','user.email','fixture@localhost'],['config','core.autocrlf','false'],['add','.'],['add','-f','package-lock.json'],['commit','-m','Pre-fix source snapshot and frozen dependency lock']]){
  const r=spawnSync('git',args,{cwd:meta.baseDir,encoding:'utf8'});if(r.status!==0 && !r.stdout.includes('nothing to commit'))throw Error(r.stderr||r.stdout);
 }
 const all={};
 for(const mode of ['baseline','reference']){
  const workspace=join(dir,'control-'+mode);await mkdir(workspace,{recursive:true});
  await cp(meta.baseDir,workspace,{recursive:true,dereference:false,verbatimSymlinks:true});
  if(mode==='reference')for(const f of meta.referenceFiles)await copyFile(f.source,join(workspace,f.target));
  const native=[];
  for(let i=0;i<meta.nativeCommands.length;i++)native.push(await executeIsolated({workspace,receipts:join(research,id,'receipts',mode+'-native-'+i),command:meta.nativeCommands[i],gitMetadata:[meta.dependencyDir],privateRoots:[research],network:false}));
  for(const f of meta.graderOverlay)await copyFile(f.source,join(workspace,f.target));
  const acceptance=[];
  for(let i=0;i<meta.acceptanceCommands.length;i++)acceptance.push(await executeIsolated({workspace,receipts:join(research,id,'receipts',mode+'-acceptance-'+i),command:meta.acceptanceCommands[i],gitMetadata:[meta.dependencyDir],privateRoots:[research],network:false,timeoutMs:30000}));
  all[mode]={native,acceptance};
  console.log(id,mode,JSON.stringify({native:native.map(x=>x.exitCode),acceptance:acceptance.map(x=>x.exitCode)}));
 }
 const nativeCodes=all.baseline.native.map(x=>x.exitCode);
 let nativeMatch=all.reference.native.every((r,i)=>r.exitCode===nativeCodes[i]);
 let names=[];
 if(meta.nativeParser){names=all.baseline.native.flatMap(failures);nativeMatch &&= JSON.stringify(names)===JSON.stringify(all.reference.native.flatMap(failures));}
 else nativeMatch &&= nativeCodes.every(x=>x===0);
 const baselineAccepted=all.baseline.acceptance.every(x=>x.exitCode===0);
 const referenceAccepted=all.reference.acceptance.every(x=>x.exitCode===0);
 meta.controls={baselineAccepted,referenceAccepted,knownNativeFailures:names,nativeExitCodes:nativeCodes,nativeFailureNames:names};
 meta.ready=nativeMatch && !baselineAccepted && referenceAccepted;
 await writeFile(join(research,id,'controls.json'),JSON.stringify({nativeMatch,...all},null,2));
 await writeFile(join(dir,'task.json'),JSON.stringify(meta,null,2)+'\n');
 console.log(id,'ready',meta.ready);
}
