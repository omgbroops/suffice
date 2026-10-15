import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {stageRuntime,executeIsolated,ROOT,LINUX_RUNTIME,linuxPath} from './general-execution.mjs';
const mode=process.argv[2]??'run',fixture=resolve(ROOT,'.suffice/compat/repo');
if(mode==='prepare'){
 const files={
  'package.json':JSON.stringify({name:'suffice-compatibility-fixture',private:true,type:'module',scripts:{test:'node --test --test-isolation=none tests/*.test.mjs',build:'tsc -p tsconfig.json',lint:'node --check packages/core/index.js && node --check packages/cli/index.ts'},devDependencies:{typescript:'5.4.5'}}),
  'packages/core/index.js':'export const increment = 1;\nexport function add(x) { return x + increment; }\n',
  'packages/cli/index.ts':"import {add} from '../core/index.js';\nconst factor: number = 2;\nexport function calculate(x: number): number { return add(x) * factor; }\n",
  'tests/integration.test.mjs':"import test from 'node:test';import assert from 'node:assert/strict';import {calculate} from '../packages/cli/index.ts';test('cross package contract',()=>assert.equal(calculate(2),18));\n"
 };
 for(const[p,s]of Object.entries(files)){await mkdir(resolve(fixture,p,'..'),{recursive:true});await writeFile(resolve(fixture,p),s);}
 const p=spawnSync('wsl.exe',['-d','Ubuntu','--','env','PATH='+LINUX_RUNTIME+'/bin:/usr/bin:/bin','npm','install','--ignore-scripts','--no-audit','--no-fund','--prefix',linuxPath(fixture)],{encoding:'utf8',windowsHide:true});console.log(p.stdout,p.stderr);if(p.status!==0)throw new Error('Fixture dependencies unavailable');
}else{
 await stageRuntime();
 const out=resolve(ROOT,'.suffice/compat/runs',new Date().toISOString().replaceAll(/[:.]/g,'-'));
 const r=await executeIsolated({workspace:fixture,receipts:out,command:['node','/runtime/tests/general-compatibility.mjs'],privateRoots:[resolve(ROOT,'.suffice/compat/private'),resolve(ROOT,'../github-field-test/.suffice/field/private')],timeoutMs:90000});
 console.log(JSON.stringify({...r,stdout:r.stdout,stderr:r.stderr}));
 if(r.exitCode===0)await writeFile(resolve(ROOT,'.suffice/compat/latest.json'),JSON.stringify({run:out,result:JSON.parse(await readFile(resolve(out,'compatibility.json')))},null,2));
 if(r.exitCode!==0)process.exitCode=1;
}
