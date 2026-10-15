import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {executeIsolated,linuxPath} from './general-execution.mjs';
const R=resolve(import.meta.dirname,'..');
for(const id of process.argv.slice(2)){
 const root=resolve(R,'.suffice/field-campaign-v1/tasks',id),mf=resolve(root,'task.json'),m=JSON.parse(await readFile(mf,'utf8')),priv=resolve(R,'research/field-campaign-v1/state',id), dep=resolve(m.dependencyDir);
 const lock=resolve(m.baseDir,'.field-dependencies');await mkdir(lock,{recursive:true});for(const f of ['package.json','package-lock.json'])await cp(resolve(dep,'..',f),resolve(lock,f));
 await writeFile(resolve(m.baseDir,'.gitignore'),(await readFile(resolve(m.baseDir,'.gitignore'),'utf8').catch(()=>''))+'\nnode_modules/\n');
 const git=(args)=>{const r=spawnSync('git',['-C',m.baseDir,...args],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim();};
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Historical control','-c','user.email=historical@example.invalid','commit','-qm','Exact upstream pre-fix source with locked behavioral test dependencies']);m.localGit=m.baseDir;m.localBaseCommit=git(['rev-parse','HEAD']);
 const results={};
 for(const mode of ['baseline','reference']){
  const work=resolve(root,'controls',mode);await cp(m.baseDir,work,{recursive:true,filter:p=>!p.endsWith('/.git')&&!p.endsWith('\\.git')&&!p.endsWith('/node_modules')&&!p.endsWith('\\node_modules')});
  const link=spawnSync('wsl.exe',['-d','Ubuntu','--','ln','-s',linuxPath(dep),linuxPath(resolve(work,'node_modules'))],{encoding:'utf8'});if(link.status)throw Error(link.stderr);
  if(mode==='reference')for(const f of m.referenceFiles){await mkdir(resolve(work,f.target,'..'),{recursive:true});await cp(f.source,resolve(work,f.target));}
  const opts={workspace:work,privateRoots:[resolve(R,'research')],gitMetadata:[dep],network:false,timeoutMs:180000};
  const native=[];for(const [n,command] of m.nativeCommands.entries()){const r=await executeIsolated({...opts,command:['env','GIT_CEILING_DIRECTORIES=/workspace',...command],receipts:resolve(priv,'receipts',mode,'native-'+n)});native.push(r.exitCode);console.log(id,mode,'native',n,r.exitCode,r.stdout.slice(-600),r.stderr.slice(-500));}
  for(const f of m.graderOverlay){await mkdir(resolve(work,f.target,'..'),{recursive:true});await cp(f.source,resolve(work,f.target));}
  const acceptance=[];for(const [n,command] of m.acceptanceCommands.entries()){const r=await executeIsolated({...opts,command:['env','GIT_CEILING_DIRECTORIES=/workspace',...command],receipts:resolve(priv,'receipts',mode,'acceptance-'+n)});acceptance.push(r.exitCode);console.log(id,mode,'acceptance',n,r.exitCode,r.stdout.slice(-1000),r.stderr.slice(-500));}
  results[mode]={native,acceptance};
 }
 m.controls={baselineAccepted:results.baseline.acceptance.every(n=>n===0),referenceAccepted:results.reference.acceptance.every(n=>n===0),nativeExitCodes:results.baseline.native,referenceNativeExitCodes:results.reference.native,knownNativeFailures:[]};
 m.ready=!m.controls.baselineAccepted&&m.controls.referenceAccepted&&results.baseline.native.every(n=>n===0)&&results.reference.native.every(n=>n===0);await writeFile(mf,JSON.stringify(m,null,2));await writeFile(resolve(priv,'controls.json'),JSON.stringify(results,null,2));console.log(id,'READY',m.ready);
}
