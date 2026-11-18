import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
const branches=createRequire(import.meta.url)('../electron/branches.cjs'),exec=promisify(execFile);
import {branchFixture} from './branch-fixture.mjs';

test('checkout preserves compatible dirt and refuses tracked overwrites and unknown refs',async()=>{const {cwd,git}=await branchFixture();await writeFile(resolve(cwd,'a.txt'),'dirty');await writeFile(resolve(cwd,'untracked.txt'),'keep');await branches.select(cwd,{ref:'refs/heads/safe',newWorktree:false});assert.equal(await git('branch','--show-current'),'safe');assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),'dirty');await assert.rejects(branches.select(cwd,{ref:'refs/heads/conflict',newWorktree:false}),/overwritten/);await assert.rejects(branches.select(cwd,{ref:'--force',newWorktree:false}),/no longer exists/);assert.equal(await git('branch','--show-current'),'safe');assert.equal(await readFile(resolve(cwd,'untracked.txt'),'utf8'),'keep');});
test('worktrees use the selected commit and leave dirty source untouched',async()=>{const {cwd,git}=await branchFixture();await writeFile(resolve(cwd,'a.txt'),'dirty');const directory=await mkdtemp(resolve(tmpdir(),'suffice-worktrees-')),selected=await branches.select(cwd,{ref:'refs/heads/conflict',newWorktree:true},directory);assert.equal(await readFile(resolve(selected.path,'a.txt'),'utf8'),'target');assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),'dirty');assert.equal(await git('branch','--show-current'),'main');assert.match(selected.branch,/^suffice\/session-/);});
test('remote branches create tracking branches and non-repositories have no picker entries',async()=>{const {cwd,git}=await branchFixture();await git('config','remote.origin.url','https://example.invalid/fixture.git');await git('config','remote.origin.fetch','+refs/heads/*:refs/remotes/origin/*');await git('update-ref','refs/remotes/origin/remote',await git('rev-parse','main'));await branches.select(cwd,{ref:'refs/remotes/origin/remote',newWorktree:false});assert.equal(await git('branch','--show-current'),'remote');assert.equal(await git('rev-parse','--abbrev-ref','@{upstream}'),'origin/remote');assert.deepEqual((await branches.list(await mkdtemp(resolve(tmpdir(),'suffice-no-git-')))).branches,[]);});
test('GIT_DIR, GIT_WORK_TREE and GIT_CONFIG_* from the parent env do not reach git',async()=>{
 const {cwd}=await branchFixture(),other=await branchFixture();await other.git('checkout','-b','decoy');
 const saved={...process.env};
 try{
  Object.assign(process.env,{GIT_DIR:resolve(other.cwd,'.git'),GIT_WORK_TREE:other.cwd});
  assert.equal((await branches.list(cwd)).current,'main');
  delete process.env.GIT_DIR;delete process.env.GIT_WORK_TREE;
  Object.assign(process.env,{GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.worktree',GIT_CONFIG_VALUE_0:resolve(cwd,'missing')});
  assert.equal((await branches.list(cwd)).current,'main');
  assert.equal(await branches.git(cwd,['config','--get','core.worktree']).catch(()=>'unset'),'unset');
 }finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
 const env=branches.cleanEnv({GIT_DIR:'x',GIT_WORK_TREE:'x',GIT_CONFIG_COUNT:'1',GIT_CONFIG_GLOBAL:'x',GIT_INDEX_FILE:'x',GIT_OBJECT_DIRECTORY:'x',git_dir:'x',KEEP:'y'});
 assert.deepEqual(Object.keys(env).filter(k=>/^git_/i.test(k)).sort(),['GIT_ATTR_SOURCE','GIT_TERMINAL_PROMPT']);assert.equal(env.KEEP,'y');
});
test('git older than 2.42 is refused with an error naming 2.42; 2.42 passes',async()=>{
 const calls=[],make=version=>branches.createRunner(async(cmd,args)=>{calls.push(args);return {stdout:args[0]==='--version'?`git version ${version}\n`:'ok\n'};});
 await assert.rejects(make('2.41.0').git('/tmp',['status']),/2\.42/);assert.deepEqual(calls,[['--version']]);
 assert.equal(await make('2.42.0').git('/tmp',['status']),'ok');
 assert.equal(await make('2.54.0 (Apple Git-157)').git('/tmp',['status']),'ok');
 const real=await branches.createRunner().git(process.cwd(),['--version']).catch(()=>null);assert.ok(real===null||/git version/.test(real));
 assert.equal(branches.gitVersionOk('git version 2.41.9'),false);assert.equal(branches.gitVersionOk('garbage'),false);assert.equal(branches.gitVersionOk('git version 3.0.0'),true);
 await assert.rejects(make('2.42.0').git('',['status']),/No project/);
});
test('a branch named like an option is a value, never an option',async()=>{
 const {cwd,git}=await branchFixture(),name='--upload-pack=x';
 await git('update-ref','refs/heads/'+name,await git('rev-parse','main'));
 const row=(await branches.list(cwd)).branches.find(r=>r.name===name);assert.ok(row);
 await branches.select(cwd,{ref:row.ref,newWorktree:false});assert.equal(await git('branch','--show-current'),name);
 await git('checkout','main');await git('update-ref','refs/remotes/origin/-x',await git('rev-parse','main'));
 const r2=(await branches.list(cwd)).branches.find(r=>r.remote&&r.name==='origin/-x');assert.ok(r2);
 await assert.rejects(branches.select(cwd,{ref:r2.ref,newWorktree:false}),/not a valid branch name/);assert.equal(await git('branch','--show-current'),'main');
});
