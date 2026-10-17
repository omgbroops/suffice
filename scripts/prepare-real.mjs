import { mkdir,readFile,writeFile,cp,stat } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { repository,baseRevision,upstreamDir,realTasks } from '../benchmarks/real/tasks.mjs';
import { filesIn,hash,runNodeTests } from '../src/workspace.mjs';
import { stateDir,root } from '../src/runtime.mjs';
import { runInNewContext } from 'node:vm';

const inventory=await filesIn(upstreamDir);
const sourceFiles=inventory.filter(p=>/^(classes|functions|internal|ranges)\/.*\.js$/.test(p)||['index.js','preload.js'].includes(p));
const receipts=[];
const subsetSource=await readFile(resolve(upstreamDir,'test/ranges/subset.js'),'utf8');
const literal=subsetSource.match(/const cases = (\[[\s\S]*?\n\])/)[1];
const subsetCases=JSON.parse(JSON.stringify(runInNewContext(literal,{}, {timeout:1000})));
for(const task of realTasks.filter(t=>!t.repo)){
  const taskDir=dirname(task.workspaceDir);
  await mkdir(resolve(task.workspaceDir,'src'),{recursive:true});
  // Retain the repository layout under src/ to reuse the existing scoped tools.
  for(const p of inventory){await mkdir(dirname(resolve(task.workspaceDir,'src',p)),{recursive:true});await cp(resolve(upstreamDir,p),resolve(task.workspaceDir,'src',p));}
  await mkdir(resolve(task.workspaceDir,'tests'),{recursive:true});
  await cp(resolve(root,'benchmarks/real/visible.test.mjs'),resolve(task.workspaceDir,'tests/visible.test.mjs'));
  await writeFile(resolve(task.workspaceDir,'tests/upstream-subset-cases.json'),JSON.stringify(subsetCases));
  await writeFile(resolve(task.workspaceDir,'README.md'),`# node-semver repair task\n\n${task.prompt}\n\nThe upstream repository is under src/, with original layout and documentation. Only production JavaScript files may be edited. Existing upstream tests and fixtures must remain unchanged. The provided test tool runs seven groups adapted from upstream fixtures with Node's built-in test runner; it is not the entire upstream TAP suite. Hidden acceptance is evaluated separately. No dependency installation is needed.\n`);
  const reference=resolve(taskDir,'reference');await cp(task.workspaceDir,reference,{recursive:true});
  const response=await fetch(`https://raw.githubusercontent.com/npm/node-semver/${task.fix}/${task.referenceFile}`);
  if(!response.ok)throw new Error('Reference fetch failed');
  const fixed=await response.text();await writeFile(resolve(reference,'src',task.referenceFile),fixed);
  const broken=await runNodeTests(task.workspaceDir,task.acceptancePath),good=await runNodeTests(reference,task.acceptancePath);
  const regression=await runNodeTests(task.workspaceDir,resolve(task.workspaceDir,'tests/visible.test.mjs'));
  const referenceRegression=await runNodeTests(reference,resolve(reference,'tests/visible.test.mjs'));
  const receipt={task:task.id,repository,baseRevision,fix:task.fix,issue:task.issue,referenceFile:task.referenceFile,
    baseline:broken,reference:good,regression,referenceRegression,sourceFiles:sourceFiles.map(p=>`src/${p}`),
    fixtureHash:hash(await readFile(task.acceptancePath)),referenceHash:hash(fixed)};
  await writeFile(resolve(taskDir,'validation.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({task:task.id,baseline:broken.status,reference:good.status,regression:regression.status,referenceRegression:referenceRegression.status}));
  if(broken.status!=='failed'||good.status!=='passed'||regression.status!=='passed'||referenceRegression.status!=='passed')throw new Error(`Invalid task ${task.id}: inspect local validation.json`);
  receipts.push(receipt);
}
const bytes=(await Promise.all(inventory.map(p=>stat(resolve(upstreamDir,p))))).reduce((n,s)=>n+s.size,0);
const lines=(await Promise.all(sourceFiles.map(p=>readFile(resolve(upstreamDir,p),'utf8')))).reduce((n,s)=>n+s.split('\n').length,0);
await writeFile(resolve(stateDir,'real-tasks/provenance.json'),JSON.stringify({repository,baseRevision,downloadBytes:70707,files:inventory.length,sourceFiles:sourceFiles.length,sourceLines:lines,bytes,tasks:receipts.map(({baseline,reference,regression,referenceRegression,...r})=>r)},null,2));
console.log(JSON.stringify({files:inventory.length,productionFiles:sourceFiles.length,productionLines:lines,bytes}));
