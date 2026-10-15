// Deterministic setup proof only. Never calls session.prompt or a provider.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,executeIsolated,LINUX_RUNTIME} from './execution.mjs';
const dir=resolve(ROOT,'.suffice/luna-baseline-v1/setup'),workspace=resolve(dir,'public'),privateRoot=resolve(dir,'private');
await mkdir(workspace,{recursive:true});await mkdir(privateRoot,{recursive:true});
await writeFile(resolve(workspace,'README.md'),'Zero-inference startup fixture only.\n');
await writeFile(resolve(privateRoot,'canary.txt'),'LUNA_PRIVATE_CANARY\n',{mode:0o600});
const catalog=JSON.parse(await readFile(resolve(ROOT,'experiments/luna-baseline-v1/model-catalog.json'),'utf8'));
const limits={maxCostUsd:10,maxTurns:60,maxCalls:240,timeoutMs:600000,commandTimeout:180};
const startup=await executeIsolated({workspace,receipts:resolve(dir,'startup'),command:['node','/runtime/src/general/entry.mjs'],input:JSON.stringify({prompt:'',limits,preflight:true}),privateRoots:[privateRoot,resolve(ROOT,'research')],timeoutMs:45000});
const events=(await readFile(resolve(dir,'startup/events.live.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const ready=events.find(e=>e.type==='startup'),requests=events.filter(e=>e.type==='provider_request');
const source=await readFile(resolve(ROOT,'src/general/agent.mjs'),'utf8');
const parentPrompt=source.split('\n').find(line=>line.startsWith('export const PROMPT=')).slice("export const PROMPT='".length,-2);
const code=`import fs from 'node:fs';import assert from 'node:assert/strict';assert.equal(fs.existsSync(${JSON.stringify(privateRoot)}),false);assert.equal(fs.existsSync(${JSON.stringify(resolve(ROOT,'research'))}),false);assert.equal(fs.existsSync('/runtime/experiments/luna-baseline-v1/PROTOCOL.md'),false);assert.match(process.version,/^v24\\.15\\.0$/);let denied=false;try{fs.writeFileSync('/runtime/private-write-probe','denied');}catch{denied=true;}assert.equal(denied,true);fs.writeFileSync('/workspace/public-write-probe','ok');console.log('private denied; runtime read-only; workspace writable; Node pinned');`;
const boundary=await executeIsolated({workspace,receipts:resolve(dir,'boundary'),command:['node','--input-type=module','-e',code],privateRoots:[privateRoot,resolve(ROOT,'research')],network:false,timeoutMs:30000});
const manifest=JSON.parse(await readFile(resolve(ROOT,'experiments/luna-baseline-v1/source-manifest.json'),'utf8'));
const bad=[];for(const[p,e]of Object.entries(manifest.inputs)){const b=await readFile(resolve(LINUX_RUNTIME,'app',p));if(createHash('sha256').update(b).digest('hex')!==e.variantSha256)bad.push(p);}
const proof={at:new Date().toISOString(),version:'luna-baseline-v1',inferenceCalls:requests.length,sourceInputs:14,sourceMismatches:bad,model:ready?.model,promptUnchanged:ready?.systemPrompt===parentPrompt,activeTools:ready?.activeTools,startupExit:startup.exitCode,boundaryExit:boundary.exitCode,boundaryStdout:boundary.stdout,catalogPricingMatches:JSON.stringify(ready?.model.cost)===JSON.stringify(catalog.model.cost),status:'prepared-only; no actor request authorized'};
proof.passed=startup.exitCode===0&&boundary.exitCode===0&&requests.length===0&&bad.length===0&&proof.promptUnchanged&&ready?.model.id==='gpt-6-luna'&&proof.catalogPricingMatches&&ready.activeTools.includes('codemode');
await writeFile(resolve(ROOT,'experiments/luna-baseline-v1/setup-proof.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));if(!proof.passed)process.exitCode=1;
