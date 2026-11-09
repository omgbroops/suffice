import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {classicBuildSteps,classicDependencies} from '../src/classic-svelte-eval.mjs';
import {svelteTask} from '../src/svelte-intelligence-pilot.mjs';
import {snapshot} from '../src/intelligence-eval.mjs';
test('classic build expansion preserves legacy and newer command sequences without invoking npm',()=>{
  assert.deepEqual(classicBuildSteps({scripts:{build:'npm run main && npm run shared',main:'node src/shared/_build.js && rollup -c rollup/main.js',shared:'rollup -c'}}),[['src/shared/_build.js'],['node_modules/rollup/bin/rollup','-c','rollup/main.js'],['node_modules/rollup/bin/rollup','-c']]);
});
test('unaudited, recursive and escaping build commands are rejected',()=>{
  for(const scripts of [{build:'curl example.com'},{build:'npm run build'},{build:'npm run absent'},{build:'node ../outside.js'},{build:'rollup -c ../outside.js'},{build:'node src/a.js; echo unsafe'}])assert.throws(()=>classicBuildSteps({scripts}));
});
test('stale Yarn selectors use compatible locked versions or freeze the declared npm range once',()=>{
  const lock='foo@^1.0.0:\n  version "1.2.3"\n\nbar@^2.0.0:\n  version "2.4.0"\n';
  const result=classicDependencies({devDependencies:{foo:'^1.0.0',bar:'^2.3.0',baz:'^3.0.0',nightmare:'^3.0.0'}},lock);
  assert.deepEqual(result.pinned.dependencies,{bar:'2.4.0',baz:'^3.0.0',foo:'1.2.3'});
  assert.deepEqual(result.decisions.map(row=>row.method),['compatible-upstream-locked-version','declared-range-resolved-once-and-frozen-in-npm-lock','exact-upstream-lock-selector']);
  assert.throws(()=>classicDependencies({dependencies:{foo:'git+https://example.invalid/foo.git'}},lock),/non-semver/);
});
test('the prospective cohort contains 24 distinct, balanced real issues with runtime criteria',async()=>{
  const cohort=JSON.parse(await readFile(new URL('../benchmarks/intelligence-real-v3/cohort.json',import.meta.url),'utf8'));
  assert.equal(new Set(cohort.tasks.map(t=>t.id)).size,24);
  for(const category of ['simple','cross-file','complex'])assert.equal(cohort.tasks.filter(t=>t.category===category).length,8);
  assert.ok(cohort.tasks.every(t=>t.runtimeTargets.length&&t.productionFiles.length));
  for(const id of ['sveltejs__svelte-1190','sveltejs__svelte-1428'])assert.ok(!cohort.tasks.some(t=>t.id===id));
});
test('independent grading actually invokes the supplied legacy project builder',async t=>{
  const directory=await mkdtemp(resolve(tmpdir(),'suffice-classic-builder-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const baseline=resolve(directory,'baseline');await mkdir(resolve(baseline,'src'),{recursive:true});await mkdir(resolve(directory,'dependencies/node_modules'),{recursive:true});
  await writeFile(resolve(baseline,'check.js'),'export const check=1;\n');await writeFile(resolve(baseline,'src/value.js'),'export const value=1;\n');
  await writeFile(resolve(directory,'dependency-hashes.json'),'{}');await writeFile(resolve(directory,'validation.json'),JSON.stringify({valid:true,baselineHashes:await snapshot(baseline)}));
  const workspace=resolve(directory,'trial/workspace');await cp(baseline,workspace,{recursive:true});let builds=0;
  const taskRecord={instance_id:'custom-build-fixture',repo:'local/fixture',base_commit:'fixture',patch:'',problem_statement:'Fixture.',test_patch:'diff --git a/check.js b/check.js\n--- a/check.js\n+++ b/check.js\n@@ -1 +1 @@\n-export const check=1;\n+export const check=2;\n'};
  const {task}=await svelteTask({directory,taskRecord,buildProject:async()=>{builds++;return {status:'build_failed',marker:'custom-project-build'};}});
  const result=await task.verify(workspace);assert.equal(builds,1);assert.equal(result.acceptance.marker,'custom-project-build');assert.equal(result.regression.status,'not_run');
});
test('native runtime exclusions preserve the same sample in SSR discovery',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-native-suites-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(resolve(dir,'test/runtime/samples/binding-select'),{recursive:true});await mkdir(resolve(dir,'test/runtime/samples/ordinary'),{recursive:true});
  await cp(new URL('../benchmarks/intelligence-real-v3/native-tests.cjs',import.meta.url),resolve(dir,'native-tests.cjs'));
  await writeFile(resolve(dir,'native-environment.json'),JSON.stringify({excludedRuntimeSamples:['binding-select']}));
  await writeFile(resolve(dir,'native-loader-base.cjs'),"const fs=require('fs'),path=require('path'),p=path.join(__dirname,'test/runtime/samples');global.__sufficeNativeSuite='runtime';const runtime=fs.readdirSync(p);global.__sufficeNativeSuite='server-side-rendering';const ssr=fs.readdirSync(p);delete global.__sufficeNativeSuite;fs.writeFileSync(path.join(__dirname,'observed.json'),JSON.stringify({runtime,ssr}));");
  await promisify(execFile)(process.execPath,['native-tests.cjs'],{cwd:dir,windowsHide:true});
  assert.deepEqual(JSON.parse(await readFile(resolve(dir,'observed.json'),'utf8')),{runtime:['ordinary'],ssr:['binding-select','ordinary']});
});
test('native SourceMap compatibility preserves mapping content and rejects unrelated objects',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-map-compat-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await cp(new URL('../benchmarks/intelligence-real-v3/native-compat.cjs',import.meta.url),resolve(dir,'compat.cjs'));
  const source="const fs=require('fs'),compat=require('./compat.cjs');class SourceMap{toString(){return 'map bytes';}}fs.writeFileSync('map.txt',new SourceMap());fs.writeFileSync('binary.txt',Buffer.from('binary'));let rejected=false;try{fs.writeFileSync('invalid.txt',{});}catch{rejected=true;}const value={version:3,file:'out\\\\main.js',sources:['src\\\\main.html'],sourcesContent:['a\\\\b'],mappings:'AAAA',names:[]};fs.writeFileSync('result.json',JSON.stringify({rejected,map:JSON.parse(compat.normalizeSourceMapPaths(JSON.stringify(value)))}));";
  await writeFile(resolve(dir,'check.cjs'),source);await promisify(execFile)(process.execPath,['check.cjs'],{cwd:dir,windowsHide:true});
  assert.equal(await readFile(resolve(dir,'map.txt'),'utf8'),'map bytes');assert.equal(await readFile(resolve(dir,'binary.txt'),'utf8'),'binary');
  assert.deepEqual(JSON.parse(await readFile(resolve(dir,'result.json'),'utf8')),{rejected:true,map:{version:3,file:'out/main.js',sources:['src/main.html'],sourcesContent:['a\\b'],mappings:'AAAA',names:[]}});
});
test('native console adaptation supports detached process-warning callbacks',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-console-compat-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(resolve(dir,'src'));await mkdir(resolve(dir,'test'));
  for(const file of ['native-loader-base.cjs','native-compat.cjs'])await cp(new URL('../benchmarks/intelligence-real-v3/'+file,import.meta.url),resolve(dir,file));
  await writeFile(resolve(dir,'test/setup.js'),"console.error=function(){this._stderr.write('native-warning-probe\\n');};");
  const result=await promisify(execFile)(process.execPath,['-e',"require('./native-loader-base.cjs');const detached=console.error;detached();"],{cwd:dir,windowsHide:true});
  assert.match(result.stderr,/native-warning-probe/);
});

