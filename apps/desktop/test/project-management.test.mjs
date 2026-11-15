import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';import {createRequire} from 'node:module';import {moveThreadFile} from '../electron/move-thread.mjs';
import {createChatGitTracker,readChatGit,chatGitProjection} from '../electron/chat-git.mjs';
import {branchFixture} from './branch-fixture.mjs';
const {createProjectStore}=createRequire(import.meta.url)('../electron/projects.cjs');
test('project identity persists; removing hides rather than deletes and re-adding restores it',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-project-meta-')),folder=resolve(home,'repo');await mkdir(folder);await writeFile(resolve(folder,'keep.txt'),'preserved');const store=createProjectStore(home),original=await store.add(folder);
 await store.update(folder,{name:'Custom project',pinned:true,projectIcon:{kind:'emoji',emoji:'🌙'},projectImage:null});await assert.rejects(store.update(folder,{projectImage:'https://invalid.example/image.png'}),/Invalid project image/);
 const reloaded=createProjectStore(home);assert.equal((await reloaded.list())[0].name,'Custom project');await reloaded.remove(folder);assert.equal((await reloaded.list()).length,0);assert.deepEqual(await reloaded.hidden(),[folder]);assert.equal(await readFile(resolve(folder,'keep.txt'),'utf8'),'preserved');const restored=await reloaded.add(folder);assert.equal(restored.id,original.id);assert.equal(restored.name,'Custom project');assert.equal(restored.projectIcon.emoji,'🌙');assert.deepEqual(await reloaded.hidden(),[]);
});
test('moving a chat changes only its cwd header and preserves message bytes',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-move-chat-')),target=resolve(home,'target');await mkdir(target);const file=resolve(home,'chat.jsonl'),tail='\r\n'+JSON.stringify({type:'message',message:{role:'user',content:'Original context'}})+'\r\n';await writeFile(file,JSON.stringify({type:'session',id:'fixture',cwd:home})+tail);await moveThreadFile(file,target);const source=await readFile(file,'utf8'),header=JSON.parse(source.slice(0,source.indexOf('\n')));assert.equal(header.cwd,await realpath(target));assert.equal(source.slice(source.indexOf('\n')),tail.slice(1));assert.equal(header.id,'fixture');
});

test('moving a legacy chat rebinds Git metadata to the destination and retains prior context',async()=>{
 const source=await branchFixture(),target=await branchFixture(),home=await mkdtemp(resolve(tmpdir(),'suffice-move-git-')),id='d'.repeat(32),file=resolve(home,'chat.jsonl');await target.git('checkout','safe');
 const tracker=createChatGitTracker({cwd:source.cwd,home,getId:()=>id});await tracker.initialize(true);await tracker.after(null,{name:'bash',args:{command:'gh pr create'},result:{content:[{type:'text',text:'https://github.com/fixture/source/pull/26'}]}});
 const receipt=resolve(home,'chat-git',id+'.json'),legacy=JSON.parse(await readFile(receipt,'utf8'));delete legacy.root;await writeFile(receipt,JSON.stringify(legacy));
 const messages='\n'+JSON.stringify({type:'message',message:{role:'user',content:'Keep my conversation'}})+'\n';await writeFile(file,JSON.stringify({type:'session',cwd:source.cwd})+messages);await moveThreadFile(file,target.cwd,{home,id});
 const moved=await readChatGit(home,id,target.cwd);assert.equal(moved.branch,'safe');assert.equal(moved.pr,null);assert.equal(moved.root,await realpath(target.cwd));assert.equal(moved.previousContexts.at(-1).root,source.cwd);assert.equal(moved.previousContexts.at(-1).pr.number,26);assert.equal(await readChatGit(home,id,source.cwd),null);assert.equal(chatGitProjection({branch:'safe'},moved).branchMismatch,false);assert.equal((await readFile(file,'utf8')).slice((await readFile(file,'utf8')).indexOf('\n')),messages);
 const noGit=resolve(home,'plain');await mkdir(noGit);await moveThreadFile(file,noGit,{home,id});const plain=await readChatGit(home,id,noGit);assert.equal(plain.branch,null);assert.equal(plain.pr,null);assert.equal(plain.worktree,false);assert.equal(plain.gitAvailable,false);
});
