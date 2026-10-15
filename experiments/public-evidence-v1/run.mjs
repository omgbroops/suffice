// Manual public-evidence runner. No actor/model calls or private task fields.
import childProcess from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const out=resolve(root,'.suffice/public-evidence-v1');
await mkdir(out,{recursive:true});
const {executeIsolated}=await import('./execution.mjs');
const execGit=(base,args)=>childProcess.execFileSync('git',['-C',base,...args]);
async function publicCopy(base,dest){
 await mkdir(dest,{recursive:true});
 const files=execGit(base,['ls-files','-z']).toString().split('\0').filter(Boolean);
 const hashes={};
 for(const file of files){
  if(file.startsWith('/')||file.split('/').includes('..'))throw Error('Unsafe tracked path');
  const bytes=execGit(base,['show',`HEAD:${file}`]);
  const target=resolve(dest,file);await mkdir(resolve(target,'..'),{recursive:true});
  await writeFile(target,bytes);hashes[file]=createHash('sha256').update(bytes).digest('hex');
 }
 return {revision:execGit(base,['rev-parse','HEAD']).toString().trim(),files:hashes};
}
const evidence=[];
for(const id of ['i01','q04']){
 const meta=JSON.parse(await readFile(resolve(root,`.suffice/field-campaign-v1/tasks/${id}/task.json`),'utf8'));
 const {repository,baseDir,dependencyDir}=meta;
 const workspace=resolve(out,id,'workspace');await mkdir(workspace,{recursive:true});
 const destinations=id==='q04'?['source-a','source-b']:['source'];
 const sourceCopies={};
 for(const name of destinations)sourceCopies[name]=await publicCopy(baseDir,resolve(workspace,name));
 if(id==='i01'){
  const candidates=[dependencyDir+'/node_modules',dependencyDir+'/container/node_modules',dependencyDir];
  let deps;
  for(const p of candidates){try{const names=await import('node:fs/promises').then(fs=>fs.readdir(p));if(names.includes('data-uri-to-buffer')){deps=p;break;}}catch{}}
  if(!deps)throw Error('Could not normalize installed public dependencies');
  await cp(deps,resolve(workspace,'source/node_modules'),{recursive:true,dereference:true});
 }
 await copyFile(resolve(import.meta.dirname,id+'.mjs'),resolve(workspace,'reproduce.mjs'));
 await writeFile(resolve(out,id,'source-manifest.json'),JSON.stringify({repository,sourceCopies},null,2)+'\n');
 const result=await executeIsolated({workspace,receipts:resolve(out,id,'receipts'),command:['/node/bin/node','reproduce.mjs'],network:false,timeoutMs:30000});
 const item={id,repository,revision:sourceCopies[destinations[0]].revision,exitCode:result.exitCode,stdout:result.stdout,stderr:result.stderr};
 await writeFile(resolve(out,id,'baseline.json'),JSON.stringify(item,null,2)+'\n');evidence.push(item);console.log(JSON.stringify(item));
}
await writeFile(resolve(out,'baseline-summary.json'),JSON.stringify(evidence,null,2)+'\n');
