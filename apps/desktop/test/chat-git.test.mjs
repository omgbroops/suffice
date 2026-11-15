import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {createChatGitTracker,readChatGit,chatGitProjection} from '../electron/chat-git.mjs';import {branchFixture} from './branch-fixture.mjs';
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
