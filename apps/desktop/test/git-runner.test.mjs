import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {createRunner,gitVersionOk}=require('../electron/git.cjs');

test('version gate parses git versions',()=>{
 assert.equal(gitVersionOk('git version 2.42.0'),true);
 assert.equal(gitVersionOk('git version 2.54.0 (Apple Git-157)'),true);
 assert.equal(gitVersionOk('git version 3.0.1'),true);
 assert.equal(gitVersionOk('git version 2.41.9'),false);
 assert.equal(gitVersionOk('git version 1.99.0'),false);
 assert.equal(gitVersionOk(''),false);
});

test('old git is refused before any repo command runs',async()=>{
 const calls=[];
 const exec=async(cmd,args)=>{calls.push(args);return {stdout:args[0]==='--version'?'git version 2.39.5':'x'};};
 const {git}=createRunner(exec);
 await assert.rejects(git('/repo',['diff']),/2\.42 or newer/);
 assert.deepEqual(calls,[['--version']]);
});

// Hostile repo whose filters touch a marker file; forward slashes keep the path intact through Git Bash on Windows.
function hostileRepo(){
 const dir=mkdtempSync(path.join(tmpdir(),'gitattr-'));
 const marker=path.join(dir,'..',path.basename(dir)+'-FILTER-RAN');
 const m=marker.replaceAll('\\','/');
 const g=(...a)=>execFileSync('git',['-C',dir,...a],{stdio:'pipe'});
 g('init','-q');
 g('config','filter.evil.clean',`touch '${m}'; cat`);
 g('config','filter.evil.smudge',`touch '${m}'; cat`);
 g('config','diff.evil.textconv',`sh -c 'touch "${m}"; cat "$0"'`);
 writeFileSync(path.join(dir,'.gitattributes'),'* filter=evil diff=evil\n');
 writeFileSync(path.join(dir,'a.txt'),'one\n');
 return {dir,marker,g};
}

test('positive control: plain git does run the hostile filter',()=>{
 const {marker,g}=hostileRepo();
 g('add','a.txt');
 assert.equal(existsSync(marker),true,'hostile filter never ran, so the isolation test proves nothing');
});

test('a repo-controlled filter never executes',()=>{
 const {dir,marker}=hostileRepo();
 return (async()=>{
  const {git}=createRunner();
  await git(dir,['status','--porcelain']);
  await git(dir,['add','-N','a.txt']);
  await git(dir,['diff']);
  await git(dir,['diff','--stat']);
  assert.equal(existsSync(marker),false,'filter or textconv command ran');
 })();
});
