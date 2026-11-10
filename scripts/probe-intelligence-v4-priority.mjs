import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {mkdir,readFile,writeFile,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {createSufficeSession} from '../packages/cli/src/session.mjs';
import {parseOptions} from '../packages/cli/src/options.mjs';
import {publicWorkspaceRoot} from '../src/eval-v4/sandbox.mjs';
import {writeLedger} from '../src/real-intelligence-eval.mjs';
const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),directory=resolve(out,'priority-probe',stamp),lockPath=resolve(root,'.suffice/native-evaluation.lock');
let lock;for(let i=0;i<150;i++){try{lock=await open(lockPath,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,2000));}}if(!lock)throw new Error('Serial lease never became available');
await lock.writeFile(JSON.stringify({kind:'v4-priority-probe',pid:process.pid}));await mkdir(directory,{recursive:true});
const results=[];
try{
  const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,allowModelNetwork:false});if(!runtime.isUsingSubscription('openai'))throw new Error('No fallback authentication');
  for(const [model,effort,maxCost]of [['gpt-6-luna','xhigh',0.1],['gpt-6.1-sol','medium',0.3]]){
    const ledgerPath=resolve(out,'spending.json'),ledger=JSON.parse(await readFile(ledgerPath,'utf8'));if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Another model is active');
    if(ledger.entries.reduce((s,e)=>s+e.reserved,0)+maxCost>ledger.cap)throw new Error('Cap prevents probe');
    const entry={runId:'repository-intelligence-v4/priority-probe/'+stamp+'/'+model,reserved:maxCost,known:0,unknown:true,state:'dispatched'};ledger.entries.push(entry);await writeLedger(ledgerPath,ledger);
    const workspace=resolve(publicWorkspaceRoot(),'priority-probe-'+stamp+'-'+model),home=resolve(root,'.suffice/intelligence-v4/priority-probe',stamp,model);await mkdir(workspace,{recursive:true});
    let agent,result;const start=performance.now();
    try{
      agent=await createSufficeSession({...parseOptions([]),cwd:workspace,home,model,effort,intelligence:'off',serviceTier:'priority',maxCost,requestReserveUsd:0.02,maxOutputTokens:1024,maxTurns:2,maxToolCalls:0,timeout:60,retryCount:0},runtime);
      let error;try{await agent.run('Reply exactly OK. Do not invoke any tools. This is a service-tier availability probe.');}catch(e){error=e.message;}await agent.dispose();
      const events=(await readFile(agent.eventPath,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),requests=events.filter(e=>e.type==='provider_request'),receipts=events.filter(e=>e.type==='provider_usage'&&['response.completed','response.incomplete','response.failed','response.cancelled'].includes(e.eventType)),servedTiers=[...new Set(receipts.map(e=>e.serviceTier))];
      result={model,effort,requestedTier:'priority',servedTiers,requests:requests.length,finalResponses:new Set(receipts.map(e=>e.responseId)).size,confirmedPriority:servedTiers.length>0&&servedTiers.every(t=>t==='priority'),error,elapsedMs:performance.now()-start,usage:agent.totals,phase:'availability-probe-only; not an engineering attempt or a controlled speed benchmark'};
      await writeFile(resolve(directory,model+'.events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
      entry.known=agent.totals.estimatedApiUsd;entry.unknown=agent.totals.costUnknown||result.requests!==result.finalResponses;
      // The SDK has a Codex-specific default-tier fallback. Keep raw server
      // tiers visible; do not call a successful default response confirmed Fast.
      if(!result.confirmedPriority&&receipts.length){result.priorityPricingUnconfirmed=true;entry.unknown=true;}
      entry.reserved=entry.unknown?maxCost:entry.known;
    }catch(error){result={model,effort,error:error.stack,confirmedPriority:false};entry.unknown=true;}
    finally{await agent?.dispose();entry.state='finished';await writeLedger(ledgerPath,ledger);}
    results.push(result);await writeFile(resolve(directory,model+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({event:'priority_probe_result',model,confirmedPriority:result.confirmedPriority,servedTiers:result.servedTiers,error:result.error,elapsedMs:result.elapsedMs}));
  }
}finally{await writeFile(resolve(directory,'summary.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));await lock.close();await unlink(lockPath);}
