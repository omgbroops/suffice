// Serial prospective campaign: stage only the next frozen task, then execute
// balanced rounds through the existing session runner. Never repair a failed
// primary attempt or mutate frozen adapters in response to an outcome.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const run=(script,args=[])=>new Promise(done=>{const start=Date.now(),child=spawn(process.execPath,['--max-old-space-size=768',script,...args],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));child.on('error',e=>done({code:1,error:e.message,wallMs:Date.now()-start}));child.on('close',code=>done({code,wallMs:Date.now()-start}));});
await mkdir(resolve(out,'campaign-steps'),{recursive:true});
for(let step=0;step<60;step++){
  const execution=await run('scripts/intelligence-v4.mjs'),status=await load(resolve(out,'execution-status.json'));
  await writeFile(resolve(out,'campaign-steps',Date.now()+'.json'),JSON.stringify({execution,status},null,2));
  if(status.status!=='additional_preparation_required')break;
  const preparation=await run('scripts/prepare-intelligence-v4.mjs',['--task='+status.task]);
  await writeFile(resolve(out,'campaign-steps',Date.now()+'.json'),JSON.stringify({task:status.task,preparation},null,2));
  // A failed environment is retained as eight missing cells by the coordinator.
  // Failures before a receipt exists are fatal and require a host audit.
  if(preparation.code!==0){try{await load(resolve(root,'.suffice/intelligence-v4/tasks',status.task,'validation.json'));}catch{break;}}
}
