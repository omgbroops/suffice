import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {createChatGitTracker,readChatGit,chatGitProjection,bindChatGitToProject} from '../electron/chat-git.mjs';import {branchFixture} from './branch-fixture.mjs';
test('chat Git receipts isolate branches and explicit PR creation from shared repository state',async()=>{
 const {cwd,git}=await branchFixture(),home=await mkdtemp(resolve(tmpdir(),'suffice-chat-git-')),id='a'.repeat(32),other='b'.repeat(32);
 const tracker=createChatGitTracker({cwd,home,getId:()=>id}),second=createChatGitTracker({cwd,home,getId:()=>other});await tracker.initialize(true);await second.initialize(true);await git('checkout','safe');
 assert.equal((await readChatGit(home,id)).branch,'main');
 const call=(command,result={content:[{type:'text',text:'https://github.com/fixture/repository/pull/26'}]})=>tracker.after(null,{name:'bash',args:{command},result});
 await call('gh pr view');await call('echo "gh pr create"');await call('gh pr create',{isError:true,content:[{type:'text',text:'https://github.com/fixture/repository/pull/26'}]});assert.equal((await readChatGit(home,id)).pr,null);
 await call('gh pr create --title "Fixture" --body "Test"');assert.equal((await readChatGit(home,id)).pr.number,26);assert.equal((await readChatGit(home,other)).pr,null);
 const live={branch:'safe',pr:{number:999},worktree:true,diff:{added:10},projectDiff:{added:20}};
 const legacy=chatGitProjection(live,null);assert.equal(legacy.pr,null);assert.equal(legacy.branch,null);assert.equal(legacy.gitUnknown,true);assert.equal(legacy.projectDiff.added,20);assert.equal(legacy.diff,undefined);
 assert.equal(chatGitProjection(live,await readChatGit(home,id)).branchMismatch,true);
 await call('git switch safe',{content:[]});assert.equal((await readChatGit(home,id)).branch,'safe');
 const resumed=createChatGitTracker({cwd,home,getId:()=>'c'.repeat(32)});await resumed.initialize(false);assert.equal(await readChatGit(home,'c'.repeat(32)),null);
});


test('project aliases retain the same receipt and do not add a prior context',async()=>{
 const {cwd}=await branchFixture(),home=await mkdtemp(resolve(tmpdir(),'suffice-chat-alias-')),alias=resolve(home,'project-link'),id='d'.repeat(32);
 await symlink(cwd,alias,process.platform==='win32'?'junction':'dir');
 const tracker=createChatGitTracker({cwd,home,getId:()=>id});await tracker.initialize(true);
 const original=await readChatGit(home,id);assert.deepEqual(await readChatGit(home,id,alias),original);
 assert.deepEqual(await bindChatGitToProject(home,id,alias),original);
 const resumed=createChatGitTracker({cwd:alias,home,getId:()=>id});await resumed.initialize(false);
 assert.deepEqual(await readChatGit(home,id),original);
 const unrelated=await mkdtemp(resolve(tmpdir(),'suffice-chat-other-'));assert.equal(await readChatGit(home,id,unrelated),null);
});
