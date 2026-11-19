import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {forkSavedThread} from '../electron/fork-thread.mjs';import {createThreadStore} from '../electron/threads.mjs';
const ts=new Date().toISOString(),now=Date.now();
const user=(id,parentId,text)=>({type:'message',id,parentId,timestamp:ts,message:{role:'user',content:[{type:'text',text}],timestamp:now}});
const asst=(id,parentId,text)=>({type:'message',id,parentId,timestamp:ts,message:{role:'assistant',content:[{type:'text',text}],api:'x',provider:'p',model:'m',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:now}});
async function fixture(){
 const home=await mkdtemp(resolve(tmpdir(),'suffice-fr-wc-')),dir=resolve(home,'sessions','f'),cwd=resolve(home,'project');await mkdir(dir,{recursive:true});await mkdir(cwd);
 const path=resolve(dir,'2026-01-01T00-00-00-000Z_s.jsonl');
 await writeFile(path,[{type:'session',version:3,id:'s',timestamp:ts,cwd},user('u1',null,'q1'),asst('a1','u1','r1'),user('u2','a1','q2'),asst('a2','u2','r2')].map(JSON.stringify).join('\n')+'\n');return {home,cwd,path};
}
const ids=async(home,id)=>{const s=createThreadStore(home);await s.list();return (await s.open(id)).messages.map(m=>m.entryId);};
test('rewind to a turn forks the conversation before it or after it',async()=>{
 const {home,cwd,path}=await fixture();
 assert.deepEqual(await ids(home,(await forkSavedThread({sourcePath:path,cwd,home,turn:2,kind:'turn'})).id),['u1','a1']);
 assert.deepEqual(await ids(home,(await forkSavedThread({sourcePath:path,cwd,home,turn:1,kind:'end'})).id),['u1','a1']);
 assert.deepEqual(await ids(home,(await forkSavedThread({sourcePath:path,cwd,home,turn:2,kind:'end'})).id),['u1','a1','u2','a2']);
 await assert.rejects(forkSavedThread({sourcePath:path,cwd,home,turn:9,kind:'turn'}),/Turn not found/);
});
test('wiring: archive closes the worktree, adopt is awaited, rewind offers the conversation option',async()=>{
 const rd=f=>readFile(new URL('../'+f,import.meta.url),'utf8'),main=await rd('electron/main.cjs'),ui=await rd('src/threads-ui.js'),view=await rd('src/rewind-view.js');
 assert.match(main,/await w\.adopt\([^;]*\)\.catch\(\(\)=>\{\}\);/);
 assert.match(main,/action==='close'[^;]*closeThread/);
 assert.match(ui,/patch\.archived===true\)api\.worktreesAction\(\{action:'close'/);
 assert.match(view,/type='checkbox';chat\.checked=convo/);assert.match(view,/convo=false/);
});
