// Durable scheduler for already validated task packages; not an agent policy.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,open} from 'node:fs/promises';
import {resolve} from 'node:path';
const ROOT=resolve(import.meta.dirname,'..'),DIR=resolve(ROOT,'.suffice/field-campaign-v1'),R=resolve(ROOT,'reports/field-campaign-v1');
await mkdir(DIR,{recursive:true});await mkdir(R,{recursive:true});
const lock=await open(resolve(DIR,'driver.lock'),'wx');await lock.writeFile(String(process.pid));
const target=['s02','i04','s01','s03','i01','i02','q01','q02','q03','i03','l01','l02','l03'],active=new Map(),blocked={},deadline=Date.parse('2026-10-15T13:00:00Z');
let major;
const json=p=>readFile(p,'utf8').then(JSON.parse),exists=async p=>{try{await readFile(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const save=async()=>writeFile(resolve(DIR,'driver-state.json'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,deadline:new Date(deadline).toISOString(),active:[...active.keys()],blocked,majorBlocker:major??null,target,scope:'Remote Linux only; two concurrent pairs maximum, paired order fixed; $10 ceiling per harness attempt.'},null,2));
async function done(id){const arms=id.startsWith('l')?['suffice']:['suffice','stock-pi'];return(await Promise.all(arms.map(arm=>exists(resolve(DIR,'attempts',id+'-'+arm,'result.json'))))).every(Boolean);}
async function authBlocked(){const dir=resolve(DIR,'attempts');let dirs;try{dirs=await readdir(dir,{withFileTypes:true});}catch{return false;}for(const d of dirs){if(!d.isDirectory())continue;try{const w=await json(resolve(dir,d.name,'worker/worker.json'));if((w.errors??[]).some(e=>/unauthorized|invalid.grant|refresh.*(?:failed|expired)|sign.?in required|subscription required|auth.*revoked/i.test(e)))return d.name;}catch{}}return false;}
function launch(id){const child=spawn(process.execPath,[resolve(ROOT,'scripts/sonion-campaign.mjs'),'run',id],{cwd:ROOT,stdio:['ignore','pipe','pipe']});active.set(id,child);const log=resolve(DIR,'driver-'+id+'.log');let text='';child.stdout.on('data',b=>{text+=b;void writeFile(log,text);});child.stderr.on('data',b=>{text+=b;void writeFile(log,text);});child.on('error',e=>{blocked[id]=e.message;active.delete(id);});child.on('close',async code=>{if(code!==0)blocked[id]='Evaluator process exit '+code+'; preserved receipts require inspection';active.delete(id);await save();});}
try{while(Date.now()<deadline){
 major=await authBlocked()||undefined;if(major){await save();break;}
 let complete=0;
 for(const id of target){if(await done(id)){complete++;continue;}if(active.has(id)||blocked[id]||active.size>=2)continue;let task;try{task=await json(resolve(DIR,'tasks',id,'task.json'));}catch{continue;}if(task.ready)launch(id);}
 await save();if(complete===target.length&&!active.size)break;await new Promise(r=>setTimeout(r,10000));
 }
 while(active.size)await new Promise(r=>setTimeout(r,2000));
 const child=spawn(process.execPath,[resolve(ROOT,'scripts/sonion-campaign.mjs'),'report'],{cwd:ROOT,stdio:'inherit'});await new Promise(r=>child.on('close',r));await save();
}finally{await lock.close();await (await import('node:fs/promises')).unlink(resolve(DIR,'driver.lock'));}
