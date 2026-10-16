import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {executeIsolated,stageRuntime,ROOT} from './execution.mjs';
const dir=resolve(ROOT,'.suffice/codex-sol-xhigh-v1/setup');
await stageRuntime();await mkdir(resolve(dir,'public'),{recursive:true});
await writeFile(resolve(dir,'public/hello.txt'),'compatibility fixture\n');
const receipts=resolve(dir,process.env.SMOKE_ID??'codex-smoke-v2'),home=resolve(receipts,'codex-home');await mkdir(home,{recursive:true,mode:0o700});
await copyFile(resolve(ROOT,'.suffice/codex-native-home/auth.json'),resolve(home,'auth.json'));
await copyFile(resolve(ROOT,'.suffice/codex-native-home/models_cache.json'),resolve(home,'models_cache.json'));
const command=['node','/codexruntime/node_modules/@openai/codex/bin/codex.js','exec','--json','--dangerously-bypass-approvals-and-sandbox','--skip-git-repo-check','--model','gpt-6.1-sol','-c','model_reasoning_effort="xhigh"','-'];
const result=await executeIsolated({workspace:resolve(dir,'public'),receipts,codexHome:home,command,input:'Read hello.txt using your native shell tool. Reply with exactly READY if it says compatibility fixture. Do not change files, launch agents, or make network calls.',timeoutMs:90000});
console.log(JSON.stringify({exit:result.exitCode,seconds:result.latencyMs/1000,stdout:result.stdout.slice(-6000),stderr:result.stderr.slice(-1500)}));
async function walk(p){let all=[];for(const e of await readdir(p,{withFileTypes:true})){const q=resolve(p,e.name);if(e.isDirectory())all.push(...await walk(q));else if(e.name.endsWith('.jsonl'))all.push(q);}return all;}
for(const p of await walk(home)){
 console.log('ROLLOUT',p);
 const rows=(await readFile(p,'utf8')).split('\n').filter(Boolean).map(JSON.parse);
 console.log(JSON.stringify(rows.map(r=>({type:r.type,payloadType:r.payload?.type,keys:Object.keys(r.payload??{})}))));
 for(const r of rows)if(r.type==='token_usage_record')console.log(JSON.stringify({type:r.type,usage:r.payload.usage,response:r.payload.response_id}));
 for(const r of rows)if(r.type==='turn_context')console.log(JSON.stringify({type:r.type,model:r.payload.model,effort:r.payload.effort}));
}
