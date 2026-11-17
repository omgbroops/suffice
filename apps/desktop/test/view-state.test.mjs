import test from 'node:test';
import assert from 'node:assert/strict';
import {createThreadViewStore} from '../src/thread-view-state.js';

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
