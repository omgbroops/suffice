import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {ARMS,random,allFiles} from './intelligence-eval.mjs';
import {hash} from './workspace.mjs';
export const REAL_CONFIG=Object.freeze({model:'gpt-6-luna',effort:'xhigh',serviceTier:'default',maxOutputTokens:16384,maxCost:0.5,timeout:1200,maxTurns:90,maxToolCalls:400,requestReserveUsd:0.25,retryCount:0,maxProviderPayloadBytes:1024**2,workspaceIsolation:'own-git-repository'});
export const CAMPAIGN='luna-xhigh-real-v3';
export async function writeLedger(path,ledger){const temporary=path+'.'+process.pid+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(ledger,null,2));await rename(temporary,path);}
export function realSchedule(tasks,seed=20261109){
  const rand=random(seed),shuffle=values=>values.map(value=>({value,rank:rand()})).sort((a,b)=>a.rank-b.rank).map(x=>x.value);
  const groups=['simple','cross-file','complex'].map(category=>shuffle(tasks.filter(t=>t.category===category)));
  if(groups.some(group=>group.length!==8))throw new Error('Expected eight tasks per category');
  const waves=[];
  for(let i=0;i<8;i++)for(let repetition=0;repetition<2;repetition++)waves.push(shuffle(groups.map(group=>group[i])).flatMap(task=>shuffle(ARMS).map(arm=>({task:task.id,category:task.category,arm:arm.id,mode:arm.mode,repetition}))));
  return waves;
}
export const cellId=item=>`${item.task}-${item.arm}-r${item.repetition}`;
export const runId=(item,attempt=0)=>`${cellId(item)}-a${attempt}`;
export const providerUnavailable=result=>result.status==='agent_error'&&/subscription_sharing_user_unavailable|OpenAI API error \((?:429|50[0234])\)/i.test(result.error??'');
export const providerFailure=result=>result.status==='agent_error'&&/OpenAI API error \(\d{3}\)|fetch failed|ECONNRESET|ETIMEDOUT/i.test(result.error??'');
export function reserveWave(ledger,items,campaign=CAMPAIGN){
  const entries=items.map(item=>({runId:campaign+'/'+runId(item),reserved:REAL_CONFIG.maxCost,known:0,unknown:true,state:'reserved'}));
  if(entries.some(entry=>ledger.entries.some(old=>old.runId===entry.runId&&!(old.state==='not_started'&&old.reserved===0&&old.known===0&&!old.unknown))))throw new Error('Existing model reservation requires audit');
  const previous=ledger.entries.filter(e=>!entries.some(n=>n.runId===e.runId));
  if(previous.reduce((sum,e)=>sum+e.reserved,0)+entries.reduce((sum,e)=>sum+e.reserved,0)>ledger.cap)return false;
  ledger.entries=[...previous,...entries];return true;
}
export async function realSourceInputs(root){
  const paths=['package.json','package-lock.json','.gitattributes','src/runtime.mjs','src/workspace.mjs','src/intelligence-eval.mjs','src/native-intelligence-eval.mjs','src/svelte-intelligence-pilot.mjs','src/classic-svelte-eval.mjs','src/real-intelligence-eval.mjs','scripts/intelligence-real-v3.mjs','scripts/intelligence-real-v3-worker.mjs','scripts/prepare-intelligence-real-v3.mjs','scripts/report-intelligence-real-v3.mjs','benchmarks/intelligence-svelte-outro-pilot/native-tests.cjs','benchmarks/intelligence-svelte-pilot/reporter.cjs',...(await allFiles(resolve(root,'packages/cli/src'))).map(p=>'packages/cli/src/'+p),...(await allFiles(resolve(root,'benchmarks/intelligence-real-v3'))).map(p=>'benchmarks/intelligence-real-v3/'+p)];
  return Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
}
