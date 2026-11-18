import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createThreadViewStore} from '../src/thread-view-state.js';
const {createViewStateStore}=createRequire(import.meta.url)('../electron/view-state-store.cjs');

test('drafts, tabs, sizing, model and scroll state stay isolated and survive a reload',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const store=createThreadViewStore(storage);
 store.update({draft:'new draft'});store.select('one');
 store.update({draft:'draft one',panelOpen:true,tabs:['files','changes'],activeTab:'changes',panelWidth:344,scrollTop:100,following:false,model:{provider:'openai',model:'fixture',effort:'high'}});
 store.select('two');assert.equal(store.state.draft,'');assert.equal(store.state.panelOpen,false);
 store.update({draft:'draft two',tabs:['files'],activeTab:'files'});
 store.select('one');assert.equal(store.state.draft,'draft one');assert.equal(store.state.activeTab,'changes');
 const reloaded=createThreadViewStore(storage);reloaded.select('one');assert.equal(reloaded.state.panelWidth,344);assert.equal(reloaded.state.scrollTop,100);assert.equal(reloaded.state.model.effort,'high');
 reloaded.select(null);assert.equal(reloaded.state.draft,'new draft');
 reloaded.select('pending:one');reloaded.update({draft:'typed during run',panelOpen:true});reloaded.adopt('real-session');assert.equal(reloaded.id,'real-session');assert.equal(reloaded.state.draft,'typed during run');assert.equal(reloaded.state.panelOpen,true);
});

test('approval modes remain isolated across chats, reloads and session adoption',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const store=createThreadViewStore(storage);
 store.select('one');store.update({approvalMode:'Ask before every action'});
 store.select('two');store.update({approvalMode:'Never ask'});
 store.select('one');assert.equal(store.state.approvalMode,'Ask before every action');
 const loaded=createThreadViewStore(storage);loaded.select('two');assert.equal(loaded.state.approvalMode,'Never ask');
 loaded.select('pending:three');loaded.update({approvalMode:'Ask when needed'});loaded.adopt('three');
 assert.equal(loaded.state.approvalMode,'Ask when needed');loaded.select('one');assert.equal(loaded.state.approvalMode,'Ask before every action');
});

test('native backup accepts every key shape the app emits, keeps drafts across a restart, rejects unsafe keys',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sfx-view-keys-')),p='suffice-thread-view-v1:';
 try{
  const keys=[p+'new',p+'a'.repeat(32),p+'pending:'+'0123abcd-4567-4abc-8def-0123456789ab',p+'session-d741d018',p+'session-import',p+'session-'+'x'.repeat(64)];
  const store=createViewStateStore(dir,{delayMs:1});
  for(const key of keys)await store.save({key,value:JSON.stringify({draft:'keep '+key,updatedAt:1})});
  const restored=await createViewStateStore(dir).load();
  for(const key of keys)assert.equal(JSON.parse(restored[key]).draft,'keep '+key);
  for(const key of [p+'session-a/b',p+'session-..',p+'../x',p+'session-'+'x'.repeat(200),p+'a'.repeat(201),'other:new',p+'session-'])await assert.rejects(store.save({key,value:'{}'}),/Invalid thread view key/,key);
 }finally{await rm(dir,{recursive:true,force:true});}
});
