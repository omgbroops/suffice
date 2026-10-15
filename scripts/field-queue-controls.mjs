import {readFile,writeFile,mkdir,readdir,cp,symlink,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {executeIsolated,linuxPath} from './general-execution.mjs';
const root=resolve(import.meta.dirname,'..'), id=process.argv[2],td=resolve(root,'.suffice/field-campaign-v1/tasks',id),base=resolve(td,'base'),priv=resolve(td,'private');
const task=JSON.parse(await readFile(resolve(td,'task.json'),'utf8'));
const dep=id==='q02'?resolve(root,'.suffice/field-campaign-v1/tasks/q01/base/node_modules'):resolve(base,'node_modules');
if(id==='q02')await cp(resolve(root,'.suffice/field-campaign-v1/tasks/q01/base/package-lock.json'),resolve(base,'package-lock.json'));
const tests=(await readdir(resolve(base,'test'))).filter(f=>f.endsWith('.ts')).map(f=>'test/'+f);
const modern=id!=='q03';
const native=modern?[['node','--import=tsx/esm','--test','--test-reporter=tap','--test-concurrency=1',...tests],['node','node_modules/typescript/bin/tsc'],['node','node_modules/tsd/dist/cli.js']]:[['node','node_modules/typescript/bin/tsc'],['node','node_modules/ava/entrypoints/cli.mjs']];
const acceptance=modern?[['node','--import=tsx/esm','--test','--test-reporter=tap','--test-concurrency=1','--test-name-pattern='+(id==='q01'?'issue #251':'\\.onSizeLessThan\\(\\) resolves when|\\.onSizeLessThan\\(\\) resolves multiple'),...task.graderOverlay.map(x=>x.target).filter(f=>id!=='q01'||f==='test/advanced.ts')]]:[['node','node_modules/ava/entrypoints/cli.mjs','--match=aborting multiple jobs at the same time']];
task.nativeCommands=native;task.acceptanceCommands=acceptance;task.dependencyDir=dep;
async function run(dir,kind,commands){const outcomes=[];for(let i=0;i<commands.length;i++){const receipts=resolve(priv,'logs',kind+'-'+i);const out=await executeIsolated({workspace:dir,receipts,command:commands[i],gitMetadata:[dep],network:false,timeoutMs:180000});outcomes.push({command:commands[i],exitCode:out.exitCode,latencyMs:out.latencyMs,receipts});console.log(id,kind,i,out.exitCode,out.stdout.slice(-400),out.stderr.slice(-800));}return outcomes;}
async function control(kind,reference){
 const dir=resolve(priv,'controls',kind);await mkdir(dir,{recursive:true});await cp(base,dir,{recursive:true,filter:src=>!src.split(/[\\/]/).includes('node_modules')&&!src.split(/[\\/]/).includes('.git')});
 spawnSync('wsl.exe',['-d','Ubuntu','--','ln','-sfn',linuxPath(dep),linuxPath(resolve(dir,'node_modules'))],{encoding:'utf8'});
 const nativeResult=await run(dir,kind+'-native',native);
 for(const x of task.graderOverlay)await cp(x.source,resolve(dir,x.target));
 if(reference){
  const result=spawnSync('git',['-C',dir,'apply','--whitespace=nowarn',task.referencePatch],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);
 }
 // Compile actual source again after applying the source-only reference, using the repository's compiler and tsconfig.
 const buildResult=modern?[]:await run(dir,kind+'-acceptance-build',[['node','node_modules/typescript/bin/tsc']]);
 const acceptanceResult=await run(dir,kind+'-acceptance',acceptance);
 return {native:nativeResult,build:buildResult,acceptance:acceptanceResult};
}
// Original native suite runs both with pre-fix and reference production source.
const baseline=await control('baseline',false);
const referenceDir=resolve(priv,'controls','reference');
await mkdir(referenceDir,{recursive:true});await cp(base,referenceDir,{recursive:true,filter:src=>!src.split(/[\\/]/).includes('node_modules')&&!src.split(/[\\/]/).includes('.git')});
spawnSync('wsl.exe',['-d','Ubuntu','--','ln','-sfn',linuxPath(dep),linuxPath(resolve(referenceDir,'node_modules'))],{encoding:'utf8'});
spawnSync('git',['-C',referenceDir,'init','--initial-branch=control'],{encoding:'utf8'});
let patch=spawnSync('git',['-C',referenceDir,'apply','--whitespace=nowarn',task.referencePatch],{encoding:'utf8'});if(patch.status!==0)throw new Error(patch.stderr);
const refNative=await run(referenceDir,'reference-native',native);
for(const x of task.graderOverlay)await cp(x.source,resolve(referenceDir,x.target));
const refAcceptance=await run(referenceDir,'reference-acceptance',acceptance);
const reference={native:refNative,acceptance:refAcceptance};
task.nativeParser=modern?'tap':undefined;
task.controls={nativeExitCodes:baseline.native.map(r=>r.exitCode),nativeFailureNames:[],baselineAccepted:baseline.acceptance.every(r=>r.exitCode===0),referenceAccepted:refAcceptance.every(r=>r.exitCode===0),knownNativeFailures:baseline.native.filter(r=>r.exitCode!==0).map(r=>({command:r.command,receipts:r.receipts})),baseline,reference};
task.ready=!task.controls.baselineAccepted&&task.controls.referenceAccepted&&refNative.every(r=>r.exitCode===0)&&baseline.native.every(r=>r.exitCode===0);
task.provenance.lockSha256=(await import('node:crypto')).createHash('sha256').update(await readFile(resolve(base,'package-lock.json'))).digest('hex');
task.provenance.nodeVersion='v24.15.0';task.provenance.nodeEngine=JSON.parse(await readFile(resolve(base,'package.json'),'utf8')).engines.node;
await writeFile(resolve(td,'task.json'),JSON.stringify(task,null,2)+'\n');
console.log(id,'READY',task.ready);
