import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {parseHunks,locate} from '../shared/diff-hunks.mjs';
import {createReviewStore} from '../electron/review-store.mjs';
import {createReviewIpc} from '../electron/review-ipc.mjs';
import {parseOutcomes,renderPrompt} from '../electron/review-prompt.mjs';
import {checkpoint,list,restore} from '../electron/rewind.mjs';
const workspace=createRequire(import.meta.url)('../electron/workspace-files.cjs');
const ID='a'.repeat(32),git=(cwd,...args)=>promisify(execFile)('git',['-C',cwd,...args]);
const base=Array.from({length:60},(_,i)=>`line ${i+1}`);
const edit=(lines,changes)=>lines.map((text,i)=>changes[i+1]??text);
async function fixture(){
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-review-batch-')),home=await mkdtemp(resolve(tmpdir(),'suffice-review-home-'));
 await git(cwd,'init','-q');await writeFile(resolve(cwd,'a.txt'),base.join('\n')+'\n');await git(cwd,'add','.');await git(cwd,'-c','user.name=t','-c','user.email=t@t.invalid','commit','-qm','base');
 const changed=edit(base,{3:'line 3 changed',30:'line 30 changed',57:'line 57 changed'});await writeFile(resolve(cwd,'a.txt'),changed.join('\n')+'\n');
 return {cwd,home,changed};
}
const wire=(cwd,home,extra={})=>{const store=createReviewStore(home);return {store,ipc:createReviewIpc({store,cwdFor:()=>cwd,diffFor:(root,file)=>workspace.diff(root,file),isRunning:()=>false,checkpoint,run:async()=>({text:'[]'}),...extra})};};

