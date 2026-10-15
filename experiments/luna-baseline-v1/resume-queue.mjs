// Complete setup-only gaps, then launch only cases with no previous actor request.
import {spawn} from 'node:child_process';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const ROOT=resolve(import.meta.dirname,'../..'),DIR=resolve(ROOT,'.suffice/luna-baseline-v2');
process.chdir(ROOT);process.env.PATH='/home/eric_qin/suffice-general-runtime/bin:/usr/bin:/bin';
const prior=await readFile(resolve(DIR,'driver-state.json'),'utf8');await writeFile(resolve(DIR,'driver-state-before-patch-completion.json'),prior,{flag:'wx'});
const log=resolve(DIR,'queue-control-completion.log');
async function execute(args){await appendFile(log,'\n'+new Date().toISOString()+' '+JSON.stringify(args)+'\n');return new Promise(done=>{const p=spawn(process.execPath,args,{cwd:ROOT,env:process.env,stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>void appendFile(log,b));p.stderr.on('data',b=>void appendFile(log,b));p.on('error',e=>void appendFile(log,e.message));p.on('close',done);});}
for(const task of ['q01','q02']){
 try{const events=await readFile(resolve(DIR,'attempts',task+'-suffice/worker/events.live.jsonl'),'utf8');if(events.includes('provider_request'))throw new Error('Actor already called a model: '+task);}catch(e){if(e.code!=='ENOENT')throw e;}
 const code=await execute([resolve(import.meta.dirname,'complete-queue-controls.mjs'),task]);if(code!==0)throw new Error('Setup completion failed for '+task+'; preserve receipts');
}
const code=await execute([resolve(import.meta.dirname,'driver.mjs')]);if(code!==0)throw new Error('Serial resume process failed');
// Reporting is deterministic and outside actor environments.
const report=spawn('python3',[resolve(import.meta.dirname,'report.py')],{cwd:ROOT,env:process.env,stdio:['ignore','pipe','pipe']});report.stdout.on('data',b=>void appendFile(log,b));report.stderr.on('data',b=>void appendFile(log,b));await new Promise(done=>report.on('close',done));
