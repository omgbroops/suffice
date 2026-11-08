import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {semanticTasks} from '../benchmarks/semantic/tasks.mjs';
import {root,stateDir} from '../src/runtime.mjs';
import {filesIn,hash,runNodeTests} from '../src/workspace.mjs';
import {applyReferencePatch} from '../benchmarks/verify-tasks.mjs';

for(const task of semanticTasks){
  const directory=dirname(task.workspaceDir);await mkdir(directory,{recursive:true});
  try{await readFile(resolve(directory,'validation.json'));console.log(JSON.stringify({task:task.id,status:'already_prepared'}));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  let archiveHash;
  if(task.id==='prerelease-diff'){
    const upstreamDir=resolve(stateDir,'semantic-upstream',task.base);await mkdir(upstreamDir,{recursive:true});
    const response=await fetch(`https://codeload.github.com/npm/node-semver/tar.gz/${task.base}`,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Pinned archive download failed');
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2*1024**2)throw new Error('Archive exceeds 2 MiB');archiveHash=hash(bytes);
    const archive=resolve(upstreamDir,'source.tar.gz');await writeFile(archive,bytes);const tar=spawnSync('tar',['-xzf',archive,'-C',upstreamDir],{windowsHide:true,encoding:'utf8'});if(tar.status!==0)throw new Error('Pinned archive extraction failed');
    const upstream=resolve(upstreamDir,`node-semver-${task.base}`);await cp(upstream,resolve(task.workspaceDir,'src'),{recursive:true});
    await mkdir(resolve(task.workspaceDir,'tests'),{recursive:true});await cp(resolve(root,'benchmarks/real/visible.test.mjs'),resolve(task.workspaceDir,'tests/visible.test.mjs'));
    const source=await readFile(resolve(upstream,'test/ranges/subset.js'),'utf8'),cases=runInNewContext(source.match(/const cases = (\[[\s\S]*?\n\])/)[1],{},{timeout:1000});await writeFile(resolve(task.workspaceDir,'tests/upstream-subset-cases.json'),JSON.stringify(cases));
    await writeFile(resolve(task.workspaceDir,'README.md'),`# node-semver repair\n${task.prompt}\nThe upstream repository is under src/. Change only existing production JavaScript. Tests, fixtures and metadata are immutable. Use the test tool for seven adapted upstream fixture groups. No dependency installation or network is needed.\n`);
  }else await cp(task.originalWorkspace,task.workspaceDir,{recursive:true});
  const reference=resolve(directory,'reference');await cp(task.workspaceDir,reference,{recursive:true});
  if(task.id==='prerelease-diff'){
    for(const path of task.referenceFiles){const response=await fetch(`https://raw.githubusercontent.com/npm/node-semver/${task.fix}/${path}`,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Pinned reference download failed');await writeFile(resolve(reference,'src',path),await response.text());}
  }else await applyReferencePatch(task,reference);
  const baseline=await runNodeTests(task.workspaceDir,task.acceptancePath),fixed=await runNodeTests(reference,task.acceptancePath),regression=await runNodeTests(task.workspaceDir,resolve(task.workspaceDir,'tests/visible.test.mjs')),fixedRegression=await runNodeTests(reference,resolve(reference,'tests/visible.test.mjs'));
  const inventory=await filesIn(task.workspaceDir),sourceFiles=inventory.filter(p=>task.id==='prerelease-diff'?/^src\/(?:classes|functions|internal|ranges)\/.*\.js$/.test(p)||['src/index.js','src/preload.js'].includes(p):p.startsWith('src/')&&/\.[cm]?[jt]s$/.test(p));
  const hashes={};for(const p of inventory)hashes[p]=hash(await readFile(resolve(task.workspaceDir,p)));
  const validation={task:task.id,provenance:task.provenance,base:task.base,fix:task.fix,archiveHash,sourceFiles,hashes,acceptanceHash:hash(await readFile(task.acceptancePath)),baseline,fixed,regression,fixedRegression};
  await writeFile(resolve(directory,'validation.json'),JSON.stringify(validation,null,2));
  if(baseline.status!=='failed'||fixed.status!=='passed'||regression.status!=='passed'||fixedRegression.status!=='passed')throw new Error(`Independent task validation failed: ${task.id}`);
  console.log(JSON.stringify({task:task.id,baseline:baseline.status,reference:fixed.status,visible:regression.status,files:sourceFiles.length}));
}
