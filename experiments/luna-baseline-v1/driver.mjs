// Serial execution of a predeclared model-only calibration; not an agent policy.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,open,appendFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
const ROOT=resolve(import.meta.dirname,'../..'),DIR=resolve(ROOT,'.suffice/luna-baseline-v2');
process.chdir(ROOT);process.env.PATH='/home/eric_qin/suffice-general-runtime/bin:/usr/bin:/bin';
await mkdir(DIR,{recursive:true});
const lock=await open(resolve(DIR,'driver.lock'),'wx');await lock.writeFile(String(process.pid));
const plan=JSON.parse(await readFile(resolve(import.meta.dirname,'cohort-v2-manifest.json'),'utf8'));
const campaign=resolve(import.meta.dirname,'campaign-v2.mjs'),target=plan.serialOrder;
const deadline=Date.parse('2026-10-15T13:00:00Z'),blocked={},completed=[];
let active=null,majorBlocker=null;
const json=p=>readFile(p,'utf8').then(JSON.parse);
const exists=async p=>{try{await readFile(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const save=()=>writeFile(resolve(DIR,'driver-state.json'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,target,active,completed,blocked,majorBlocker,deadline:new Date(deadline).toISOString(),contention:'One separate Sol-low live l03 repair continuation may overlap this serial Luna campaign; same Sonion CPU affinity 0,1. Keep timestamps for actual overlap.'},null,2)+'\n');
async function execute(args,label){
 const file=resolve(DIR,label+'.log');await appendFile(file,'\n'+new Date().toISOString()+' '+JSON.stringify(args)+'\n');
 return new Promise(done=>{const child=spawn(process.execPath,args,{cwd:ROOT,env:process.env,stdio:['ignore','pipe','pipe']});let tail='';
  const add=b=>{tail=(tail+b).slice(-32768);void appendFile(file,b);};child.stdout.on('data',add);child.stderr.on('data',add);
  child.on('error',e=>{tail+=e.message;});child.on('close',code=>done({code,tail}));
 });
}
async function authFailure(id){
 try{const w=await json(resolve(DIR,'attempts',id+'-suffice','worker/worker.json'));return(w.errors??[]).some(e=>/unauthorized|invalid.grant|refresh.*(?:failed|expired)|sign.?in required|subscription required|auth.*revoked/i.test(e));}catch{return false;}
}
try{
 await appendFile(resolve(DIR,'launch.jsonl'),JSON.stringify({at:new Date().toISOString(),authorizedBy:'Parent launch gate released after main comparative set completion at 07:43 UTC',model:'gpt-6-luna',effort:'low',tasks:target,serial:true,noAdditionalModel:true})+'\n');
 for(const id of target){
  active=id;await save();
  if(Date.now()>=deadline){blocked[id]='Not started: declared deadline reached';continue;}
  if(await exists(resolve(DIR,'attempts',id+'-suffice/result.json'))){completed.push(id);continue;}
  if(await exists(resolve(DIR,'attempts',id+'-suffice/initial.json'))){blocked[id]='Partial actor attempt preserved; no retry';continue;}
  let control;
  if(!await exists(resolve(DIR,'preflight',id,'validated.json'))){
   if(id==='q04'&&await exists(resolve(DIR,'preflight/q04/baseline/grade.json'))){control={code:1,tail:'Reference patch adapter required'};}
   else control=await execute([campaign,'preflight',id],'control-'+id);
   if(control.code!==0&&id==='q04'&&control.tail.includes('Reference patch adapter required'))control=await execute([resolve(ROOT,'scripts/sonion-q04-control-completion.mjs'),'--luna'],'control-q04-completion');
   if(control.code!==0){blocked[id]='Model-free controls failed; inspect preserved control logs';await save();continue;}
  }
  const run=await execute([campaign,'run',id],'attempt-'+id);
  if(await authFailure(id)){majorBlocker='Subscription/authentication failure on '+id;await save();break;}
  if(await exists(resolve(DIR,'attempts',id+'-suffice/result.json')))completed.push(id);
  else blocked[id]='Actor/evaluator process exit '+run.code+'; partial evidence preserved';
  await save();
 }
 active=null;await execute([campaign,'report'],'report');await save();
}finally{await lock.close();await unlink(resolve(DIR,'driver.lock'));}
