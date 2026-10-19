import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {parseOptions} from '../src/options.mjs';
import {createRouting,complexity,selectRoute} from '../src/routing.mjs';
import {createSufficeSession} from '../src/session.mjs';

const complex='Fix asynchronous queue cancellation errors and preserve default compatibility';
function harness({preference={mode:'auto'},history=[],failModel=false}={}) {
  const events=new Map(),commands=new Map(),records=[],notifications=[],selections=[];
  let effort='low';
  const ctx={mode:'tui',model:{id:'gpt-6.1-sol',provider:'openai'},
    sessionManager:{getBranch:()=>history},waitForIdle:async()=>{},
    ui:{setStatus(){},notify:(text,type)=>notifications.push({text,type})}};
  const runtime={getModel:(provider,id)=>({provider,id})};
  const router=createRouting({runtime,preference,record:e=>records.push(e)});
  const emit=async(name,e={})=>events.get(name)?.(e,ctx);
  router.extension({on:(name,fn)=>events.set(name,fn),registerCommand:(name,c)=>commands.set(name,c),
    async setModel(model){
      if(failModel)return false;
      ctx.model=model;selections.push(model.id);
      await emit('model_select',{model,source:'set'});return true;
    },setThinkingLevel(level){effort=level;void emit('thinking_level_select',{level});},getThinkingLevel:()=>effort});
  router.activate();
  return {router,ctx,emit,commands,records,preference,notifications,selections,get effort(){return effort;}};
}

test('CLI auto routing defaults, manual overrides and conflicts are explicit',()=>{
  assert.equal(parseOptions([]).routing,'auto');
  assert.equal(parseOptions(['--routing','off']).routing,'off');
  assert.equal(parseOptions(['--model','gpt-6-luna']).routing,'off');
  assert.equal(parseOptions(['--effort','xhigh']).routing,'off');
  assert.throws(()=>parseOptions(['--routing','smart']),/auto or off/);
  assert.throws(()=>parseOptions(['--routing','auto','--effort','low']),/chooses the model/);
  assert.throws(()=>parseOptions(['--model','gpt-6-luna','--routing','auto']),/chooses the model/);
});

test('first-task classification handles compatibility, failures and long specifications',()=>{
  const prompts=[['Fix a spelling mistake',false],[complex,true],['Keep default API compatibility',false],['error '.repeat(221),true],['Fix async events',false],['Refactor cross-module integration and metadata',true]];
  for(const [prompt,expected] of prompts) {
    const c=complexity(prompt);
    assert.equal(c.complex,expected);
    assert.equal(selectRoute(prompt).model,c.complex?'gpt-6.1-sol':'gpt-6-luna');
  }
  assert.equal(selectRoute('Fix spelling').effort,'high');
  assert.equal(selectRoute(complex).effort,'low');
});

test('native input events route before execution and hold Sol for short follow-ups',async()=>{
  const h=harness();await h.emit('session_start');
  assert.deepEqual(await h.emit('input',{text:'Fix spelling'}),{action:'continue'});
  assert.equal(h.ctx.model.id,'gpt-6-luna');assert.equal(h.effort,'high');
  assert.equal(h.preference.mode,'auto'); // Router-driven model events are not manual overrides.
  await h.emit('input',{text:complex});
  assert.equal(h.ctx.model.id,'gpt-6.1-sol');assert.equal(h.effort,'low');
  await h.emit('input',{text:'continue'});
  assert.equal(h.ctx.model.id,'gpt-6.1-sol');
  assert.equal(h.records.at(-1).complexContext,true);
  const fresh=harness();await fresh.emit('input',{text:'continue'});
  assert.equal(fresh.ctx.model.id,'gpt-6-luna');
});

test('model and effort controls disable auto routing, and /routing restores it',async()=>{
  const h=harness();await h.emit('session_start');
  await h.emit('model_select',{source:'set'});
  assert.equal(h.preference.mode,'off');
  await h.emit('input',{text:'Fix spelling'});
  assert.equal(h.selections.length,0);
  await h.commands.get('routing').handler('auto',h.ctx);
  await h.emit('input',{text:'Fix spelling'});
  assert.equal(h.ctx.model.id,'gpt-6-luna');
  await h.emit('thinking_level_select',{level:'xhigh'});
  assert.equal(h.preference.mode,'off');
  await h.commands.get('routing').handler('invalid',h.ctx);
  assert.equal(h.preference.mode,'off');assert.equal(h.notifications.at(-1).type,'error');
});

test('queued steering does not switch an active model and carries complexity to next idle input',async()=>{
  const h=harness();await h.emit('input',{text:'Fix spelling'});
  await h.emit('input',{text:complex,streamingBehavior:'steer'});
  assert.equal(h.ctx.model.id,'gpt-6-luna');assert.equal(h.records.at(-1).phase,'deferred');
  await h.emit('input',{text:'continue'});
  assert.equal(h.ctx.model.id,'gpt-6.1-sol');
});

test('restored branch history and manually entered complex context prevent unsafe downgrades',async()=>{
  const history=[{type:'message',message:{role:'user',content:[{type:'text',text:complex}]}}];
  const resumed=harness({history});await resumed.emit('session_start');await resumed.emit('input',{text:'continue'});
  assert.equal(resumed.ctx.model.id,'gpt-6.1-sol');
  const manualHistory=[],manual=harness({history:manualHistory,preference:{mode:'off'}});
  await manual.emit('session_start');manualHistory.push(...history);
  await manual.commands.get('routing').handler('auto',manual.ctx);await manual.emit('input',{text:'continue'});
  assert.equal(manual.ctx.model.id,'gpt-6.1-sol');
  const image=harness();await image.emit('input',{text:'Fix this',images:[{type:'image'}]});
  assert.equal(image.ctx.model.id,'gpt-6.1-sol');
});

test('route failures consume no prompt and never silently use the wrong model',async()=>{
  const h=harness({failModel:true});
  assert.deepEqual(await h.emit('input',{text:'Fix spelling'}),{action:'handled'});
  assert.match(h.router.error.message,/Cannot select/);
  assert.equal(h.records.at(-1).phase,'error');
  assert.equal(h.ctx.model.id,'gpt-6.1-sol');
  assert.throws(()=>createRouting({preference:{mode:'auto'},runtime:{getModel:()=>null}}),/absent/);
});

test('real Pi dispatch applies routing and manual commands without model inference',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-routing-'));
  let control;
  try {
    const cwd=resolve(dir,'repo');await mkdir(cwd);
    const runtime=await ModelRuntime.create({authPath:resolve(dir,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
    runtime.checkAuth=async()=>false; // Never use ambient credentials or make a provider call.
    control=await createSufficeSession({...parseOptions([]),cwd,home:dir},runtime);
    await control.session.prompt('/routing off');assert.equal(control.routingPreference.mode,'off');
    await control.session.prompt('/routing auto');assert.equal(control.routingPreference.mode,'auto');
    // Authentication is deliberately absent. A simple input must be handled by
    // the router rather than reaching inference with the initial Sol model.
    await assert.rejects(control.run('Fix a spelling mistake'),/Cannot select|No API key/);
    assert.equal(control.totals.modelCalls,0);
    await control.flush();
    const rows=(await readFile(control.eventPath,'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(rows.some(e=>e.type==='routing'&&e.phase==='error'&&e.model==='gpt-6-luna'));
    assert.ok(!rows.some(e=>e.type==='provider_request'));
  } finally {await control?.dispose();await rm(dir,{recursive:true,force:true});}
});
