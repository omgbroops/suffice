import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {root,stateDir} from '../src/runtime.mjs';
import {realTasks} from '../benchmarks/real/tasks.mjs';
import {runNodeTests} from '../src/workspace.mjs';
const directory=resolve(stateDir,'review-diagnostics');await mkdir(directory,{recursive:true});
const prelude=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {createRequire} from 'node:module';\nimport {resolve} from 'node:path';\nconst require=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'));\nconst s=require('./index.js');\n`;
const sources={
  'build-metadata':prelude+`test('invalid metadata punctuation stays invalid',()=>assert.equal(s.validRange('1.2.3+foo!'),null));\ntest('empty metadata segment stays invalid',()=>assert.equal(s.validRange('1.2.3+a..b'),null));\ntest('metadata without a version stays invalid',()=>assert.equal(s.validRange('+foo'),null));\n`,
  'dotted-prerelease':prelude+`test('consecutive instance increments advance dotted identifier',()=>assert.equal(new s.SemVer('3.0.0').inc('prerelease','alpha.beta').inc('prerelease','alpha.beta').version,'3.0.1-alpha.beta.1'));\ntest('reset then increment advances dotted identifier',()=>assert.equal(new s.SemVer('3.0.0-rc.4').inc('prerelease','alpha.beta').inc('prerelease','alpha.beta').version,'3.0.0-alpha.beta.1'));\n`,
};
const paths={};for(const [id,source]of Object.entries(sources)){paths[id]=resolve(directory,`${id}.test.mjs`);await writeFile(paths[id],source);}
const summarize=r=>({status:r.status,passed:r.passed,failed:r.failed,tests:r.tests,failures:[...r.stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1])});
const references=[];
for(const task of realTasks.filter(t=>paths[t.id]))for(const [kind,workspace]of [['baseline',task.workspaceDir],['upstream-reference',resolve(dirname(task.workspaceDir),'reference')]])references.push({task:task.id,kind,...summarize(await runNodeTests(workspace,paths[task.id]))});
const campaign=resolve(stateDir,'real-runs/semver-control-v1'),runs=[];
for(const name of(await readdir(campaign)).filter(n=>/^\d{3}-/.test(n))){
  const result=JSON.parse(await readFile(resolve(campaign,name,'result.json'),'utf8'));if(!paths[result.task])continue;
  const after=await runNodeTests(resolve(campaign,name,'workspace'),paths[result.task]);
  const row={runId:name,task:result.task,arm:result.arm,repetition:result.repetition,originalAccepted:result.success,after:summarize(after)};
  if(result.arm==='luna-review')row.before=summarize(await runNodeTests(resolve(campaign,name,'before-review'),paths[result.task]));
  runs.push(row);
}
const report={at:new Date().toISOString(),notice:'Post-hoc diagnostics derived from reviewer findings. Not frozen/held-out acceptance, not replacement benchmark scores. Some checks also fail upstream references.',references,runs};
await writeFile(resolve(root,'reports/semver-review-diagnostics.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
