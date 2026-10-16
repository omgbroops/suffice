import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {executeIsolated,stageRuntime,ROOT} from './execution.mjs';
const dir=resolve(ROOT,'.suffice/codex-sol-xhigh-v1/setup/model-free-v2'),workspace=resolve(dir,'public'),privateRoot=resolve(dir,'hidden');
await mkdir(workspace,{recursive:true});await mkdir(privateRoot,{recursive:true});await stageRuntime();
await writeFile(resolve(privateRoot,'canary.txt'),'PRIVATE');
const result=await executeIsolated({workspace,receipts:resolve(dir,'suffice'),command:['node','/runtime/src/general/entry.mjs'],privateRoots:[privateRoot],input:JSON.stringify({prompt:'',preflight:true,limits:{maxCostUsd:10,maxTurns:60,maxCalls:240,timeoutMs:600000,commandTimeout:180}}),timeoutMs:45000});
const events=(await readFile(resolve(dir,'suffice/events.live.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse),startup=events.find(e=>e.type==='startup');
const home=resolve(dir,'codex-home');await mkdir(home,{recursive:true,mode:0o700});await copyFile(resolve(ROOT,'.suffice/codex-native-home/auth.json'),resolve(home,'auth.json'));
const checks=[];
for(const arm of ['suffice','codex']){
 const r=await executeIsolated({workspace,receipts:resolve(dir,'boundary-'+arm),codexHome:arm==='codex'?home:null,privateRoots:[privateRoot],network:false,command:['node','--input-type=module','-e',`import fs from 'node:fs';import assert from 'node:assert/strict';assert(!fs.existsSync(${JSON.stringify(privateRoot)}));assert(!fs.existsSync(${JSON.stringify(resolve(ROOT,'research'))}));assert(!fs.existsSync(${JSON.stringify(resolve(ROOT,'.suffice/field-campaign-v1/tasks'))}));fs.writeFileSync('compat-'+${JSON.stringify(arm)}+'.mjs','export const value=1;');await import('./compat-'+${JSON.stringify(arm)}+'.mjs');let denied=false;try{fs.writeFileSync('/runtime/outside-write','x');}catch{denied=true;}assert(denied);console.log('private access denied; repository writes and Node commands work');`],timeoutMs:30000});checks.push({arm,exit:r.exitCode});
}
const proof={model:startup?.model,systemPrompt:startup?.systemPrompt,activeTools:startup?.activeTools,inferenceCalls:events.filter(e=>e.type==='provider_request').length,sufficeStartupExit:result.exitCode,checks};
proof.passed=proof.inferenceCalls===0&&result.exitCode===0&&checks.every(c=>c.exit===0)&&startup?.model.id==='gpt-6.1-sol'&&JSON.stringify(startup.model.cost)===JSON.stringify({input:2,output:10,cacheRead:.1,cacheWrite:2.5,tiers:[{inputTokensAbove:272000,input:4,output:15,cacheRead:.2,cacheWrite:5}]});
await writeFile(resolve(dir,'proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));if(!proof.passed)throw Error('Zero preflight failed');
