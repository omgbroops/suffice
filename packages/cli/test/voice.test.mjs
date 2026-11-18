import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {createSufficeSession} from '../src/session.mjs';
import {parseOptions} from '../src/options.mjs';
import {VOICE_RULES,DRAFT_RULES,voicePrompt,withEffortRules,slopHits} from '../src/voice.mjs';
test('prompt assembly per effort: short rules always, drafting passes only at high effort',()=>{
 for(const e of ['off','minimal','low','medium'])assert.equal(voicePrompt(e),VOICE_RULES,e);
 for(const e of ['high','xhigh','max']){const p=voicePrompt(e);assert.ok(p.startsWith(VOICE_RULES));assert.match(p,/draft the reply in your reasoning/);assert.match(p,/two passes/);assert.match(p,/cut every sentence/);}
 assert.equal(withEffortRules(voicePrompt('high'),'high'),voicePrompt('high'),'idempotent');
 assert.ok(VOICE_RULES.length<3000);
});
test('rules carry each requested ban',()=>{
 for(const re of [/Answer first/,/Never introduce yourself/,/environment: no working directory.*process tree/,/Do not ask the user to list/,/No closing offers/,/No em dashes/,/another Suffice product only when it directly solves.*at most once per thread/])assert.match(VOICE_RULES,re);
});
test('session prompt has the voice rules and the drafting rules follow the effort in use now',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-voice-')),runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
 const agent=await createSufficeSession({...parseOptions(['--effort','low']),cwd:home,home,browser:false,desktop:false},runtime);
 try{
  assert.ok(agent.session.systemPrompt.includes(VOICE_RULES));assert.ok(!agent.session.systemPrompt.includes(DRAFT_RULES));
  const run=async()=>({systemPrompt:(await agent.session.extensionRunner.emitBeforeAgentStart({messageType:'user',prompt:'hi'},agent.session._baseSystemPromptOptions)).systemPromptOptions.forceSystemPrompt});
  assert.ok(!(await run()).systemPrompt?.includes(DRAFT_RULES));
  agent.session.setThinkingLevel('high');assert.equal(agent.session.thinkingLevel,'high');
  assert.ok((await run()).systemPrompt.includes(DRAFT_RULES),'drafting rules added at high effort');
  agent.session.setThinkingLevel('low');assert.ok(!(await run()).systemPrompt?.includes(DRAFT_RULES),'and dropped again at low');
 }finally{await agent.dispose();}
});
test('slopHits counts the old tells and passes a plain reply',()=>{
 assert.ok(slopHits("Hi! I'm Suffice, ready to help — want me to start?")>=4);
 assert.equal(slopHits('Hello. What are you working on?'),0);
});
