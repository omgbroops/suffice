import {readFile,writeFile,mkdir,cp,readdir,symlink,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {executeIsolated} from './sonion-execution.mjs';
const R=resolve(import.meta.dirname,'..');
const countTests=txt=>{for(const line of txt.split(String.fromCharCode(10))){const a=line.trim().split(' ').filter(Boolean),i=a.indexOf('tests');if(i>=0){if(/^[0-9]+$/.test(a[i+1]??''))return Number(a[i+1]);if(/^[0-9]+$/.test(a[i-1]??''))return Number(a[i-1]);}}return 0;};
const summary=r=>({exitCode:r.exitCode,latencyMs:r.latencyMs,reportedTests:countTests(r.stdout),stdoutTail:r.stdout.slice(-1800),stderrTail:r.stderr.slice(-800)});
for(const id of process.argv.slice(2)){
 const root=resolve(R,'.suffice/field-campaign-v1/tasks',id),mf=resolve(root,'task.json'),m=JSON.parse(await readFile(mf,'utf8')),priv=resolve(R,'research/field-campaign-v1/state',id),dep=resolve(m.dependencyDir);
 const lock=resolve(m.baseDir,'.field-dependencies');await mkdir(lock,{recursive:true});for(const f of ['package.json','package-lock.json'])await cp(resolve(dep,'..',f),resolve(lock,f));
 const git=(args)=>{const r=spawnSync('git',['-C',m.baseDir,...args],{encoding:'utf8'});if(r.status)throw Error(r.stderr||r.stdout);return r.stdout.trim();};
 await mkdir(resolve(priv,'receipts/sonion'),{recursive:true});
 if(!await lstat(resolve(m.baseDir,'.git')).catch(()=>null)){git(['init','-q']);git(['add','.']);git(['-c','user.name=Historical control','-c','user.email=historical@example.invalid','commit','-qm','Upstream pre-fix source and locked native behavioral test dependencies']);}
 m.localGit=m.baseDir;m.localBaseCommit=git(['rev-parse','HEAD']);m.ready=false;await writeFile(mf,JSON.stringify(m,null,2)+'\n');
 const stamp=new Date().toISOString().replaceAll(':','-'),results={host:'sonion',runtime:process.version,startedAt:new Date().toISOString(),originalNativeCommands:m.nativeCommands,acceptanceCommands:m.acceptanceCommands,baseCommit:m.baseCommit,fixCommit:m.fixCommit,localBaseCommit:m.localBaseCommit};
 for(const mode of ['baseline','reference']){
  const work=resolve(root,'sonion-controls',stamp,mode);await cp(m.baseDir,work,{recursive:true,filter:p=>!p.endsWith('/.git')&&!p.endsWith('/node_modules')});
  await symlink(dep,resolve(work,'node_modules'),'dir');
  if(mode==='reference')for(const f of m.referenceFiles){await mkdir(resolve(work,f.target,'..'),{recursive:true});await cp(f.source,resolve(work,f.target));}
  const opts={workspace:work,privateRoots:[resolve(R,'research')],gitMetadata:[dep],network:false,timeoutMs:180000};
  const native=[];for(const [n,command] of m.nativeCommands.entries()){const r=await executeIsolated({...opts,command:['env','GIT_CEILING_DIRECTORIES=/workspace','NO_COLOR=1',...command],receipts:resolve(priv,'receipts/sonion',stamp,mode,'native-'+n)});native.push(summary(r));console.log(id,mode,'original native',JSON.stringify(native.at(-1)));}
  for(const f of m.graderOverlay){await mkdir(resolve(work,f.target,'..'),{recursive:true});await cp(f.source,resolve(work,f.target));}
  const acceptance=[];for(const [n,command] of m.acceptanceCommands.entries()){const r=await executeIsolated({...opts,command:['env','GIT_CEILING_DIRECTORIES=/workspace','NO_COLOR=1',...command],receipts:resolve(priv,'receipts/sonion',stamp,mode,'acceptance-'+n)});acceptance.push(summary(r));console.log(id,mode,'acceptance',JSON.stringify(acceptance.at(-1)));}
  results[mode]={native,acceptance};
 }
 m.controls={baselineAccepted:results.baseline.acceptance.every(r=>r.exitCode===0),referenceAccepted:results.reference.acceptance.every(r=>r.exitCode===0),nativeExitCodes:results.baseline.native.map(r=>r.exitCode),referenceNativeExitCodes:results.reference.native.map(r=>r.exitCode),knownNativeFailures:[],baselineNativeReportedTests:results.baseline.native.map(r=>r.reportedTests),referenceNativeReportedTests:results.reference.native.map(r=>r.reportedTests)};
 m.receipt=resolve(priv,'sonion-controls.json');m.receipts=resolve(priv,'receipts/sonion',stamp);m.ready=!m.controls.baselineAccepted&&m.controls.referenceAccepted&&results.baseline.native.every(r=>r.exitCode===0)&&results.reference.native.every(r=>r.exitCode===0);await writeFile(mf,JSON.stringify(m,null,2)+'\n');await writeFile(m.receipt,JSON.stringify(results,null,2)+'\n');console.log(id,'READY',m.ready);
}
