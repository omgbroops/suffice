import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {executeIsolated,stageRuntime,ROOT} from './general-execution.mjs';
await stageRuntime();
const dir=resolve(ROOT,'.suffice/boundary-validation',new Date().toISOString().replaceAll(/[:.]/g,'-'));await mkdir(dir,{recursive:true});
const workspace=resolve(ROOT,'.suffice/compat/repo');
const timeout=await executeIsolated({workspace,receipts:resolve(dir,'timeout'),command:['node','/workspace/scripts/linger.cjs'],timeoutMs:1000});
await new Promise(r=>setTimeout(r,3300));
let childLeaked=false;try{await readFile(resolve(workspace,'timeout-leak'));childLeaked=true;}catch(e){if(e.code!=='ENOENT')throw e;}
const output=await executeIsolated({workspace,receipts:resolve(dir,'output'),command:['node','-e',"process.stdout.write('x'.repeat(8192));setInterval(()=>{},1000)"],timeoutMs:10000,maxOutputBytes:1024});
const passed=timeout.exitCode===124&&!childLeaked&&output.outputLimited&&output.exitCode!==0;
const result={at:new Date().toISOString(),inferenceCalls:0,timeout:{exitCode:timeout.exitCode,latencyMs:timeout.latencyMs,childLeaked},output:{exitCode:output.exitCode,latencyMs:output.latencyMs,outputLimited:output.outputLimited},passed,raw:dir};
await writeFile(resolve(ROOT,'reports/general-v1/boundary-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!passed)process.exitCode=1;
