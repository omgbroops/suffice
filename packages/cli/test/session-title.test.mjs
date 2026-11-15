import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {createSufficeSession} from '../src/session.mjs';
import {parseOptions} from '../src/options.mjs';
test('Automatic exposes an agent title tool and persists its name without inference',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-title-')),runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
 for(const naming of ['Automatic','First message','Untitled']){
  let notified;const agent=await createSufficeSession({...parseOptions([]),cwd:home,home,browser:false,desktop:false,desktopSettings:{naming},onTitleChanged:title=>notified=title},runtime);
  try{const tool=agent.session.getToolDefinition('set_session_title');assert.equal(!!tool,naming==='Automatic');if(tool){assert.match(agent.session.systemPrompt,/Before doing the task, call set_session_title/);agent.session.sessionManager.appendMessage({role:'assistant',content:[{type:'text',text:'Fixture'}],timestamp:Date.now()});assert.ok(agent.session.getCallableToolNames().includes('set_session_title'));await tool.execute('name',{title:'Fix invoice retry handling'});assert.equal(notified,'Fix invoice retry handling');assert.match(await readFile(agent.sessionPath(),'utf8'),/Fix invoice retry handling/);await assert.rejects(tool.execute('bad',{title:'bad\nname'}),/single-line/);}assert.equal(agent.totals.modelCalls,0);}finally{await agent.dispose();}
 }
});
