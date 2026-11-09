import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {mkdir,readFile,writeFile,open,unlink,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir,freemem} from 'node:os';
import {hash,runNodeTests} from '../src/workspace.mjs';
import {runTrial,snapshot,allFiles} from '../src/intelligence-eval.mjs';
import {writeLedger} from '../src/real-intelligence-eval.mjs';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
import {sandboxOperations,lazySandboxOperations,stageToolchain,sandboxExecutable,binaryHash,publicWorkspaceRoot} from '../src/eval-v4/sandbox.mjs';
import {CONFIGURATIONS} from '../src/eval-v4/design.mjs';

const root=process.cwd(),base=resolve(root,'.suffice/intelligence-v4/preflight'),published=resolve(root,'reports/repository-intelligence-v4/preflight');
await mkdir(base,{recursive:true});await mkdir(published,{recursive:true});
const lockPath=resolve(root,'.suffice/native-evaluation.lock'),lock=await open(lockPath,'wx');
await lock.writeFile(JSON.stringify({kind:'v4-preflight',pid:process.pid,startedAt:new Date().toISOString()}));
const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),out=resolve(published,stamp);await mkdir(out);
const checks={phase:'preflight-only',at:new Date().toISOString(),sourceHead:null,models:[],sourceInputs:{},maxConcurrent:1,temperatureC:null,initialFreeRAM:freemem()};
try{
  const toolchain=await stageToolchain(root),baseline=resolve(publicWorkspaceRoot(),'probe-'+stamp,'baseline'),privateRoot=resolve(base,stamp,'private');
  for(const dir of ['src','test'])await mkdir(resolve(baseline,dir),{recursive:true});await mkdir(privateRoot,{recursive:true});
  const source={
    'src/names.mjs':"export const normalizeName=value=>String(value).trim().toLowerCase();\n",
    'src/account.mjs':"import {normalizeName} from './names.mjs';\nexport const accountKey=value=>'account:'+normalizeName(value);\n",
    'test/public.test.mjs':"import {test} from 'node:test';import assert from 'node:assert/strict';import {accountKey} from '../src/account.mjs';test('basic account normalization',()=>assert.equal(accountKey(' ALICE '),'account:alice'));\n",
    'native-verify.cjs':"require('child_process').execFileSync(process.execPath,['--test','test/public.test.mjs'],{stdio:'inherit'});\n"
  };
  for(const [path,text] of Object.entries(source))await writeFile(resolve(baseline,path),text);
  const acceptance=resolve(privateRoot,'acceptance.mjs'),canary=resolve(privateRoot,'canary.txt');
  await writeFile(canary,'PRIVATE_PREFLIGHT_ONLY');
  await writeFile(acceptance,"import {test} from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const {accountKey}=await import(pathToFileURL(process.env.SUFFICE_WORKSPACE+'/src/account.mjs'));test('collapse mixed interior whitespace',()=>assert.equal(accountKey('  ALIce\\t \\nSMITH '),'account:alice smith'));test('single whitespace stays valid',()=>assert.equal(accountKey(' alice smith '),'account:alice smith'));\n");
  const operations=await sandboxOperations({workspace:baseline,readableRoots:[toolchain],toolchain});
  try{await symlink(privateRoot,resolve(baseline,'private-link'),'junction');}catch(error){if(error.code!=='EEXIST')throw error;}
  const probe="const fs=require('fs'),cp=require('child_process');const denied=p=>{try{fs.readFileSync(p);return false;}catch{return true;}};const privatePath="+JSON.stringify(canary)+";const child=cp.execFileSync(process.execPath,['-e','try{require(\"fs\").readFileSync('+JSON.stringify(privatePath)+');process.exit(2)}catch{console.log(\"denied\")}'],{encoding:'utf8'}).trim();fs.writeFileSync('probe-write.txt','ok');const facts={absoluteDenied:denied(privatePath),linkDenied:denied('private-link/canary.txt'),childDenied:child==='denied',workspaceWritable:fs.readFileSync('probe-write.txt','utf8')==='ok'};fetch('https://example.com',{signal:AbortSignal.timeout(2500)}).then(()=>{console.log(JSON.stringify({...facts,networkDenied:false}));process.exit(2)},()=>{console.log(JSON.stringify({...facts,networkDenied:true}));if(!Object.values(facts).every(Boolean))process.exit(2)});";
  await writeFile(resolve(baseline,'probe.cjs'),probe);let probeOutput='';
  const probeResult=await operations.exec('node probe.cjs',baseline,{timeout:20,onData:b=>probeOutput+=b});
  checks.sandbox={...probeResult,output:probeOutput,executableSha256:await binaryHash(sandboxExecutable()),backend:'native Windows MXC',documentation:'https://learn.chatgpt.com/docs/windows/windows-sandbox#mxc-compatibility'};
  if(probeResult.exitCode!==0)throw new Error('Sandbox confidentiality probe failed: '+probeOutput);
  // Remove the deliberate junction and probe from the agent fixture, preserving its diagnostic.
  await unlink(resolve(baseline,'private-link'));await unlink(resolve(baseline,'probe.cjs'));await unlink(resolve(baseline,'probe-write.txt'));
  const graphDir=resolve(privateRoot,'graph'),engine=createIntelligence({workspace:baseline,cacheDir:graphDir});
  const first=await engine.get_symbol_context({name:'normalizeName'}),before=await engine.get_impact_analysis({paths:['src/names.mjs']});
  await writeFile(resolve(baseline,'src/names.mjs'),source['src/names.mjs'].replace('.trim()',".replace(/\\s+/g,' ').trim()"));
  const changed=await engine.get_impact_analysis({paths:['src/names.mjs']}),cached=await engine.get_symbol_context({name:'normalizeName'});
  checks.graph={first,before,changed,cached};
  if(!JSON.stringify(changed).includes('src/names.mjs'))throw new Error('Graph invalidation evidence missing');
  await writeFile(resolve(baseline,'src/names.mjs'),source['src/names.mjs']);
  const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,allowModelNetwork:false});
  if(!runtime.isUsingSubscription('openai'))throw new Error('Working subscription profile required; no paid-key fallback');
  for(const id of ['gpt-6-luna','gpt-6.1-sol']){const model=runtime.getModel('openai',id);if(!model)throw new Error('Missing exact model '+id);checks.models.push({id:model.id,api:model.api,contextWindow:model.contextWindow,maxTokens:model.maxTokens,cost:model.cost});}
  for(const path of ['scripts/preflight-intelligence-v4.mjs','src/eval-v4/sandbox.mjs','src/eval-v4/design.mjs',...(await allFiles(resolve(root,'packages/cli/src'))).map(path=>'packages/cli/src/'+path)])checks.sourceInputs[path]=hash(await readFile(resolve(root,path)));
  if(process.argv.includes('--models'))for(const configuration of CONFIGURATIONS){
    const id='smoke-'+configuration.id+'-'+stamp,runDir=resolve(publicWorkspaceRoot(),id),config={model:configuration.model,effort:configuration.effort,serviceTier:'default',maxOutputTokens:2048,maxTurns:12,maxToolCalls:40,timeout:120,maxCost:configuration.id==='D'?0.30:0.10,requestReserveUsd:configuration.id==='D'?0.03:0.01,maxProviderPayloadBytes:128*1024,retryCount:0,bashOperations:lazySandboxOperations({readableRoots:[toolchain],toolchain})};
    const task={id:'disjoint-preflight-whitespace',category:'simple',kind:'smoke-only',baseline,baselineHashes:await snapshot(baseline),sourceFiles:['src/names.mjs','src/account.mjs'],preparedAcceptance:acceptance,acceptanceHash:hash(await readFile(acceptance)),prompt:'Fix account-name normalization so every run of interior whitespace becomes one ordinary space. Preserve trimming and lowercasing. Edit only src/ files; preserve existing public tests and native-verify.cjs. The bash tool runs PowerShell 7 without a profile inside a Windows sandbox. Use node native-verify.cjs to verify. This is a small infrastructure smoke test.',allowsChange:path=>['src/names.mjs','src/account.mjs'].includes(path)||path.startsWith('.v4-tmp/')};
    task.verify=async workspace=>({acceptance:await runNodeTests(workspace,acceptance),regression:await runNodeTests(workspace,resolve(workspace,'test/public.test.mjs'))});
    const ledgerPath=resolve(root,'reports/repository-intelligence-eval-v2/spending.json'),ledger=JSON.parse(await readFile(ledgerPath,'utf8')),key='intelligence-v4/preflight/'+stamp+'/'+id;
    if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Another model attempt is active');
    if(ledger.entries.reduce((n,e)=>n+e.reserved,0)+config.maxCost>ledger.cap)throw new Error('Existing experiment cap prevents this preflight');
    const entry={runId:key,reserved:config.maxCost,known:0,unknown:true,state:'dispatched'};ledger.entries.push(entry);await writeLedger(ledgerPath,ledger);
    console.log(JSON.stringify({event:'v4_model_smoke_start',configuration}));
    try{const result=await runTrial({runtime,task,item:{task:task.id,arm:configuration.id,mode:configuration.mode,repetition:0},runDir,published:out,config});const events=(await readFile(resolve(out,id+'.events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);const requests=events.filter(e=>e.type==='provider_request'),receipts=events.filter(e=>e.type==='provider_usage'&&['response.completed','response.incomplete','response.failed','response.cancelled'].includes(e.eventType));
      result.receiptAudit={requests:requests.length,finalResponses:new Set(receipts.map(e=>e.responseId)).size,exactConfiguration:receipts.every(e=>e.model===configuration.model&&e.reasoning?.effort===configuration.effort&&e.serviceTier==='default')};
      if(result.receiptAudit.requests!==result.receiptAudit.finalResponses){result.totalEstimatedUsd=null;result.usage.costUnknown=true;}
      await writeFile(resolve(out,id+'.json'),JSON.stringify(result,null,2));entry.known=result.usage.estimatedApiUsd;entry.unknown=result.totalEstimatedUsd===null;entry.reserved=entry.unknown?config.maxCost:result.totalEstimatedUsd;entry.state='finished';await writeLedger(ledgerPath,ledger);
      checks.models.find(model=>model.id===configuration.model).smokes??=[];checks.models.find(model=>model.id===configuration.model).smokes.push({arm:configuration.id,success:result.success,audit:result.receiptAudit,usage:result.usage});console.log(JSON.stringify({event:'v4_model_smoke_end',arm:configuration.id,success:result.success,cost:result.totalEstimatedUsd,audit:result.receiptAudit}));
      if(!result.success||!result.receiptAudit.exactConfiguration||entry.unknown)throw new Error('Model smoke failed for '+configuration.id);
    }catch(error){if(entry.state==='dispatched'){entry.state='finished';entry.unknown=true;await writeLedger(ledgerPath,ledger);}throw error;}
  }
  checks.valid=true;
}catch(error){checks.valid=false;checks.error=error.stack;process.exitCode=1;}finally{await writeFile(resolve(out,'checks.json'),JSON.stringify(checks,null,2));await lock.close();await unlink(lockPath);}
console.log(JSON.stringify({event:'v4_preflight_end',valid:checks.valid,path:out,error:checks.error}));
