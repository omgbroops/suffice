// Post-hoc review of an EXPLICIT sentence in issue95, not new primary grading.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {spawnSync} from 'node:child_process';
const {executeIsolated,ROOT}=await import('../experiments/luna-fresh-v1/execution.mjs');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),DIR=resolve(ROOT,'.suffice/luna-fresh-v1/thenable-contract-audit',stamp);await mkdir(DIR,{recursive:true});
const taskFile=resolve(ROOT,'.suffice/luna-fresh-v1/tasks/f03/task.json'),task=JSON.parse(await readFile(taskFile,'utf8'));
const cases=[['base',[]],['reference',JSON.parse(await readFile(task.referencePatchJson,'utf8'))]];
for(const arm of ['A','B']){try{cases.push([arm,JSON.parse(await readFile(resolve(ROOT,'.suffice/luna-fresh-v1/attempts','f03-'+arm,'patch.json'),'utf8'))]);}catch(e){if(e.code!=='ENOENT')throw e;}}
const program=`import pMap,{pMapSettled,pMapIterable} from './index.js';
const output=[];for(const mode of ['map','settled','ordered','unordered']){
 let value=0,nextCalls=0,thenGets=0,thenCalls=0;
 const source={[Symbol.asyncIterator](){return {next(){nextCalls++;return {get then(){thenGets++;return resolve=>{thenCalls++;resolve(value<3?{done:false,value:++value}:{done:true});};}};}};}};
 let values;if(mode==='map')values=await pMap(source,v=>v,{concurrency:1});else if(mode==='settled')values=(await pMapSettled(source,v=>v,{concurrency:1})).map(x=>x.value);else{values=[];for await(const v of pMapIterable(source,v=>v,{concurrency:1,preserveOrder:mode==='ordered'}))values.push(v);}
 output.push({mode,nextCalls,thenGets,thenCalls,values,oneGetterReadPerPull:thenGets===nextCalls,singleSubscriptionPerPull:thenCalls===nextCalls});
}console.log(JSON.stringify(output));`;
const rows=[];
for(const[label,patch]of cases){
 const folder=resolve(DIR,label),workspace=resolve(folder,'workspace');await mkdir(folder,{recursive:true});const p=resolve(folder,'patch.json');await writeFile(p,JSON.stringify(patch));
 const data=spawnSync('python3',['-I',resolve(ROOT,'experiments/luna-fresh-v1/evaluator-data.py'),'grade',taskFile,workspace,p],{encoding:'utf8'});if(data.status!==0)throw Error(data.stderr);
 const run=await executeIsolated({workspace,receipts:resolve(folder,'receipts'),command:['node','--input-type=module','-e',program],gitMetadata:[task.dependencyDir],network:false,timeoutMs:30000});
 if(run.exitCode!==0)throw Error(run.stderr);rows.push({label,checks:JSON.parse(run.stdout)});
}
const audit={at:new Date().toISOString(),primaryGraderChanged:false,modelFeedback:false,originalIssue:task.url,contractBasis:'Original issue95 states that there is no preliminary then read so a getter is also read once. Upstream added tests count then calls but not getter reads. This separate review checks that explicit claim, across the four listed API modes.',rows};
await writeFile(resolve(ROOT,'reports/luna-fresh-v1/thenable-contract-audit.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify(rows));
