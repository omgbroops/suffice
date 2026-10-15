// Durable serial execution of exactly the eight predeclared development cells.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,open,appendFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
const ROOT=resolve(import.meta.dirname,'../..'),DIR=resolve(ROOT,'.suffice/luna-safeguards-v1');
process.chdir(ROOT);process.env.PATH='/home/eric_qin/suffice-general-runtime/bin:/usr/bin:/bin';
await mkdir(DIR,{recursive:true});const lock=await open(resolve(DIR,'driver.lock'),'wx');await lock.writeFile(String(process.pid));
const plan=JSON.parse(await readFile(resolve(import.meta.dirname,'plan.json'),'utf8')),campaign=resolve(import.meta.dirname,'campaign.mjs');
let active=null,majorBlocker=null;const completed=[],blocked={};
const exists=async p=>{try{await readFile(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const save=()=>writeFile(resolve(DIR,'driver-state.json'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,active,completed,blocked,majorBlocker,plan:plan.order,maximumConcurrentActors:1},null,2)+'\n');
async function execute(args,label,arm='A'){const file=resolve(DIR,label+'.log');await appendFile(file,'\n'+new Date().toISOString()+' '+JSON.stringify(args)+'\n');return new Promise(done=>{const child=spawn(process.execPath,args,{cwd:ROOT,env:{...process.env,SUFFICE_SAFEGUARDS_ARM:arm},stdio:['ignore','pipe','pipe']});let tail='';const add=b=>{tail=(tail+b).slice(-32768);void appendFile(file,b);};child.stdout.on('data',add);child.stderr.on('data',add);child.on('error',e=>{tail+=e.message;});child.on('close',code=>done({code,tail}));});}
try{
 active='model-free-setup';await save();
 for(const arm of ['A','B','C'])for(const mode of ['init','zero']){const r=await execute([campaign,mode],mode+'-'+arm,arm);if(r.code!==0)throw Error('Setup failed '+arm+' '+mode+': '+r.tail);}
 while(true){const r=await execute([campaign,'gate'],'launch-gate');if(r.code===0)break;if(Date.now()>=Date.parse(plan.deadline))throw Error('Calibration gate not released before deadline');active='waiting-for-original-ten';await save();await new Promise(r=>setTimeout(r,15000));}
 for(const task of plan.tasks){active='controls-'+task;await save();const r=await execute([campaign,'preflight',task],'controls-'+task);if(r.code!==0)throw Error('Controls failed '+task+': '+r.tail);}
 await appendFile(resolve(DIR,'launch.jsonl'),JSON.stringify({at:new Date().toISOString(),authorizedBy:'Human authorized bundled low safeguards versus xhigh; unchanged low control; no subagents',model:'gpt-6-luna',order:plan.order,plannedAggregateUsd:plan.plannedAggregateUsd})+'\n');
 for(const cell of plan.order){const id=cell.task+'-'+cell.arm;active=id;await save();if(await exists(resolve(DIR,'attempts',id,'result.json'))){completed.push(id);continue;}if(await exists(resolve(DIR,'attempts',id,'initial.json'))){blocked[id]='Partial attempt preserved; no retry';continue;}if(Date.now()>=Date.parse(plan.deadline)){blocked[id]='Not started before declared deadline';continue;}const r=await execute([campaign,'run',cell.task,cell.arm],'attempt-'+id,cell.arm);if(await exists(resolve(DIR,'attempts',id,'result.json')))completed.push(id);else blocked[id]='No result; exit '+r.code+'; preserve evaluator error and all events';await save();if(/unauthorized|invalid.grant|refresh.*(?:failed|expired)|sign.?in required|subscription required|auth.*revoked/i.test(r.tail)){majorBlocker='Authentication failure';break;}}
}catch(e){majorBlocker=String(e.stack);await appendFile(resolve(DIR,'driver-error.txt'),majorBlocker+'\n');}
finally{active=null;await execute([campaign,'report'],'report');await save();await lock.close();await unlink(resolve(DIR,'driver.lock'));}