test('reject of hunk 2 leaves hunks 1 and 3 byte-identical and Rewind undoes it',async()=>{
 const {cwd,home,changed}=await fixture(),{ipc}=wire(cwd,home);
 const {hunks}=parseHunks((await workspace.diff(cwd,'a.txt')).text);assert.equal(hunks.length,3);
 await ipc.reject(ID,{file:'a.txt',hunkId:hunks[1].id});
 assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),edit(changed,{30:'line 30'}).join('\n')+'\n');
 assert.equal(parseHunks((await workspace.diff(cwd,'a.txt')).text).hunks.length,2);
 const {checkpoints}=await list(cwd,ID);assert.match(checkpoints.at(-1).label,/Before rejecting a change in a\.txt/);
 await restore(cwd,ID,checkpoints.at(-1).id);assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),changed.join('\n')+'\n');
});
test('reject fails closed: unknown hunk writes nothing and no checkpoint is the only side effect',async()=>{
 const {cwd,home,changed}=await fixture(),{ipc}=wire(cwd,home);
 await assert.rejects(ipc.reject(ID,{file:'a.txt',hunkId:'nope'}),/no longer in the file/);
 assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),changed.join('\n')+'\n');
 await assert.rejects(wire(cwd,home,{isRunning:()=>true}).ipc.reject(ID,{file:'a.txt',hunkId:'x'}),/Stop this thread/);
});
test('a comment follows its hunk when lines are inserted above it',async()=>{
 const {cwd,home,changed}=await fixture(),{ipc,store}=wire(cwd,home);
 const first=parseHunks((await workspace.diff(cwd,'a.txt')).text).hunks[1],rel=first.lines.findIndex(l=>l==='+line 30 changed');
 await ipc.add(ID,{file:'a.txt',hunkId:first.id,rel,line:30,text:'rename this'});
 await writeFile(resolve(cwd,'a.txt'),['new 1','new 2','new 3','new 4','new 5',...changed].join('\n')+'\n');
 const {hunks}=parseHunks((await workspace.diff(cwd,'a.txt')).text),[comment]=(await store.state(ID)).comments,at=locate(hunks,comment.hunkId,comment.rel);
 assert.equal(at.line,35);assert.match(at.excerpt,/\+line 30 changed/);
});
test('send: one prompt for all open comments, canned outcomes become chips',async()=>{
 const {cwd,home}=await fixture();let calls=[];
 const {ipc,store}=wire(cwd,home,{run:async payload=>{calls.push(payload);const ids=[...payload.prompt.matchAll(/^\[(\w+)\]/gm)].map(m=>m[1]);return {text:'Done.\n```json\n'+JSON.stringify([{id:ids[0],outcome:'fixed'},{id:ids[1],outcome:'skipped'},{id:ids[2],outcome:'no change needed'}])+'\n```'};}});
 const hunks=parseHunks((await workspace.diff(cwd,'a.txt')).text).hunks;
 for(const [i,h] of hunks.entries())await ipc.add(ID,{file:'a.txt',hunkId:h.id,rel:1,line:3,text:'comment '+i});
 const state=await ipc.send(ID,{model:'m',provider:'p',effort:'low'});
 assert.equal(calls.length,1);assert.equal(calls[0].threadId,ID);assert.match(calls[0].prompt,/a\.txt:\d+\n```diff[\s\S]*Comment: comment 2/);
 assert.deepEqual(state.comments.map(c=>c.state),['fixed','skipped','noop']);
 await assert.rejects(ipc.send(ID,{}),/No comments to send/);
});
test('send: malformed reply or run failure leaves cards sent with an error, never fixed',async()=>{
 for(const run of [async()=>({text:'all fixed, thanks'}),async()=>({text:'[{"id":"zzz","outcome":"fixed"}]'}),async()=>{throw new Error('Model unavailable');}]){
  const {cwd,home}=await fixture(),{ipc,store}=wire(cwd,home,{run}),h=parseHunks((await workspace.diff(cwd,'a.txt')).text).hunks[0];
  await ipc.add(ID,{file:'a.txt',hunkId:h.id,rel:0,line:3,text:'x'});
  const {comments:[c]}=await ipc.send(ID,{});assert.equal(c.state,'sent');assert.ok(c.error);
  assert.equal((await ipc.reopen(ID,c.id)).comments[0].state,'open');
 }
});
test('partial reply: cards without an outcome stay sent with an error',async()=>{
 const {cwd,home}=await fixture(),{ipc}=wire(cwd,home,{run:async p=>({text:JSON.stringify([{id:p.prompt.match(/^\[(\w+)\]/m)[1],outcome:'fixed'}])})}),hunks=parseHunks((await workspace.diff(cwd,'a.txt')).text).hunks;
 for(const h of hunks.slice(0,2))await ipc.add(ID,{file:'a.txt',hunkId:h.id,rel:0,line:3,text:'x'});
 const s=await ipc.send(ID,{});assert.deepEqual(s.comments.map(c=>c.state),['fixed','sent']);assert.ok(s.comments[1].error);
});
test('reviewer findings import as cards on their hunk, once',async()=>{
 const {cwd,home}=await fixture(),{ipc}=wire(cwd,home),finding={path:'a.txt',line:30,severity:'high',message:'Bad.',fix:'Fix it.'};
 await ipc.importFindings(ID,[finding,{...finding,line:999}]);const s=await ipc.importFindings(ID,[finding]);
 assert.equal(s.comments.length,1);assert.equal(s.comments[0].origin,'reviewer');assert.equal(s.comments[0].severity,'high');
});
test('prompt parser: aliases, last array wins, junk throws',()=>{
 assert.deepEqual(parseOutcomes('[1,2] then [{"id":"a","outcome":"No change needed"},{"id":"q","outcome":"fixed"}]',['a']),[{id:'a',outcome:'noop'}]);
 for(const bad of ['','[]','[{"id":"a","outcome":"maybe"}]','[not json'])assert.throws(()=>parseOutcomes(bad,['a']),/did not return outcomes/);
 assert.match(renderPrompt([{id:'a',file:'f.js',line:2,excerpt:'+x',text:'t'}]),/\[a\] f\.js:2/);
});

test('rapid Send: three concurrent sends make one turn',async()=>{
 const {cwd,home}=await fixture();let calls=0;
 const {ipc}=wire(cwd,home,{run:async()=>{calls++;await new Promise(r=>setTimeout(r,50));return {text:'[]'};}});
 const hunks=parseHunks((await workspace.diff(cwd,'a.txt')).text).hunks;
 for(const h of hunks.slice(0,2))await ipc.add(ID,{file:'a.txt',hunkId:h.id,rel:1,line:3,text:'c'});
 await Promise.allSettled([1,2,3].map(()=>ipc.send(ID,{})));
 assert.equal(calls,1);
});

test('reject is refused while a Send turn is in flight, file unchanged, cards stay sent',async()=>{
 const {cwd,home,changed}=await fixture();let release,started;const running=new Promise(r=>{started=r;});
 const {ipc}=wire(cwd,home,{run:()=>new Promise(r=>{release=()=>r({text:'[]'});started();})});
 const hunks=parseHunks((await workspace.diff(cwd,'a.txt')).text).hunks;
 await ipc.add(ID,{file:'a.txt',hunkId:hunks[0].id,rel:1,line:3,text:'c'});
 const sending=ipc.send(ID,{});await running;
 await assert.rejects(ipc.reject(ID,{file:'a.txt',hunkId:hunks[0].id}),/Stop this thread|still working/);
 assert.equal(await readFile(resolve(cwd,'a.txt'),'utf8'),changed.join('\n')+'\n');
 release();const state=await sending;assert.equal(state.comments.length,1);
});

test('a comment over 2000 characters is refused, never cut',async()=>{
 const {cwd,home}=await fixture(),{ipc}=wire(cwd,home);
 const h=parseHunks((await workspace.diff(cwd,'a.txt')).text).hunks[0];
 await assert.rejects(ipc.add(ID,{file:'a.txt',hunkId:h.id,rel:1,line:3,text:'x'.repeat(2001)}),/2000/);
});
