import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {implicitTasks} from '../benchmarks/implicit/tasks.mjs';
import {hash} from '../src/workspace.mjs';
for(const task of implicitTasks){
 const dir=dirname(task.workspaceDir);await mkdir(dir,{recursive:true});
 try{await readFile(resolve(dir,'upstream.json'));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
 const response=await fetch(`https://api.github.com/repos/${task.repo}/commits/${task.fix}`,{headers:{'User-Agent':'suffice-reproducible-research'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Commit lookup ${response.status}`);const commit=await response.json(),base=commit.parents[0].sha;
 const archiveResponse=await fetch(`https://codeload.github.com/${task.repo}/tar.gz/${base}`,{signal:AbortSignal.timeout(30000)});if(!archiveResponse.ok)throw new Error('Archive unavailable');const bytes=Buffer.from(await archiveResponse.arrayBuffer());if(bytes.length>64*1024**2)throw new Error('Archive size bound');const archive=resolve(dir,'source.tar.gz');await writeFile(archive,bytes);await mkdir(resolve(dir,'upstream'));execFileSync('tar',['-xzf',archive,'-C',resolve(dir,'upstream'),'--strip-components','1'],{windowsHide:true});
 const refs={};for(const file of task.referenceFiles){const ref=await fetch(`https://raw.githubusercontent.com/${task.repo}/${task.fix}/${file}`,{signal:AbortSignal.timeout(30000)});if(!ref.ok)throw new Error('Reference unavailable');refs[file]=await ref.text();}
 await writeFile(resolve(dir,'reference-files.json'),JSON.stringify(refs));await writeFile(resolve(dir,'upstream.json'),JSON.stringify({repo:task.repo,fix:task.fix,base,archiveHash:hash(bytes),message:commit.commit.message,files:commit.files.map(f=>({filename:f.filename,patch:f.patch})),fetchedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({task:task.id,base,bytes:bytes.length}));
}
