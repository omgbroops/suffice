import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {workflowTasks} from '../benchmarks/workflow/tasks.mjs';
import {filesIn,hash} from '../src/workspace.mjs';
import {stateDir} from '../src/runtime.mjs';
for(const task of workflowTasks){
  const dir=resolve(stateDir,'upstream/workflow',task.base);await mkdir(dir,{recursive:true});
  const archive=resolve(dir,'source.tar.gz');let bytes;
  try{bytes=await readFile(archive);}catch(e){if(e.code!=='ENOENT')throw e;const response=await fetch(`https://codeload.github.com/nodeca/js-yaml/tar.gz/${task.base}`,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Download failed');const chunks=[];let length=0;for await(const b of response.body){length+=b.length;if(length>3*1024**2)throw new Error('Archive over cap');chunks.push(b);}bytes=Buffer.concat(chunks);await writeFile(archive,bytes,{flag:'wx'});}
  const extracted=spawnSync('tar',['-xzf',archive,'-C',dir],{windowsHide:true,encoding:'utf8'});if(extracted.status!==0)throw new Error('Extract failed');
  const upstream=resolve(dir,`js-yaml-${task.base}`);const inventory=await filesIn(upstream);
  await mkdir(resolve(task.workspaceDir,'src'),{recursive:true});
  for(const p of inventory){await mkdir(dirname(resolve(task.workspaceDir,'src',p)),{recursive:true});await cp(resolve(upstream,p),resolve(task.workspaceDir,'src',p));}
  const reference=resolve(dirname(task.workspaceDir),'reference');await cp(task.workspaceDir,reference,{recursive:true});const referenceHashes={};
  for(const p of task.referenceFiles){const r=await fetch(`https://raw.githubusercontent.com/nodeca/js-yaml/${task.fix}/${p}`);if(!r.ok)throw new Error('Reference fetch failed');const code=await r.text();await writeFile(resolve(reference,'src',p),code);referenceHashes[p]=hash(code);}
  const sourceFiles=inventory.filter(p=>p.startsWith('src/')&&p.endsWith('.ts')).map(p=>'src/'+p);
  const sizes=await Promise.all(inventory.map(async p=>(await readFile(resolve(upstream,p))).length));
  const lines=(await Promise.all(sourceFiles.map(async p=>(await readFile(resolve(task.workspaceDir,p),'utf8')).split('\n').length))).reduce((a,b)=>a+b,0);
  const receipt={id:task.id,base:task.base,fix:task.fix,archiveHash:hash(bytes),downloadBytes:bytes.length,files:inventory.length,extractedBytes:sizes.reduce((a,b)=>a+b,0),sourceFiles,sourceLines:lines,referenceHashes};
  await writeFile(resolve(dirname(task.workspaceDir),'source.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({task:task.id,bytes:bytes.length,files:inventory.length,productionFiles:sourceFiles.length,sourceLines:lines}));
}
