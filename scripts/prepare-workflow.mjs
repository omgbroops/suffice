import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import {workflowTasks} from '../benchmarks/workflow/tasks.mjs';import {root} from '../src/runtime.mjs';import {runNodeTests,hash} from '../src/workspace.mjs';
import {runUpstream} from '../src/workflow-upstream.mjs';
for(const task of workflowTasks){
  const parent=dirname(task.workspaceDir),reference=resolve(parent,'reference');
  const readme=`# js-yaml repair workspace\n\nThe upstream repository is under src/, with editable TypeScript production files in src/src/. Node 24 executes these TypeScript files directly; no installation/build is needed. The test tool runs frozen public regression checks. Hidden acceptance is separate and unavailable. Only existing production source files may be edited.\n\nTask: ${task.prompt}\n`;
  for(const dir of [task.workspaceDir,reference]){await mkdir(resolve(dir,'tests'),{recursive:true});await cp(resolve(root,'benchmarks/workflow/visible.test.mjs'),resolve(dir,'tests/visible.test.mjs'));await writeFile(resolve(dir,'README.md'),readme);}
  const baseline=await runNodeTests(task.workspaceDir,task.acceptancePath),fixed=await runNodeTests(reference,task.acceptancePath),regression=await runNodeTests(task.workspaceDir,resolve(task.workspaceDir,'tests/visible.test.mjs')),fixedRegression=await runNodeTests(reference,resolve(reference,'tests/visible.test.mjs'));
  const upstream=await runUpstream(task.workspaceDir),fixedUpstream=await runUpstream(reference);
  const receipt={...JSON.parse(await readFile(resolve(parent,'source.json'),'utf8')),acceptanceHash:hash(await readFile(task.acceptancePath)),baseline,fixed,regression,fixedRegression,upstream,fixedUpstream};
  await writeFile(resolve(parent,'validation.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({id:task.id,baseline:baseline.status,fixed:fixed.status,regression:regression.status,fixedRegression:fixedRegression.status,upstream:upstream.status,upstreamTests:upstream.tests,fixedUpstream:fixedUpstream.status}));
  if(baseline.status!=='failed'||!baseline.stdout.includes('ERR_ASSERTION')||fixed.status!=='passed'||regression.status!=='passed'||fixedRegression.status!=='passed'||upstream.status!=='passed'||fixedUpstream.status!=='passed'||upstream.tests!==fixedUpstream.tests)throw new Error(`Validation failed ${task.id}`);
}
