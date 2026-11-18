import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {createSufficeSession} from '../src/session.mjs';
import {parseOptions} from '../src/options.mjs';
import {cleanTitle,fallbackTitle} from '../src/voice.mjs';
// Titles are written after the first exchange by the thread's own provider; the agent has no title tool and the prompt does not ask for one.
test('agent.title asks the thread provider and returns a clean short title',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-title-')),runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
 let seen;runtime.completeSimple=async(model,context)=>{seen=context;return {content:[{type:'text',text:'"Casual greeting — no task yet."'}]};};
 const agent=await createSufficeSession({...parseOptions([]),cwd:home,home,browser:false,desktop:false,desktopSettings:{naming:'Automatic'}},runtime);
 try{
  assert.equal(agent.session.getToolDefinition('set_session_title'),undefined);assert.doesNotMatch(agent.session.systemPrompt,/set_session_title/);
  assert.equal(await agent.title('hi','Hello. What are you working on?'),'Casual greeting');
  assert.match(seen.systemPrompt,/2 to 5 words/);assert.match(seen.messages[0].content[0].text,/User message:\nhi/);
  runtime.completeSimple=async()=>{throw new Error('offline');};assert.equal(await agent.title('hi','x'),'');
  assert.equal(agent.totals.modelCalls,0);
 }finally{await agent.dispose();}
});
test('title cleaning enforces 2-5 words, sentence case, no dashes or meta',()=>{
 assert.equal(cleanTitle('Greeting — no task yet'),'Greeting');
 assert.equal(cleanTitle('Title: fix greeting typo.'),'Fix greeting typo');
 assert.equal(cleanTitle('"add retry to fetch helper"\nextra line'),'Add retry to fetch helper');
 assert.equal(cleanTitle('This is far too many words for a title'),'');
 assert.equal(cleanTitle(''),'');assert.equal(cleanTitle(undefined),'');
 assert.doesNotMatch(cleanTitle('A – B'),/[–—]/);
});
test('fallback title is never the whole first message',()=>{
 const msg='Can you please refactor the invoice retry handling so it backs off exponentially?';
 const t=fallbackTitle(msg);assert.ok(t.split(' ').length<=4);assert.notEqual(t,msg);assert.equal(fallbackTitle('   '),'New chat');
});
