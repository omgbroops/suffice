// Continue the frozen serial campaign after a zero-request resource launch.
// A coding outcome or request with unknown usage is never retried.
import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {freemem} from 'node:os';
import {sourceInputs} from '../src/eval-v4/protocol.mjs';
import {writeLedger} from '../src/real-intelligence-eval.mjs';
import {hash} from '../src/workspace.mjs';
const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const protocol=await load(resolve(out,'protocol.json')),amendment=await load(resolve(out,'infrastructure/priority-amendment.json'));
if(JSON.stringify(await sourceInputs(root))!==JSON.stringify(protocol.inputs))throw new Error('Frozen source drift');
const original=await readFile(resolve(root,amendment.files.worker.path),'utf8');
if(hash(original)!==amendment.files.worker.sha256)throw new Error('Priority worker drift');
const worker=original.replace("const id=cell+'-a0'","const id=cell+'-a1'").replace('result.attempt=0;','result.attempt=1;');
if(worker.replace("const id=cell+'-a1'","const id=cell+'-a0'").replace('result.attempt=1;','result.attempt=0;')!==original||worker===original)throw new Error('Unexpected recovery derivation');
const workerPath=resolve(root,'.suffice/intelligence-v4/priority/resource-recovery-worker.mjs');
await writeFile(workerPath,worker);
const run=(file,args=[])=>new Promise((done,reject)=>{const child=spawn(process.execPath,['--max-old-space-size=768',file,...args],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));child.on('error',reject);child.on('close',code=>done(code));});
const recoverable=async()=>{
 const pending=[];
 for(const item of protocol.schedule.flat()){
  const cell=`${item.task}-${item.arm}-r${item.repetition}`;let prior;
  try{prior=await load(resolve(out,'attempts',cell+'-a0.summary.json'));}catch(e){if(e.code!=='ENOENT')throw e;continue;}
  if(prior.classification!=='resource_stop'||prior.providerRequests!==0||prior.totalEstimatedUsd!==0)continue;
  try{await readFile(resolve(out,'attempts',cell+'-a1.summary.json'));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  pending.push({item,cell,prior});
 }
 return pending;
};
if(process.argv.includes('--check-only')){console.log(JSON.stringify({event:'resource_continuation_verified',modelRequests:0,workerSha256:hash(worker),eligible:(await recoverable()).map(p=>p.cell)}));process.exit(0);}
for(let cycle=0;cycle<48;cycle++){
 const pending=await recoverable();
 if(pending.length){
  while(freemem()<0.75*1024**3){console.log(JSON.stringify({event:'resource_recovery_wait',modelRequests:0}));await new Promise(r=>setTimeout(r,20000));}
  const lockPath=resolve(root,'.suffice/native-evaluation.lock'),lock=await open(lockPath,'wx');
  await lock.writeFile(JSON.stringify({pid:process.pid,kind:'v4-coordinator',recovery:true,at:new Date().toISOString()}));
  try{
   const ledgerPath=resolve(out,'spending.json'),ledger=await load(ledgerPath);
   if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Active or orphaned inference');
   // Only these complete, explicitly default-tier probe receipts were pricing-unknown.
   const corrections=(await load(resolve(out,'infrastructure/priority-provider-correction.json'))).probeLedgerReconciliation;
   for(const correction of corrections){const entry=ledger.entries.find(e=>e.runId===correction.before.runId);if(entry?.state==='finished'&&entry.unknown&&entry.known===correction.after.known)Object.assign(entry,correction.after);}
   await writeLedger(ledgerPath,ledger);
   for(const {item,cell,prior}of pending){
    const id=cell+'-a1',current=await load(ledgerPath),factor=amendment.policy.legacyTasks.includes(item.task)?1:2;
    const round=protocol.schedule.find(round=>round.some(i=>`${i.task}-${i.arm}-r${i.repetition}`===cell));
    let future=0;for(const next of round){try{await readFile(resolve(out,'attempts',`${next.task}-${next.arm}-r${next.repetition}-a0.summary.json`));}catch(e){if(e.code!=='ENOENT')throw e;future+=protocol.costCeilings[next.model]*factor;}}
    const entry={runId:'repository-intelligence-v4/'+id,state:'reserved',known:0,reserved:protocol.costCeilings[item.model]*factor,unknown:true};
    if(current.entries.some(e=>e.runId===entry.runId))throw new Error('Recovery slot already exists; audit required');
    if(current.entries.reduce((s,e)=>s+e.reserved,0)+entry.reserved+future>current.cap)throw new Error('Cannot reserve remaining balanced round');
    const receipt={at:new Date().toISOString(),cell,attempt:1,priorClassification:prior.classification,priorProviderRequests:prior.providerRequests,priorCost:prior.totalEstimatedUsd,originalWorkerSha256:hash(original),derivedWorkerSha256:hash(worker),changes:['storage suffix a0 -> a1','attempt metadata 0 -> 1'],unchanged:'Existing Priority/low-memory policies; exact models, efforts, prompts, graph, tools, grading and limits. One concurrent attempt.'};
    const receiptPath=resolve(out,'infrastructure',id+'-resource-recovery.json');await writeFile(receiptPath,JSON.stringify(receipt,null,2),{flag:'wx'});
    current.entries.push(entry);await writeLedger(ledgerPath,current);
    await writeFile(resolve(out,'execution-status.json'),JSON.stringify({status:'running',cell,attempt:1,recovery:true,target:192,at:new Date().toISOString()},null,2));
    const start=performance.now(),code=await run(workerPath,['--cell='+cell]);
    await writeFile(resolve(out,'attempts',id+'.execution.json'),JSON.stringify({workerWallMs:performance.now()-start,finishedAt:new Date().toISOString(),recoveryReceiptSha256:hash(await readFile(receiptPath))},null,2));
    const result=await load(resolve(out,'attempts',id+'.summary.json'));
    if(code!==0||!['completed','budget_or_incomplete'].includes(result.classification))throw new Error('Recovery requires audit: '+result.classification);
   }
  }finally{await lock.close();await unlink(lockPath);}
 }
 const code=await run(resolve(root,'scripts/run-intelligence-v4-priority.mjs'));
 const state=await load(resolve(out,'execution-status.json'));
 if(code!==0||state.status!=='resource_stop'||!(await recoverable()).length)break;
}
