import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,appendFile,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
const ROOT=resolve(import.meta.dirname,'../..'),DIR=resolve(ROOT,'.suffice/codex-sol-xhigh-v1'),campaign=resolve(import.meta.dirname,'campaign.mjs');
process.chdir(ROOT);process.env.PATH='/home/eric_qin/suffice-general-runtime/bin:/usr/bin:/bin';
await mkdir(DIR,{recursive:true});const lock=await open(resolve(DIR,'driver.lock'),'wx');await lock.writeFile(String(process.pid));
const plan=JSON.parse(await readFile(resolve(import.meta.dirname,'plan.json'),'utf8'));
const active=new Set(),completed=[],blocked={};let majorBlocker=null;
const save=()=>writeFile(resolve(DIR,'driver-state.json'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,active:[...active],completed,blocked,majorBlocker,maximumConcurrentActors:2},null,2)+'\n');
async function execute(args,label){
 const file=resolve(DIR,label+'.log');await appendFile(file,'\n'+new Date().toISOString()+' '+JSON.stringify(args)+'\n');
 return new Promise(done=>{const child=spawn(process.execPath,args,{cwd:ROOT,stdio:['ignore','pipe','pipe']});let tail='';const add=b=>{tail=(tail+b).slice(-32768);void appendFile(file,b);};child.stdout.on('data',add);child.stderr.on('data',add);child.on('error',e=>tail+=e.message);child.on('close',code=>done({code,tail}));});
}
async function pair(id){active.add(id);await save();const r=await execute([campaign,'run',id],'pair-'+id);active.delete(id);if(r.code===0)completed.push(id);else blocked[id]=r.tail.slice(-1500);await save();if(/unauthorized|invalid.grant|subscription required|not supported when using Codex|sign.?in required/i.test(r.tail))throw Error('Authentication/model-access blocker');return r;}
try{
 active.add('model-free-setup');await save();
 for(const [args,label]of [[[resolve(import.meta.dirname,'zero.mjs')],'zero'],[[campaign,'init'],'init']]){const r=await execute(args,label);if(r.code!==0)throw Error(label+' failed: '+r.tail);}
 for(const id of plan.tasks){const r=await execute([campaign,'preflight',id],'controls-'+id);if(r.code!==0)throw Error('Controls '+id+': '+r.tail);}
 active.clear();await save();
 const first=await pair(plan.tasks[0]);if(first.code!==0)throw Error('First matched pair failed operationally');
 for(const arm of ['suffice','codex']){const r=JSON.parse(await readFile(resolve(DIR,'attempts',plan.tasks[0]+'-'+arm,'result.json'),'utf8'));if(!r.identity||!r.tools||!r.receiptsMatched||r.operationalFailure)throw Error('First-pair accounting/environment validation failed '+arm);}
 await writeFile(resolve(DIR,'first-pair-validation.json'),JSON.stringify({at:new Date().toISOString(),task:plan.tasks[0],passed:true,codingAcceptanceDoesNotGateContinuation:true},null,2));
 const queue=plan.tasks.slice(1);await Promise.all(Array.from({length:2},async()=>{while(queue.length&&!majorBlocker){const id=queue.shift();try{await pair(id);}catch(e){majorBlocker=String(e);await save();}}}));
}catch(e){majorBlocker=String(e.stack);await appendFile(resolve(DIR,'driver-error.txt'),majorBlocker+'\n');}
finally{active.clear();await execute([campaign,'report'],'report');await save();await lock.close();await unlink(resolve(DIR,'driver.lock'));}
