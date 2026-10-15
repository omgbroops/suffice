import {readFile,writeFile,mkdir,cp,symlink,rm,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {executeIsolated} from './sonion-execution.mjs';
const ROOT=resolve(import.meta.dirname,'..'),TD=resolve(ROOT,'.suffice/field-campaign-v1/tasks/q04'),PRIV=resolve(TD,'private'),BASE=resolve(TD,'base');
const task=JSON.parse(await readFile(resolve(TD,'task.json'),'utf8'));
const tests=[];
async function find(dir,rel=''){for(const f of await readdir(dir,{withFileTypes:true})){if(f.name==='node_modules'||f.name==='.git')continue;const next=rel?rel+'/'+f.name:f.name;if(f.isDirectory())await find(resolve(dir,f.name),next);else if(/\.test\.(ts|js)$/.test(f.name))tests.push(next);}}
await find(BASE);tests.sort();
task.nativeCommands=[['node','node_modules/better-node-test/bin.js',...tests]];
task.acceptanceCommands=[['node','--test','--test-reporter=tap','--test-concurrency=1','field-q04-regression.test.mjs']];delete task.nativeParser;
task.graderOverlay=[{source:resolve(PRIV,'overlay/field-q04-regression.test.mjs'),target:'field-q04-regression.test.mjs'}];
const dep=task.dependencyDir;
async function run(dir,name,commands){let rows=[];for(let i=0;i<commands.length;i++){const receipts=resolve(PRIV,'sonion-controls',name+'-'+i),r=await executeIsolated({workspace:dir,receipts,command:commands[i],gitMetadata:[dep],network:false,timeoutMs:180000});rows.push({command:commands[i],exitCode:r.exitCode,latencyMs:r.latencyMs,failures:[...r.stdout.matchAll(/^not ok \d+ -? ?(.+)$/gm)].map(m=>m[1]),receipts});console.log(name,r.exitCode,r.stdout.slice(-1100),r.stderr.slice(-500));}return rows;}
async function control(name,reference){const dir=resolve(PRIV,'control-workspaces',name);await mkdir(dir,{recursive:true});await cp(BASE,dir,{recursive:true,filter:p=>!p.split('/').includes('node_modules')&&!p.split('/').includes('.git')});await symlink(dep,resolve(dir,'node_modules'),'dir');if(reference)for(const f of task.referenceFiles)await cp(f.source,resolve(dir,f.target));const native=await run(dir,name+'-native',task.nativeCommands);for(const f of task.graderOverlay)await cp(f.source,resolve(dir,f.target));const acceptance=await run(dir,name+'-acceptance',task.acceptanceCommands);return {native,acceptance};}
const baseline=await control('baseline',false),reference=await control('reference',true);
task.controls={nativeExitCodes:baseline.native.map(x=>x.exitCode),nativeFailureNames:baseline.native.flatMap(x=>x.failures),baselineAccepted:baseline.acceptance.every(x=>x.exitCode===0),referenceAccepted:reference.acceptance.every(x=>x.exitCode===0),knownNativeFailures:baseline.native.filter(x=>x.exitCode!==0),baseline,reference};
task.controlsValidated=!task.controls.baselineAccepted&&task.controls.referenceAccepted&&baseline.native.every(x=>x.exitCode===0)&&reference.native.every(x=>x.exitCode===0);task.ready=false;task.admission='Awaiting independent blind contract review';
await writeFile(resolve(TD,'task.json'),JSON.stringify(task,null,2)+'\n');console.log('q04 READY',task.ready);
