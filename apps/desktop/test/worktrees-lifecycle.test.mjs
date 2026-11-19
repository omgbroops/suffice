import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {create,adopt,claim,list,remove,evict,closeThread} from '../electron/worktrees.mjs';
const sh=(cwd,cmd)=>execFileSync('sh',['-c',cmd],{cwd,env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}}).toString();
async function fixture(){
 const dir=await realpath(await mkdtemp(join(tmpdir(),'wt-life-'))),repo=join(dir,'repo'),home=join(dir,'home');
 await mkdir(repo,{recursive:true});await writeFile(join(repo,'a.txt'),'one');sh(repo,'git init -q && git add -A && git commit -qm init');
 return {dir,repo,home};
}
test('adopt stores the realpath and claim swaps the pending id for the thread id',async()=>{
 const {dir,repo,home}=await fixture(),link=join(dir,'link');
 await mkdir(join(home,'worktrees'),{recursive:true});
 sh(repo,`git worktree add -q --detach ${join(home,'worktrees','x')}`);await symlink(join(home,'worktrees'),link);
 const item=await adopt(home,repo,join(link,'x'),'pending:abc');
 assert.equal(item.path,join(home,'worktrees','x'));
 assert.equal(await claim(home,'pending:abc','a'.repeat(32)),1);
 assert.equal((await list(home))[0].threadId,'a'.repeat(32));
 // closeThread now matches by the real id: unchanged worktree is removed.
 assert.deepEqual((await closeThread(home,'a'.repeat(32))).length,1);
});
test('ports of deleted worktrees are reused',async()=>{
 const {repo,home}=await fixture();
 const a=await create(home,repo),b=await create(home,repo);await remove(home,a.id);
 assert.equal((await create(home,repo)).portBase,a.portBase);assert.notEqual(b.portBase,a.portBase);
});
test('evict never removes a worktree whose thread is running',async()=>{
 const {repo,home}=await fixture();
 const a=await create(home,repo,{threadId:'run'}),b=await create(home,repo,{threadId:'idle'}),c=await create(home,repo,{threadId:'new'});
 const gone=await evict(home,1,new Set(['run']));
 assert.deepEqual(gone,[b.id]);assert.ok(a.id&&c.id);
});