test('native CLI adaptation enforces pinned execution, exit status and complete output inventories',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-fixtures-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await cp(new URL('../benchmarks/intelligence-real-v3/native-compat.cjs',import.meta.url),resolve(dir,'compat.cjs'));
  const fixture="function normalize(str){return str\n.trim();}\nconst command='svelte compile src';const cli='host-cli';const { commandErr } = shell.exec(command.replace(/^svelte /, `node ${cli} `));if(commandErr){done(commandErr);}actual.forEach((a, i) => {assert.equal(a.file, expected[i].file);});";
  const legacy=fixture.replace('const { commandErr } = shell.exec(command.replace(/^svelte /, `node ${cli} `));if(commandErr){done(commandErr);}', '/* alias svelte=original */');
  const program=`const assert=require('node:assert/strict'),vm=require('node:vm'),compat=require('./compat.cjs');
const source=${JSON.stringify(fixture)},adapted=compat.adaptCliSource(source,{runtime:'C:/Pinned Runtime/node.exe',compat:'C:/fixture/native-compat.cjs',cli:'C:/fixture/cli/index.ts.js'});
let command;const execute=(actual,code=0)=>vm.runInNewContext(adapted,{require:()=>compat,assert,actual,expected:[{file:'Main.js'}],done:error=>{throw error;},shell:{exec:value=>{command=value;return {code};}}});
execute([{file:'Main.js'}]);assert.match(command,/^"C:\\/Pinned Runtime\\/node.exe" --max-old-space-size=384 --require "C:\\/fixture\\/native-compat.cjs" "C:\\/fixture\\/cli\\/index.ts.js" compile src$/);
assert.throws(()=>execute([]),/CLI output inventory mismatch/);assert.throws(()=>execute([{file:'Main.js'}],1),/CLI command exited 1/);
assert.throws(()=>compat.adaptCliSource(source.replace('shell.exec(', 'unknown.exec('),{}),/Unaudited native CLI executor/);
vm.runInNewContext(compat.adaptCliSource(${JSON.stringify(legacy)},{}),{require:()=>compat,assert,actual:[{file:'Main.js'}],expected:[{file:'Main.js'}]});
`;
  await writeFile(resolve(dir,'check.cjs'),program);await promisify(execFile)(process.execPath,['check.cjs'],{cwd:dir,windowsHide:true});
});
