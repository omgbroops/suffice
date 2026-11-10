// User-selected Priority trial. Keep already-started tasks on default tier;
// use the provider's real serviceTier option on every arm of later tasks.
import {readFile,writeFile,mkdir,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {freemem} from 'node:os';
import {hash} from '../src/workspace.mjs';
import {sourceInputs} from '../src/eval-v4/protocol.mjs';
const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),base=resolve(root,'.suffice/intelligence-v4/priority'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const protocol=await load(resolve(out,'protocol.json')),memory=await load(resolve(out,'infrastructure/low-memory-amendment.json'));
if(JSON.stringify(await sourceInputs(root))!==JSON.stringify(protocol.inputs))throw new Error('Frozen source drift');
const ledger=await load(resolve(out,'spending.json'));if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Active or orphaned inference');
try{await readFile(resolve(root,'.suffice/native-evaluation.lock'));throw new Error('Serial lease active');}catch(e){if(e.code!=='ENOENT')throw e;}
const amendmentPath=resolve(out,'infrastructure/priority-amendment.json');let saved;
try{saved=await load(amendmentPath);}catch(e){if(e.code!=='ENOENT')throw e;}
const legacyTasks=saved?.policy.legacyTasks??[...new Set(ledger.entries.filter(e=>e.state==='finished'&&e.runId.startsWith('repository-intelligence-v4/')&&/-[ABCD]-r\d-a\d$/.test(e.runId)).map(e=>e.runId.split('/').at(-1).replace(/-[ABCD]-r\d-a\d$/,'')))];
const policy={phase:'priority-request-v1',authorization:'User selected keep xhigh and try Fast/Priority first.',legacyTasks,requestedTier:'priority',rawTierCaveat:'Both availability probes accepted Priority but reported default. Server-confirmed Priority is false unless raw receipts say priority. Installed Codex provider resolves a default response to requested Priority for pricing; this is not a measured speed guarantee.',pricing:'Installed SDK Priority estimate is 2x default catalog rates for these models. Emergency price ceilings and request reserves double on Priority tasks, preserving the default-tier inference allowance; total campaign cap stays $25.',memoryPolicySha256:memory.policySha256,unchanged:'Models, effort, task cohort/order, prompts, graph/controller, tools, grading, token/wall/tool budgets, heap limits and serial execution.',partialRoundRecovery:'Only never-dispatched slots may resume. Existing coding outcomes are never retried.'},policySha256=hash(JSON.stringify(policy));
await mkdir(base,{recursive:true});
const local=name=>'.suffice/intelligence-v4/priority/'+name+'.mjs',files={};
const replace=(source,before,after)=>{if(source.split(before).length!==2)throw new Error('Unexpected derivation: '+before);return source.replace(before,after);};
const rebase=source=>source.replace(/(from\s*|import\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,(_all,p,q,path)=>p+q+pathToFileURL(resolve(root,'scripts',path)).href+q);
let worker=await readFile(resolve(root,'scripts/intelligence-v4-worker.mjs'),'utf8');
worker=replace(worker,"const id=cell+'-a0'",`const priority=!${JSON.stringify(legacyTasks)}.includes(item.task), tier=priority?'priority':'default', priceFactor=priority?2:1;\nconst id=cell+'-a0'`);
worker=replace(worker,'resources[0].freeRAM<1.75*1024**3','resources[0].freeRAM<0.5*1024**3');
worker=replace(worker,"const catalog=catalogEntry(runtime.getModel('openai',item.model));",`if(priority){const stream=runtime.streamSimple.bind(runtime);runtime.streamSimple=(model,context,options)=>stream(model,context,{...options,serviceTier:'priority'});}\n  const catalog=catalogEntry(runtime.getModel('openai',item.model));`);
worker=replace(worker,'const config={...LIMITS,model:',"const config={...LIMITS,serviceTier:tier,model:");
worker=replace(worker,'maxCost:COST_CEILINGS[item.model],','maxCost:COST_CEILINGS[item.model]*priceFactor,');
worker=replace(worker,'requestCostReserve(catalog,payload,bytes),','requestCostReserve(catalog,payload,bytes)*priceFactor,');
worker=replace(worker,'version:1,item,limits:LIMITS',`version:1,resourcePolicyPhase:${JSON.stringify(memory.policy.phase)},servicePolicySha256:${JSON.stringify(policySha256)},requestedServiceTier:tier,item,limits:{...LIMITS,serviceTier:tier}`);
worker=replace(worker,'result.receiptAudit=receiptAudit(events,item);',`result.receiptAudit=receiptAudit(events,item);
  const requests=events.filter(e=>e.type==='provider_request'),receipts=events.filter(e=>e.type==='provider_usage'&&['response.completed','response.incomplete','response.failed','response.cancelled'].includes(e.eventType));
  result.requestedServiceTier=tier;result.reportedServiceTiers=[...new Set(receipts.map(e=>e.serviceTier))];result.serverConfirmedPriority=priority&&receipts.length>0&&receipts.every(e=>e.serviceTier==='priority');
  if(priority)result.receiptAudit.configurationMismatches=requests.filter(e=>e.model!==item.model||e.reasoning?.effort!==item.effort||e.serviceTier!=='priority').length+receipts.filter(e=>e.model!==item.model||e.reasoning?.effort!==item.effort||!['default','priority'].includes(e.serviceTier)).length;
  result.priorityPricingBasis=priority?'Installed SDK requested-Priority fallback; raw reported tier retained':'default catalog';`);
worker=replace(worker,'Math.max(COST_CEILINGS[item.model],entry.known)','Math.max(COST_CEILINGS[item.model]*priceFactor,entry.known)');
worker=replace(worker,'result.cellId=cell;result.attempt=0;',`result.resourcePolicyPhase=${JSON.stringify(memory.policy.phase)};result.servicePolicySha256=${JSON.stringify(policySha256)};result.cellId=cell;result.attempt=0;`);
let coordinator=await readFile(resolve(root,'scripts/intelligence-v4.mjs'),'utf8');
const reserveCode=`const priorityTasks=new Set(${JSON.stringify(legacyTasks)}), reservePending=(ledger,round)=>{
 const additions=[];for(const item of round){const runId=CAMPAIGN+'/'+v4CellId(item)+'-a0',old=ledger.entries.find(e=>e.runId===runId);if(old?.state==='finished')continue;if(old&&!(old.state==='not_started'&&old.reserved===0&&!old.unknown))throw new Error('Reserved or active cell requires audit');additions.push({runId,reserved:COST_CEILINGS[item.model]*(priorityTasks.has(item.task)?1:2),known:0,unknown:true,state:'reserved'});}
 const retained=ledger.entries.filter(old=>!additions.some(e=>e.runId===old.runId));if([...retained,...additions].reduce((s,e)=>s+e.reserved,0)>ledger.cap)return false;ledger.entries=[...retained,...additions];return true;
};\n`;
coordinator=replace(coordinator,"const lockPath=resolve(root,'.suffice/native-evaluation.lock')",reserveCode+"const lockPath=resolve(root,'.suffice/native-evaluation.lock')");
coordinator=replace(coordinator,"if(done.some(Boolean))throw new Error('Partial round requires audit; no automatic replay');","// Audited pause: resume only missing slots, never an existing outcome.");
coordinator=coordinator.replaceAll('reserveV4Round(structuredClone(await load(ledgerPath)),round)','reservePending(structuredClone(await load(ledgerPath)),round)').replaceAll('reserveV4Round(ledger,round)','reservePending(ledger,round)');
coordinator=replace(coordinator,'freemem()<2*1024**3','freemem()<0.75*1024**3');
coordinator=replace(coordinator,'for(const item of round){\n      status=',"for(const item of round.filter((_item,index)=>!done[index])){\n      try{const control=await load(resolve(out,'control.json'));if(control.pause){status='operator_pause';break outer;}}catch(e){if(e.code!=='ENOENT')throw e;}\n      status=");
coordinator=replace(coordinator,'scripts/intelligence-v4-worker.mjs',local('worker'));
let campaign=await readFile(resolve(root,'scripts/campaign-intelligence-v4.mjs'),'utf8');campaign=replace(campaign,'scripts/intelligence-v4.mjs',local('coordinator'));campaign=replace(campaign,'scripts/prepare-intelligence-v4.mjs','.suffice/intelligence-v4/low-memory/prepare.mjs');
for(const [name,source]of Object.entries({worker,coordinator,campaign})){const code=rebase(source);await writeFile(resolve(base,name+'.mjs'),code);files[name]={path:local(name),sha256:hash(code)};}
const amendment={version:1,at:new Date().toISOString(),policy,policySha256,files,baseProtocolSha256:hash(await readFile(resolve(out,'protocol.json')))};
if(saved){if(saved.policySha256!==policySha256||JSON.stringify(saved.files)!==JSON.stringify(files))throw new Error('Priority amendment drift');}else await writeFile(amendmentPath,JSON.stringify(amendment,null,2),{flag:'wx'});
if(process.argv.includes('--check-only')){console.log(JSON.stringify({event:'priority_derivation_verified',legacyTasks,policySha256,modelRequests:0}));process.exit(0);}
const run=(path)=>new Promise(done=>{const child=spawn(process.execPath,['--max-old-space-size=768',path],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));child.on('error',e=>done({code:1,error:e.message}));child.on('close',code=>done({code}));});
for(let cycle=0;cycle<100;cycle++){
 const disk=await statfs(root);if(disk.bavail*disk.bsize<6*1024**3)break;if(freemem()<0.75*1024**3){await new Promise(r=>setTimeout(r,20000));continue;}
 const result=await run(local('campaign')),state=await load(resolve(out,'execution-status.json'));await run('scripts/report-intelligence-v4.mjs');await run('scripts/archive-intelligence-v4-workspaces.mjs');console.log(JSON.stringify({event:'priority_campaign_status',...result,status:state.status}));if(state.status!=='resource_limited')break;await new Promise(r=>setTimeout(r,20000));
}
