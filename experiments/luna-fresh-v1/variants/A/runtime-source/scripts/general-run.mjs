import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {executeIsolated,stageRuntime,ROOT} from './general-execution.mjs';
// Trusted operator supplies workspace, receipt directory and public task text.
const [workspace,receipts,taskFile]=process.argv.slice(2);if(!taskFile)throw new Error('Usage: node scripts/general-run.mjs WORKSPACE RECEIPTS PUBLIC_TASK.txt');
const profile=JSON.parse(await readFile(resolve(ROOT,'configs/general-v1.json'))),prompt=await readFile(resolve(taskFile),'utf8');
await stageRuntime();
const result=await executeIsolated({workspace:resolve(workspace),receipts:resolve(receipts),command:['node','/runtime/src/general/entry.mjs'],input:JSON.stringify({prompt,limits:profile.limits}),timeoutMs:profile.limits.timeoutMs+10000});
console.log(result.stdout);if(result.exitCode!==0){console.error(result.stderr);process.exitCode=1;}
