import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hash} from '../workspace.mjs';
export const CAMPAIGN='repository-intelligence-v4';
export async function sourceInputs(root){
  const walk=async directory=>{const result=[];for(const item of (await readdir(resolve(root,directory),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=directory+'/'+item.name;if(item.isDirectory())result.push(...await walk(path));else if(item.isFile())result.push(path);}return result;};
  const paths=['package.json','package-lock.json','src/intelligence-eval.mjs','src/native-intelligence-eval.mjs','src/workspace.mjs','src/real-intelligence-eval.mjs','scripts/intelligence-v4.mjs','scripts/campaign-intelligence-v4.mjs','scripts/intelligence-v4-worker.mjs','scripts/prepare-intelligence-v4.mjs','scripts/regrade-intelligence-v4.mjs','scripts/preflight-intelligence-v4.mjs',...await walk('packages/cli/src'),...await walk('src/eval-v4'),...await walk('benchmarks/intelligence-v4')];
  return Object.fromEntries(await Promise.all(paths.sort().map(async path=>[path,hash(await readFile(resolve(root,path)))])));
}
export const catalogEntry=model=>({id:model.id,api:model.api,contextWindow:model.contextWindow,maxTokens:model.maxTokens,cost:model.cost});
export function receiptAudit(events,item){
  const requests=events.filter(e=>e.type==='provider_request'),receipts=events.filter(e=>e.type==='provider_usage'&&['response.completed','response.incomplete','response.failed','response.cancelled'].includes(e.eventType));
  return {requests:requests.length,finalUsageResponses:new Set(receipts.map(e=>e.responseId)).size,missingUsage:requests.length!==new Set(receipts.map(e=>e.responseId)).size,configurationMismatches:[...requests,...receipts].filter(e=>e.model!==item.model||e.reasoning?.effort!==item.effort||(e.serviceTier??'default')!=='default').length};
}
