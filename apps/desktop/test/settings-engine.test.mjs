import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,utimes,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createSettingsStore,settingsDefaults} from '../electron/settings-store.mjs';
import {settingsSections} from '../src/settings-data.js';
import {exportSessions,expireSessions} from '../electron/settings-data-actions.mjs';
import {requiresDesktopApproval} from '../../../packages/cli/src/desktop-policy.mjs';

test('every editable setting persists through the validated desktop store',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-settings-store-')),store=createSettingsStore(home);
 for(const row of settingsSections.flatMap(section=>section.groups.flatMap(group=>group.rows)).filter(row=>row.id&&['toggle','select','segment','palette'].includes(row.type))){const value=settingsDefaults[row.id];await store.set(row.id,value);}
 await Promise.all([store.set('send','Ctrl + Enter'),store.set('tray',true),store.set('auto-compact',true)]);
 await Promise.all([store.set('tab-size','4 spaces'),createSettingsStore(home).set('diff-layout','Split')]);
 await store.set('disabled-models',['openai|fixture-model']);await assert.rejects(store.set('disabled-models',[42]),/Invalid/);
 const reopened=await createSettingsStore(home).get();assert.deepEqual(reopened['disabled-models'],['openai|fixture-model']);assert.equal(reopened.send,'Ctrl + Enter');assert.equal(reopened.tray,true);assert.equal(reopened['auto-compact'],true);assert.equal(reopened['tab-size'],'4 spaces');assert.equal(reopened['diff-layout'],'Split');
 await assert.rejects(store.set('approval-mode','invalid'),/Invalid/);await assert.rejects(store.set('unknown',true),/Unknown/);await assert.rejects(store.set('tray','true'),/Invalid/);
});
test('exports exclude credentials; retention preserves active and fresh conversations',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-settings-data-')),destination=await mkdtemp(resolve(tmpdir(),'suffice-export-'));await mkdir(resolve(home,'sessions','project'),{recursive:true});
 await writeFile(resolve(home,'auth.json'),'secret-fixture');const old=resolve(home,'sessions','project','old.jsonl'),active=resolve(home,'sessions','project','active.jsonl'),fresh=resolve(home,'sessions','project','fresh.jsonl');for(const path of [old,active,fresh])await writeFile(path,'fixture');const then=new Date(Date.now()-100*86400000);await utimes(old,then,then);await utimes(active,then,then);
 const exported=await exportSessions(home,destination);assert.equal(exported.count,3);assert.equal(await readFile(resolve(exported.directory,'project','old.jsonl'),'utf8'),'fixture');await assert.rejects(readFile(resolve(exported.directory,'auth.json')));await assert.rejects(exportSessions(home,home));
 const removed=[];assert.equal(await expireSessions(home,30,{active:new Set([await realpath(active)]),trash:async path=>removed.push(path)}),1);assert.deepEqual(removed,[await realpath(old)]);assert.equal(await readFile(active,'utf8'),'fixture');
});
test('approval policy gates actions and detected pushes while preserving read-only tools',()=>{
 assert.equal(requiresDesktopApproval({'approval-mode':'Ask when needed'},'read',{path:'README.md'}),false);
 assert.equal(requiresDesktopApproval({'approval-mode':'Ask when needed'},'write',{path:'file'}),true);
 assert.equal(requiresDesktopApproval({'approval-mode':'Ask before every action'},'read',{}),true);
 assert.equal(requiresDesktopApproval({'approval-mode':'Never ask','confirm-push':true},'codemode',{code:'await tools.bash({command:"git push origin main"})'}),true);
 assert.equal(requiresDesktopApproval({'approval-mode':'Never ask','confirm-push':false},'bash',{command:'git push'}),false);
});
