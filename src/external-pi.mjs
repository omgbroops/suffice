import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,appendFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,stateDir,createRuntime} from './runtime.mjs';
import {accountEvents} from '../scripts/audit-benchmark-receipts.mjs';

export async function authorizedRuntime(){for(const key of Object.keys(process.env))if(/API_KEY$|AUTH_TOKEN$|OAUTH_TOKEN$/.test(key))delete process.env[key];const runtime=await createRuntime();if(!runtime.getModel('openai','gpt-6.1-sol')||!runtime.isUsingSubscription('openai'))throw new Error('Sol subscription required, no fallback');if(!await runtime.getAuth('openai'))throw new Error('Subscription preflight failed');return runtime;}
export const cliPath=resolve(root,'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
export function stockArgs({preflight=false}){return ['--mode',preflight?'rpc':'json','--provider','openai','--model','gpt-6.1-sol','--thinking','low','--offline','--no-session','-e',resolve(root,'src/external-pi-observer.mjs')];}
export function accountStock(events,{exitCode,transportFailed=false}={}){
 const a=accountEvents(events),requests=events.filter(e=>e.type==='provider_request').length;
 // A non-conversation/background request must not silently disappear from costs.
 const auxiliaryOrMissing=Math.abs(requests-a.assistantEvents);
 return {...a,requests,auxiliaryOrMissing,unknown:a.unknown||auxiliaryOrMissing>0||transportFailed||exitCode!==0};
}
export async function runStockPi({workspace,prompt,runDir,limits,preflight=false}){
 await mkdir(runDir,{recursive:true});const started=Date.now(),args=stockArgs({preflight});
 const env={...process.env,PI_CODING_AGENT_DIR:resolve(stateDir,'pi'),PI_OFFLINE:'1',PI_TELEMETRY:'0',SUFFICE_OBSERVER_DIR:runDir,SUFFICE_OBSERVER_LIMITS:JSON.stringify(limits)};
 // Prevent ambient API-key billing. CLI still resolves normal file-backed OAuth.
 for(const key of Object.keys(env))if(/API_KEY$|AUTH_TOKEN$|OAUTH_TOKEN$/.test(key))delete env[key];
 await writeFile(resolve(runDir,'invocation.json'),JSON.stringify({executable:process.execPath,cliPath,args,cwd:workspace,prompt,environment:'Same inherited PATH/SystemRoot; canonical Pi OAuth directory, offline startup catalog, telemetry disabled; ambient API-key variables removed. No tool, system-prompt, compaction, retry, or codemode overrides.',preflight},null,2));
 return new Promise((resolveRun,reject)=>{
  const child=spawn(process.execPath,[cliPath,...args],{cwd:workspace,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let pending='',stderr='',exitCode,timeout=false,transportFailed=false,deltas=0,lastPartial,tail=Promise.resolve(),done=false;
  const output=e=>{tail=tail.then(()=>appendFile(resolve(runDir,'stdout.jsonl'),JSON.stringify(e)+'\n'));};
  const timer=setTimeout(()=>{timeout=true;child.kill();},preflight?30000:limits.timeoutMs);
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{pending+=chunk;let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch{transportFailed=true;output({type:'unparsed_stdout',text:line});continue;}if(event.type==='message_update'){deltas++;lastPartial=event;}else output(event);if(preflight&&event.type==='response'&&event.command==='get_state')child.stdin.end();}});
  child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>100000)stderr=stderr.slice(-100000);});
  child.on('error',error=>{transportFailed=true;stderr+=String(error);});
  child.on('close',async code=>{if(done)return;done=true;clearTimeout(timer);try{
   exitCode=code;if(pending.trim())output({type:'incomplete_stdout',text:pending});await tail;
   await writeFile(resolve(runDir,'stderr.txt'),stderr);if(lastPartial)await writeFile(resolve(runDir,'last-stream-update.json'),JSON.stringify(lastPartial));
   let events=[];try{await copyFile(resolve(runDir,'events.live.jsonl'),resolve(runDir,'events.jsonl'));events=(await readFile(resolve(runDir,'events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code!=='ENOENT')throw e;}
   const a=accountStock(events,{exitCode,transportFailed:transportFailed||timeout}),last=events.filter(e=>e.type==='assistant').at(-1),stop=events.find(e=>e.type==='benchmark_stop');
   const status=timeout?'timeout':stop?.reason??(transportFailed?'transport_error':!last&&!preflight?'startup_error':['error','aborted'].includes(last?.stopReason)?'provider_error':exitCode===0?'completed':'cli_error');
   const out={status,turns:a.assistantEvents,calls:events.filter(e=>e.type==='tool_call').length,usage:a.usage,usageCostUnknown:a.unknown,errors:events.filter(e=>e.type==='assistant'&&e.stopReason==='error').map(e=>e.error),exitCode,latencyMs:Date.now()-started,requests:a.requests,auxiliaryOrMissing:a.auxiliaryOrMissing,discardedStreamingUpdates:deltas,streamPolicy:'Only message_update deltas omitted from stdout archive; all finalized replies, retries, tool calls/results and observer receipts retained. Last partial update retained for incomplete output.'};
   await writeFile(resolve(runDir,'process.json'),JSON.stringify(out,null,2));resolveRun(out);
  }catch(e){reject(e);}});
  if(preflight)child.stdin.write(JSON.stringify({id:'preflight',type:'get_state'})+'\n');else child.stdin.end(prompt);
 });
}
