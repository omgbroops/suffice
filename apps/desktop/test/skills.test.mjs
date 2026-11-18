import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createSkillLibrary} from '../electron/skills.mjs';
import {createHarnessHost} from '../electron/worker.mjs';

test('skill library seeds starters, scopes by project, validates, and builds run context',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-skills-')),lib=createSkillLibrary(home);
 let list=await lib.list('/p/a');assert.deepEqual(list.map(s=>s.name),['Code review','Write tests','Explain codebase','Fix CI']);
 list=await lib.save({name:'House style',description:'d',instructions:'Use tabs.',files:[{name:'a.txt',text:'FILE-BODY'}],scope:'project'},'/p/a');
 const mine=list.find(s=>s.name==='House style');assert.equal(mine.scope,'project');
 assert.equal((await lib.list('/p/b')).length,4,'project skills stay in their project');
 await assert.rejects(lib.save({name:'',instructions:'x',scope:'user'},'/p/a'),/Name is required/);
 await assert.rejects(lib.save({name:'x',instructions:'x',scope:'project'},null),/Choose a project/);
 await assert.rejects(lib.save({name:'x',instructions:'x',files:Array(6).fill({name:'f',text:''})},'/p/a'),/up to 5/);
 await lib.save({id:mine.id,name:'House style',instructions:'Use spaces.'},'/p/a');
 const ctx=await lib.context([mine.id,'starter-fix-ci','nope'],'/p/a');
 assert.match(ctx,/Use spaces\./);assert.match(ctx,/FILE-BODY/);assert.match(ctx,/Fix the failing CI run/);assert.doesNotMatch(ctx,/Use tabs/);
 assert.equal(await lib.context([],'/p/a'),'');assert.equal(await lib.context([mine.id],'/p/b'),'','project skill is not sent from another project');
 list=await lib.remove('starter-fix-ci','/p/a');assert.equal(list.some(s=>s.id==='starter-fix-ci'),false);
 assert.equal((await createSkillLibrary(home).list('/p/a')).some(s=>s.id==='starter-fix-ci'),false,'deleted starters stay deleted');
});

test('worker sends attached skill text as system context and rebuilds the agent when it changes',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-skills-host-')),cwd=await mkdtemp(resolve(tmpdir(),'suffice-skills-cwd-')),path=resolve(home,'s.jsonl');
 await writeFile(path,JSON.stringify({type:'session',version:3,id:'s',timestamp:new Date().toISOString(),cwd})+'\n');
 const messages=[],captured=[];
 const host=createHarnessHost({home,send:m=>messages.push(m),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async options=>{captured.push(options);return {session:{setSessionName(){},subscribe(){},setThinkingLevel(){}},sessionPath:()=>path,dispose:async()=>{},run:async()=>'ok'};}});
 await host({id:1,action:'status'});
 await host({id:2,action:'run',payload:{prompt:'a',effort:'low',cwd,desktopSettings:{},skillContext:'\nSKILL-TEXT\n'}});
 await host({id:3,action:'run',payload:{prompt:'b',effort:'low',cwd,desktopSettings:{},skillContext:''}});
 assert.match(captured[0].additionalContext,/SKILL-TEXT/);assert.equal(captured.length,2);assert.doesNotMatch(captured[1].additionalContext,/SKILL-TEXT/);
});
