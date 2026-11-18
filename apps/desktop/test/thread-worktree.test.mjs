import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdtemp,writeFile,readFile,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {branchFixture} from './branch-fixture.mjs';
const wt=createRequire(import.meta.url)('../electron/thread-worktree.cjs');
const exists=p=>stat(p).then(()=>true,()=>false);

test('worktree lifecycle on a temp repo: create, status, diff, pr dry run, merge, discard',async()=>{
 const {cwd,git}=await branchFixture(),dir=await mkdtemp(resolve(tmpdir(),'suffice-wt-'));
 assert.equal(await wt.status(cwd),null);
 const made=await wt.create(cwd,dir);assert.match(made.branch,/^agent\/[0-9a-f]{8}$/);
 const s0=await wt.status(made.path);assert.equal(s0.branch,made.branch);assert.equal(s0.target,'main');assert.equal(s0.files,0);assert.equal(s0.commits,0);
 assert.equal(await readFile(resolve(made.path,'a.txt'),'utf8'),'base');
 await writeFile(resolve(made.path,'a.txt'),'changed');await writeFile(resolve(made.path,'b.txt'),'new');
 assert.equal((await wt.status(made.path)).files,2);
 const d=await wt.diff(made.path);assert.match(d.stat,/b\.txt/);assert.match(d.patch,/\+changed/);
 assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),'base');
 const dry=await wt.pr(made.path,{dryRun:true});assert.equal(dry.dryRun,true);assert.match(dry.commands.join('\n'),/gh pr create --fill --head agent\/[0-9a-f]{8} --base main/);
 assert.equal((await wt.status(made.path)).commits,1);
 const merged=await wt.merge(made.path);assert.equal(merged.target,'main');
 assert.equal(await readFile(resolve(cwd,'b.txt'),'utf8'),'new');assert.match(await git('log','--merges','--format=%s','-1'),/^Merge agent\//);
 assert.equal((await wt.status(made.path)).commits,0);
 await assert.rejects(()=>wt.pr(made.path,{}),/push|origin|Command failed/);
 await wt.discard(made.path);assert.equal(await exists(made.path),false);assert.equal(await git('branch','--list',made.branch),'');
 await assert.rejects(()=>wt.diff(made.path));
});

test('merge conflict aborts and leaves the main checkout clean; non-worktrees are rejected',async()=>{
 const {cwd,git}=await branchFixture(),dir=await mkdtemp(resolve(tmpdir(),'suffice-wt-'));
 const made=await wt.create(cwd,dir);await writeFile(resolve(made.path,'a.txt'),'from worktree');
 await writeFile(resolve(cwd,'a.txt'),'from main');await git('commit','-am','main edit');
 await assert.rejects(()=>wt.merge(made.path),/Merge into main failed/);
 assert.equal(await git('status','--porcelain'),'');assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),'from main');
 await assert.rejects(()=>wt.merge(cwd),/no worktree/);
 const bare=await mkdtemp(resolve(tmpdir(),'suffice-nogit-'));await assert.rejects(()=>wt.create(bare,dir),/Git project/);
 await wt.discard(made.path);
});
