import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {ROOT,LINUX_RUNTIME,executeIsolated} from './sonion-execution.mjs';
const DIR=resolve(ROOT,'.suffice/remote-ready'),limits=JSON.parse(await readFile(resolve(ROOT,'configs/general-v1.json'))).limits;
const save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const frozen=JSON.parse(await readFile(resolve(ROOT,'reports/general-v1/frozen-configuration.json'))),bad=[];
for(const[p,h]of Object.entries(frozen.inputs))if(createHash('sha256').update(await readFile(resolve(ROOT,p))).digest('hex')!==h)bad.push(p);
if(bad.length)throw new Error('Frozen general-v1 source changed: '+bad);
const privateRoot=resolve(DIR,'private');await mkdir(privateRoot,{recursive:true});await writeFile(resolve(privateRoot,'canary.txt'),'PRIVATE_EVALUATOR_CANARY\n',{mode:0o600});
const rows=[];
for(const arm of ['suffice','stock-pi']){
 const workspace=resolve(DIR,'fixture-'+arm),receipts=resolve(DIR,'smoke-'+arm);await mkdir(resolve(workspace,'tests'),{recursive:true});await writeFile(resolve(workspace,'README.md'),'Readiness fixture only. Run node --test tests/check.test.mjs. Do not edit files.\n');
 await writeFile(resolve(workspace,'tests/check.test.mjs'),`import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; test('node runtime',()=>assert.match(process.version,/^v24\\.15\\.0$/));test('private root is inaccessible',()=>assert.equal(fs.existsSync(${JSON.stringify(privateRoot)}),false));test('arithmetic',()=>assert.equal(2+2,4));\n`);
 const preflight=arm==='suffice'?await executeIsolated({workspace,receipts:resolve(DIR,'preflight-'+arm),command:['node','/runtime/src/general/entry.mjs'],input:JSON.stringify({prompt:'',limits,preflight:true}),privateRoots:[privateRoot],timeoutMs:60000}):null;
 if(preflight&&preflight.exitCode!==0)throw new Error('Suffice preflight failed; inspect remote preflight receipts');
 const prompt='Readiness check only, not a GitHub issue score. Use your tools to run `node --test tests/check.test.mjs` in this repository and report the number of passed tests. Do not edit files or request clarification.';
 const command=arm==='suffice'?['node','/runtime/src/general/entry.mjs']:['node','/runtime/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js','--mode','json','--provider','openai','--model','gpt-6.1-sol','--thinking','low','--offline','--no-session','-e','/runtime/src/external-pi-observer.mjs'];
 let previous;try{previous=JSON.parse(await readFile(resolve(receipts,'execution-result.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const result=previous??await executeIsolated({workspace,receipts,command,input:arm==='suffice'?JSON.stringify({prompt,limits}):prompt,privateRoots:[privateRoot],timeoutMs:180000});
 const events=(await readFile(resolve(receipts,'events.live.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),assistants=events.filter(e=>e.type==='assistant'),requests=events.filter(e=>e.type==='provider_request'),raw=[...new Map(events.filter(e=>e.type==='provider_usage').map(e=>[e.responseId,e])).values()];
 const cost=assistants.reduce((n,e)=>n+(e.usage?.cost?.total??0),0),calls=events.filter(e=>e.type==='tool_call'),testEvidence=events.filter(e=>e.type==='tool_result'&&!e.isError).some(e=>JSON.stringify(e).includes('pass 3')&&JSON.stringify(e).includes('fail 0'));
 const passed=result.exitCode===0&&requests.length>0&&requests.length===assistants.length&&raw.length===assistants.length&&requests.every(e=>e.model==='gpt-6.1-sol'&&e.reasoning?.effort==='low')&&testEvidence;
 rows.push({arm,passed,exitCode:result.exitCode,responses:assistants.length,rawResponses:raw.length,toolCalls:calls.length,privateIsolationTestPassed:testEvidence,apiEquivalentUsd:cost,latencyMs:result.latencyMs});await save(resolve(DIR,'readiness.partial.json'),{rows});if(!passed)throw new Error('Remote live model/tool smoke failed for '+arm+'; inspect receipts');
}
const proof={at:new Date().toISOString(),host:'sonion',workspace:ROOT,runtime:LINUX_RUNTIME,node:process.version,platform:process.platform,architecture:process.arch,freeMemoryBytes:os.freemem(),coreInputsMatch:true,coreInputs:frozen.inputs,rows,passed:rows.length===2&&rows.every(r=>r.passed),knownSetupApiEquivalentUsd:rows.reduce((n,r)=>n+r.apiEquivalentUsd,0),benchmarkAttempts:0,scope:'Real subscription Sol-low calls and native/codemode tool execution on remote Linux; private canary remains inaccessible. Readiness fixture, not issue benchmark performance.'};await save(resolve(DIR,'readiness.json'),proof);console.log(JSON.stringify({passed:proof.passed,rows,knownSetupApiEquivalentUsd:proof.knownSetupApiEquivalentUsd}));
