import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import {root,stateDir} from '../src/runtime.mjs';import {efficiencyTasks} from '../benchmarks/efficiency/tasks.mjs';import {runNodeTests,hash} from '../src/workspace.mjs';
const directory=resolve(stateDir,'efficiency-extra-regressions');await mkdir(directory,{recursive:true});const references=[];
const tests={};
for(const task of efficiencyTasks){
  const sources={};for(const name of ['diff','coerce'])sources[name]=(await readFile(resolve(task.workspaceDir,`src/test/functions/${name}.js`))).toString('base64');
  const source=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {createRequire} from 'node:module';\nimport {resolve} from 'node:path';\nconst sources=${JSON.stringify(sources)};\nfunction check(name){const originalRequire=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/test/functions',name+'.js'));let assertions=0;const tap={test(_name,fn){fn({equal(a,b,msg){assertions++;assert.equal(a,b,msg)},same(a,b,msg){assertions++;assert.deepEqual(a,b,msg)},throws(fn,expected){assertions++;assert.throws(fn,expected)},end(){}})}};const req=name=>name==='tap'?tap:originalRequire(name);new Function('require','module','exports',Buffer.from(sources[name],'base64').toString('utf8'))(req,{exports:{}},{});assert.ok(assertions>10);console.log('# upstream assertions '+name+' '+assertions);}\ntest('upstream diff regression',()=>check('diff'));\ntest('upstream coerce regression',()=>check('coerce'));\n`;
  const file=resolve(directory,`${task.id}.test.mjs`);tests[task.id]=file;
  try{if(await readFile(file,'utf8')!==source)throw new Error('Supplemental test changed');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(file,source,{flag:'wx'});}
  for(const [kind,workspace]of [['baseline',task.workspaceDir],['reference',resolve(dirname(task.workspaceDir),'reference')]]){
    const r=await runNodeTests(workspace,file);references.push({task:task.id,kind,status:r.status,passed:r.passed,failed:r.failed,graderHash:hash(source),assertions:[...r.stdout.matchAll(/^# upstream assertions (\w+) (\d+)$/gm)].map(m=>({api:m[1],count:Number(m[2])}))});
    if(r.status!=='passed')throw new Error(`Supplemental reference validation failed: ${task.id}/${kind}`);
  }
}
const campaign=resolve(stateDir,'efficiency-runs/sol-tools-v1'),runs=[];
if(!process.argv.includes('--prepare-only'))for(const name of(await readdir(campaign)).filter(n=>/^\d{3}-/.test(n))){
  let result;try{result=JSON.parse(await readFile(resolve(campaign,name,'result.json'),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  const r=await runNodeTests(resolve(campaign,name,'workspace'),tests[result.task]);
  runs.push({runId:name,arm:result.arm,task:result.task,primarySuccess:result.success,status:r.status,passed:r.passed,failed:r.failed,failures:[...r.stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1])});
}
const report={at:new Date().toISOString(),notice:'Supplemental original-upstream regressions selected after campaign start, before reading candidate patches. Separate from frozen main acceptance; no results fed to models.',references,runs};
await writeFile(resolve(root,'reports/sol-tools-extra-regressions.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({references,runs:runs.length,failures:runs.filter(r=>r.status!=='passed')},null,2));
