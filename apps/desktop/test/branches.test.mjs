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
