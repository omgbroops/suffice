import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {gradeMocha,dependencySnapshot,applyPatch} from '../src/native-intelligence-eval.mjs';
import {initializeWorkspaceGit} from '../src/intelligence-eval.mjs';
const passing={stats:{tests:1,passes:1,failures:0,pending:0},tests:[{fullTitle:'required behavior'}],passes:[{fullTitle:'required behavior'}],failures:[],pending:[]};
test('native grading rejects missing criteria, skipped tests, inconsistent counts and failed exit status',()=>{
  assert.equal(gradeMocha(passing,{required:['required behavior']}).status,'passed');
  assert.equal(gradeMocha(passing,{required:['missing case']}).status,'invalid_result');
  assert.equal(gradeMocha({...passing,stats:{...passing.stats,passes:0}}).status,'invalid_result');
  assert.equal(gradeMocha({...passing,passes:[],pending:passing.tests,stats:{tests:1,passes:0,failures:0,pending:1}}).status,'failed');
  assert.equal(gradeMocha(passing,{exitCode:1}).status,'failed');
});
test('dependency hashing detects mutations inside nested node_modules',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-native-deps-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const nested=resolve(dir,'package/node_modules/child');await mkdir(nested,{recursive:true});await writeFile(resolve(nested,'index.js'),'original');const before=await dependencySnapshot(dir);await writeFile(resolve(nested,'index.js'),'changed');assert.notDeepEqual(await dependencySnapshot(dir),before);
});
test('patching refuses inherited Git roots and applies only inside independent roots; dependencies are excluded',async t=>{
  const parent=await mkdtemp(resolve(tmpdir(),'suffice-native-patch-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  execFileSync('git',['-C',parent,'init','-q'],{windowsHide:true});const child=resolve(parent,'child');await mkdir(child);await writeFile(resolve(child,'value.js'),'export const value=1;\n');await mkdir(resolve(child,'node_modules'));await writeFile(resolve(child,'node_modules/secret.js'),'dependency');
  const patch='diff --git a/value.js b/value.js\n--- a/value.js\n+++ b/value.js\n@@ -1 +1 @@\n-export const value=1;\n+export const value=2;\n';
  await assert.rejects(applyPatch(child,patch,resolve(parent,'change.diff')),/independent Git root/);await initializeWorkspaceGit(child);
  assert.equal(execFileSync('git',['-C',child,'ls-files'],{encoding:'utf8',windowsHide:true}).trim(),'value.js');await applyPatch(child,patch,resolve(parent,'change.diff'));
  assert.match(execFileSync('git',['-C',child,'diff'],{encoding:'utf8',windowsHide:true}),/value=2/);
});
