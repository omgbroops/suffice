import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {checkpoint,list,restore} from '../electron/rewind.mjs';

const T='a'.repeat(32),run=promisify(execFile);
async function repo(){
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-rewind-test-')),git=(...a)=>run('git',['-C',cwd,...a]).then(r=>r.stdout);
 await git('init','-q');await writeFile(resolve(cwd,'.gitignore'),'ignored.log\n');await writeFile(resolve(cwd,'a.txt'),'one\n');await writeFile(resolve(cwd,'gone.txt'),'keep me\n');
 await git('add','.');await git('-c','user.name=F','-c','user.email=f@example.invalid','commit','-qm','base');return {cwd,git};
}
const exists=p=>access(p).then(()=>true,()=>false);

test('checkpoints use a private ref namespace and leave index, stash and HEAD alone',async()=>{
 const {cwd,git}=await repo();const head=await git('rev-parse','HEAD');
 await writeFile(resolve(cwd,'a.txt'),'two\n');await writeFile(resolve(cwd,'new.txt'),'untracked\n');
 await checkpoint(cwd,T,'Add feature',1);
 assert.match(await git('for-each-ref','refs/suffice/rewind/'+T+'/'),/refs\/suffice\/rewind\/a{32}\/00001/);
 assert.equal(await git('stash','list'),'');assert.equal(await git('diff','--cached','--name-only'),'');assert.equal(await git('rev-parse','HEAD'),head);
 assert.equal(await git('status','--porcelain'),' M a.txt\n?? new.txt\n');
 const {git:isGit,checkpoints}=await list(cwd,T);assert.equal(isGit,true);assert.equal(checkpoints.length,1);
 assert.equal(checkpoints[0].label,'Add feature');assert.equal(checkpoints[0].turn,1);assert.deepEqual(checkpoints[0].vsNow,{files:0,added:0,removed:0});
});

test('restore returns the tree to a turn, removes later files, keeps ignored files, and is undoable',async()=>{
 const {cwd}=await repo();
 await writeFile(resolve(cwd,'a.txt'),'two\n');await checkpoint(cwd,T,'Turn two',2); // state before turn 2
 await writeFile(resolve(cwd,'a.txt'),'three\n');await mkdir(resolve(cwd,'deep/er'),{recursive:true});await writeFile(resolve(cwd,'deep/er/x.txt'),'x\n');
 await writeFile(resolve(cwd,'gone.txt'),'edited\n');await rm(resolve(cwd,'gone.txt'));await writeFile(resolve(cwd,'ignored.log'),'secret\n');
 const before=(await list(cwd,T)).checkpoints[0];assert.equal(before.vsNow.files,3);
 const result=await restore(cwd,T,before.id);assert.equal(result.files,3);
 assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),'two\n');assert.equal(await readFile(resolve(cwd,'gone.txt'),'utf8'),'keep me\n');
 assert.equal(await exists(resolve(cwd,'deep')),false);assert.equal(await readFile(resolve(cwd,'ignored.log'),'utf8'),'secret\n');
 const after=(await list(cwd,T)).checkpoints;assert.equal(after.length,2);assert.equal(after[1].kind,'rewind');assert.match(after[1].label,/turn 2/);
 await restore(cwd,T,after[1].id); // undo
 assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),'three\n');assert.equal(await readFile(resolve(cwd,'deep/er/x.txt'),'utf8'),'x\n');assert.equal(await exists(resolve(cwd,'gone.txt')),false);
});

test('threads are isolated and bad input is refused',async()=>{
 const {cwd}=await repo();await checkpoint(cwd,T,'one');await checkpoint(cwd,T,'two');assert.deepEqual((await list(cwd,T)).checkpoints.map(c=>c.turn),[1,2]);
 assert.equal((await list(cwd,'b'.repeat(32))).checkpoints.length,0);
 await assert.rejects(()=>checkpoint(cwd,'../x','bad',1),/Invalid thread/);
 await assert.rejects(()=>restore(cwd,T,'not-a-sha'),/Invalid checkpoint/);
 const first=(await list(cwd,T)).checkpoints[0].id;
 await assert.rejects(()=>restore(cwd,'b'.repeat(32),first),/not found/);
 const plain=await mkdtemp(resolve(tmpdir(),'suffice-rewind-plain-'));
 assert.deepEqual(await list(plain,T),{git:false,checkpoints:[]});assert.equal(await checkpoint(plain,T,'x',1),null);
});
