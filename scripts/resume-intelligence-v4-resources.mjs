// Audited recovery of a launch stopped before ANY provider request. Preserve
// the zero-request attempt; execute its first model attempt under suffix a1.
import {mkdir,readFile,writeFile,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {freemem} from 'node:os';
import {statfs} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {sourceInputs} from '../src/eval-v4/protocol.mjs';
import {LIMITS,COST_CEILINGS,v4CellId} from '../src/eval-v4/design.mjs';
import {writeLedger} from '../src/real-intelligence-eval.mjs';
import {hash} from '../src/workspace.mjs';
const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),load=async path=>JSON.parse(await readFile(path,'utf8')),protocol=await load(resolve(out,'protocol.json'));
if(JSON.stringify(await sourceInputs(root))!==JSON.stringify(protocol.inputs))throw new Error('Frozen source drift');
const round=protocol.schedule[0],pending=[];
for(const item of round){
  const cell=v4CellId(item);let prior;try{prior=await load(resolve(out,'attempts',cell+'-a0.summary.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!prior)pending.push({item,suffix:0});
  else if(prior.classification==='resource_stop'&&prior.providerRequests===0&&prior.totalEstimatedUsd===0)pending.push({item,suffix:1});
}
if(!pending.length)throw new Error('No eligible undispatched cells');
// The derived worker differs only in its storage suffix and attempt metadata.
const original=await readFile(resolve(root,'scripts/intelligence-v4-worker.mjs'),'utf8');
if(hash(Buffer.from(original))!==protocol.inputs['scripts/intelligence-v4-worker.mjs'])throw new Error('Original worker drift');
const generated=original.replace("const id=cell+'-a0'","const id=cell+'-a1'").replace('result.attempt=0;','result.attempt=1;');
if(generated===original||generated.replace("const id=cell+'-a1'","const id=cell+'-a0'").replace('result.attempt=1;','result.attempt=0;')!==original)throw new Error('Unexpected worker derivation');
const recoveryWorker=resolve(root,'scripts/intelligence-v4-recovery-worker.mjs');await writeFile(recoveryWorker,generated);
const amendment={version:1,at:new Date().toISOString(),reason:'Host resource floor stopped D before any provider request after A/B completed. Recover only zero-request, zero-cost resource launches and execute remaining never-dispatched cells; no coding-result retry.',originalProtocolSha256:hash(await readFile(resolve(out,'protocol.json'))),originalWorkerSha256:hash(original),derivedWorkerSha256:hash(generated),changes:['attempt storage suffix a0 -> a1','attempt metadata 0 -> 1'],unchanged:'Models, effort, prompts, tools, graph/controller, grading, resource floors and limits',limits:LIMITS,pending,cap:25};
const amendmentPath=resolve(out,'infrastructure/resource-recovery-amendment.json');
try{const old=await load(amendmentPath);if(old.derivedWorkerSha256!==amendment.derivedWorkerSha256)throw new Error('Recovery worker changed');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(amendmentPath,JSON.stringify(amendment,null,2),{flag:'wx'});}
while(true){const disk=await statfs(root),ready=freemem()>=2*1024**3&&disk.bavail*disk.bsize>=6*1024**3;
  await writeFile(resolve(out,'recovery-status.json'),JSON.stringify({status:ready?'resource_ready':'waiting_for_resources',at:new Date().toISOString(),freeRAM:freemem(),freeDisk:disk.bavail*disk.bsize,pending:pending.map(p=>v4CellId(p.item)),modelRequestsWhileWaiting:0},null,2));
  if(ready)break;if(!process.argv.includes('--wait')){console.log(JSON.stringify({event:'v4_recovery_waiting',modelRequests:0}));process.exit(75);}await new Promise(r=>setTimeout(r,20000));
}
const lockPath=resolve(root,'.suffice/native-evaluation.lock'),lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,kind:'v4-coordinator',recovery:true,at:new Date().toISOString()}));
const ledgerPath=resolve(out,'spending.json');let status='starting';
try{
  const ledger=await load(ledgerPath);if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Another inference is active');
  for(const {item,suffix}of pending){const key='repository-intelligence-v4/'+v4CellId(item)+'-a'+suffix,old=ledger.entries.find(e=>e.runId===key);if(old&&!(old.state==='not_started'&&old.reserved===0&&!old.unknown))throw new Error('Existing recovery attempt requires audit');if(old)Object.assign(old,{state:'reserved',reserved:COST_CEILINGS[item.model],known:0,unknown:true});else ledger.entries.push({runId:key,state:'reserved',reserved:COST_CEILINGS[item.model],known:0,unknown:true});}
  if(ledger.entries.reduce((s,e)=>s+e.reserved,0)>ledger.cap)throw new Error('Cap cannot reserve remaining original-round cells');await writeLedger(ledgerPath,ledger);
  for(const {item,suffix}of pending){
    const cell=v4CellId(item),id=cell+'-a'+suffix;await writeFile(resolve(out,'execution-status.json'),JSON.stringify({status:'running',cell,attempt:suffix,recovery:true,at:new Date().toISOString()},null,2));
    console.log(JSON.stringify({event:'v4_recovery_attempt_start',cell,attempt:suffix}));const start=performance.now();
    const code=await new Promise((done,reject)=>{const child=spawn(process.execPath,['--max-old-space-size=768',suffix?'scripts/intelligence-v4-recovery-worker.mjs':'scripts/intelligence-v4-worker.mjs','--cell='+cell],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));child.on('error',reject);child.on('close',done);});
    await writeFile(resolve(out,'attempts',id+'.execution.json'),JSON.stringify({workerWallMs:performance.now()-start,recoveryAmendmentSha256:hash(await readFile(amendmentPath)),actualWorkerSha256:hash(suffix?generated:original)},null,2));
    if(code!==0)throw new Error('Recovery worker exited '+code);
    const result=await load(resolve(out,'attempts',id+'.summary.json'));if(['resource_stop','infrastructure_or_evaluator_error','evaluator_failure','experimental_invalidation','provider_interruption','provider_failure'].includes(result.classification))throw new Error('Recovery stopped: '+result.classification);
  }
  status='recovery_complete';
}catch(error){status='recovery_audit_required';await writeFile(resolve(out,'infrastructure/recovery-error.json'),JSON.stringify({at:new Date().toISOString(),error:error.stack},null,2));process.exitCode=1;}
finally{const ledger=await load(ledgerPath);for(const e of ledger.entries)if(e.state==='reserved'&&pending.some(p=>e.runId==='repository-intelligence-v4/'+v4CellId(p.item)+'-a'+p.suffix))Object.assign(e,{state:'not_started',reserved:0,known:0,unknown:false});await writeLedger(ledgerPath,ledger);await writeFile(resolve(out,'recovery-status.json'),JSON.stringify({status,at:new Date().toISOString()},null,2));await lock.close();await unlink(lockPath);}
console.log(JSON.stringify({event:'v4_recovery_end',status}));
