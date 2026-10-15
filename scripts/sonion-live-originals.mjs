import {readFile,writeFile,cp,mkdir,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,executeIsolated} from './sonion-execution.mjs';
for(const task of ['l01','l02','l03']){
 const dir=resolve(ROOT,'.suffice/field-campaign-v1/tasks',task),manifest=JSON.parse(await readFile(resolve(dir,'task.json'),'utf8')),research=resolve(ROOT,'research/field-campaign-v1/live',task),body=manifest.publicBody;
 const match=/```(?:js|javascript)\n([\s\S]*?)```/.exec(body);if(!match)throw new Error('No inline JavaScript reproduction');
 const original=match[1],adapted=task==='l01'?original.replace("require('workerpool')","require('./src/index.js')"):task==='l02'?original.replace("from 'p-wait-for'","from './index.js'"):original;
 await writeFile(resolve(research,'original-inline-reproduction.txt'),original);await writeFile(resolve(research,'source-adapted-inline-reproduction.'+(task==='l01'?'cjs':'mjs')),adapted);
 const workspace=resolve(dir,'controls/sonion-public-reproduction');await cp(manifest.baseDir,workspace,{recursive:true,filter:p=>!p.includes('/.git')&&!p.includes('/node_modules')});await symlink(manifest.dependencyDir,resolve(workspace,'node_modules'));
 const filename='public-reproduction.'+(task==='l01'?'cjs':'mjs');await writeFile(resolve(workspace,filename),adapted);
 const result=await executeIsolated({workspace,receipts:resolve(research,'receipts/public-inline'),command:task==='l03'?['node','--test',filename]:['node',filename],privateRoots:[resolve(dir,'grader')],gitMetadata:[manifest.dependencyDir],network:false,timeoutMs:10000});
 const reproduced=task==='l01'?result.stdout.includes('later: finally callback ran')&&!result.stdout.includes('later settled with 42'):task==='l02'?result.stdout.includes('still pending')&&result.stdout.includes('fulfilled despite abort'):result.exitCode===1&&result.stdout.includes('ERR_ASSERTION');
 const proof={at:new Date().toISOString(),task,command:task==='l03'?['node','--test',filename]:['node',filename],exitCode:result.exitCode,reproduced,originalSha256:createHash('sha256').update(original).digest('hex'),adaptation:task==='l01'?'Only package import changed from installed workerpool to ./src/index.js':task==='l02'?'Only package import changed from installed p-wait-for to ./index.js':'No changes to inline reproduction',receipt:resolve(research,'receipts/public-inline')};
 await writeFile(resolve(research,'original-reproduction.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));if(!reproduced)throw new Error('Original inline issue did not reproduce');
}
