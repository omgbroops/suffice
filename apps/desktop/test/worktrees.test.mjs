import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,lstat,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {create,list,pin,remove,restore,evict,closeThread,portNote} from '../electron/worktrees.mjs';
import {checkpoint,list as rlist,restore as rewind} from '../electron/rewind.mjs';
const sh=(cwd,cmd)=>execFileSync('sh',['-c',cmd],{cwd,env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}}).toString();
async function fixture(){
 const dir=await realpath(await mkdtemp(join(tmpdir(),'wt-test-'))),repo=join(dir,'repo'),home=join(dir,'home');
 await mkdir(join(repo,'node_modules/pkg'),{recursive:true});
 await writeFile(join(repo,'node_modules/pkg/index.js'),'dep');
 await writeFile(join(repo,'.gitignore'),'node_modules\n.env\n');
 await writeFile(join(repo,'.env'),'SECRET=1');
 await writeFile(join(repo,'.worktreeinclude'),'.env\n');
 await writeFile(join(repo,'a.txt'),'one');
 sh(repo,'git init -q && git add -A && git commit -qm init');
 return {dir,repo,home};
}
test('create links deps, copies includes, allocates distinct ports',async()=>{
 const {dir,repo,home}=await fixture();
 const a=await create(home,repo,{threadId:'t1'}),b=await create(home,repo,{threadId:'t2'});
 assert.deepEqual(a.linked,['node_modules']);assert.deepEqual(a.included,['.env']);
 assert.equal(await readFile(join(a.path,'.env'),'utf8'),'SECRET=1');
 assert.ok((await lstat(join(a.path,'node_modules'))).isSymbolicLink());
 assert.notEqual(a.portBase,b.portBase);
 assert.equal(sh(a.path,'git symbolic-ref -q HEAD || echo detached').trim(),'detached');
 await rm(dir,{recursive:true,force:true});
});
test('rewind restores a file written by a plain shell command',async()=>{
 const {dir,repo,home}=await fixture(),tid='a'.repeat(32);
 const w=await create(home,repo);
 const cp=await checkpoint(w.path,tid,'turn 1',1);assert.ok(cp);
 sh(w.path,'echo hi > made-by-bash.txt && echo two > a.txt');
 await checkpoint(w.path,tid,'turn 2',2);
  const {checkpoints}=await rlist(w.path,tid);
 await rewind(w.path,tid,checkpoints[0].id);
 assert.equal(await readFile(join(w.path,'a.txt'),'utf8'),'one');
 await assert.rejects(lstat(join(w.path,'made-by-bash.txt')));
 await rm(dir,{recursive:true,force:true});
});
test('delete then restore round-trips content; node_modules symlink not followed',async()=>{
 const {dir,repo,home}=await fixture();
 const w=await create(home,repo);
 await writeFile(join(w.path,'new.txt'),'fresh');sh(w.path,'echo edit > a.txt');
 const r=await remove(home,w.id);assert.ok(r.snapshot);
 await assert.rejects(lstat(w.path));
 assert.equal(await readFile(join(repo,'node_modules/pkg/index.js'),'utf8'),'dep');
 await restore(home,w.id);
 assert.equal(await readFile(join(w.path,'new.txt'),'utf8'),'fresh');
 assert.equal(await readFile(join(w.path,'a.txt'),'utf8'),'edit\n');
 await rm(dir,{recursive:true,force:true});
});
test('evict keeps N, skips pinned, removes oldest first',async()=>{
 const {dir,repo,home}=await fixture();
 const ws=[];for(let i=0;i<4;i++){ws.push(await create(home,repo));await new Promise(r=>setTimeout(r,5));}
 await pin(home,ws[0].id,true);
 const gone=await evict(home,2);
 assert.deepEqual(gone,[ws[1].id]);
 const live=(await list(home)).filter(r=>!r.gone&&!r.missing).map(r=>r.id).sort();
 assert.ok(live.includes(ws[0].id)&&live.includes(ws[3].id)&&!live.includes(ws[1].id));
 await rm(dir,{recursive:true,force:true});
});
test('closing a thread removes an unchanged worktree and keeps a changed one',async()=>{
 const {dir,repo,home}=await fixture();
 const a=await create(home,repo,{threadId:'x'}),b=await create(home,repo,{threadId:'y'});
 sh(b.path,'echo z > z.txt');
 assert.deepEqual(await closeThread(home,'x'),[a.id]);
 assert.deepEqual(await closeThread(home,'y'),[]);
 await assert.rejects(lstat(a.path));await lstat(b.path);
 assert.equal(await readFile(join(repo,'node_modules/pkg/index.js'),'utf8'),'dep');
 await rm(dir,{recursive:true,force:true});
});
test('portNote names the worktree ports and is empty elsewhere',async()=>{
 const {dir,repo,home}=await fixture();
 const a=await create(home,repo,{threadId:'p'});
 assert.match(await portNote(home,a.path),new RegExp(`${a.portBase}-${a.portEnd}`));
 assert.equal(await portNote(home,repo),'');
 await rm(dir,{recursive:true,force:true});
});
