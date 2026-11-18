import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {contextItems,applyContext,summarize,messageId,REMOVED} from '../shared/context-items.mjs';
import {createHarnessHost} from '../electron/worker.mjs';

const big='line of output\n'.repeat(600);
const messages=[
 {role:'user',timestamp:1,content:[{type:'text',text:'read the config'}]},
 {role:'assistant',timestamp:2,content:[{type:'text',text:'reading'},{type:'toolCall',id:'c1',name:'read',arguments:{path:'/p/config.json'}},{type:'toolCall',id:'c2',name:'bash',arguments:{command:'ls'}}]},
 {role:'toolResult',timestamp:3,toolCallId:'c1',toolName:'read',content:[{type:'text',text:'{"a":1}'}]},
 {role:'toolResult',timestamp:4,toolCallId:'c2',toolName:'bash',content:[{type:'text',text:big}]},
 {role:'assistant',timestamp:5,content:[{type:'text',text:'done'}]},
];
const inventory={system:'x'.repeat(4000)+'skill-a desc',skills:[{name:'skill-a',description:'desc'}],tools:[{name:'bash',description:'run',parameters:{type:'object'}}],messages};

test('inventory groups system, skills, tool schemas, files and history with token counts',()=>{
 const items=contextItems(inventory),by=kind=>items.filter(i=>i.kind===kind);
 assert.equal(by('system').length,1);assert.ok(by('system')[0].tokens>=1000);
 assert.deepEqual(by('skills').map(i=>i.label),['skill-a']);
 assert.deepEqual(by('tools').map(i=>i.label),['bash']);
 assert.deepEqual(by('files').map(i=>i.label),['/p/config.json']);
 assert.equal(by('history').length,4);
 const long=items.find(i=>i.label==='bash result');assert.ok(long.tokens>1000);assert.ok(long.summaryTokens<100);
 assert.equal(items.find(i=>i.label.startsWith('Assistant: reading')).fixed,true,'assistant turns with tool calls stay paired with their results');
 assert.ok(items.every(i=>i.tokens>0));
});

test('removing an item and summaries-only change only what the next turn sends',()=>{
 const items=contextItems(inventory),user=items.find(i=>i.label.startsWith('You:')),file=items.find(i=>i.kind==='files');
 const out=applyContext(messages,{exclude:[user.id,file.id,'tool:bash'],summaries:true});
 assert.equal(out.length,messages.length);
 assert.equal(out[0].content[0].text,REMOVED);assert.equal(out[2].content[0].text,REMOVED);
 assert.equal(out[1],messages[1]);
 assert.match(out[3].content[0].text,/\[Summary: 601 lines/);assert.ok(out[3].content[0].text.length<400);
 assert.equal(messages[3].content[0].text,big,'input is not mutated');
 assert.equal(applyContext(messages,{exclude:[messageId(messages[1],1)]})[1],messages[1],'assistant tool calls are never removed');
 assert.match(summarize('a\nb\nc\nd'),/4 lines/);
});

test('host reports the inventory and applies choices to the next run only',async()=>{
 const sent=[];let transform,setTools=[],transformed;
 const session={agent:{transformContext:undefined},messages,systemPrompt:inventory.system,resourceLoader:{getSkills:()=>({skills:inventory.skills})},getAllTools:()=>[{name:'bash',description:'run',parameters:{}},{name:'grep',description:'g',parameters:{}}],getActiveToolNames:()=>['bash','grep'],setActiveToolsByName:names=>setTools.push(names),model:{contextWindow:200000},subscribe:fn=>{session.fn=fn;},setThinkingLevel(){},getSessionStats:()=>({})};
 const agent={session,totals:{},sessionPath:()=>'/t/s',dispose:async()=>{},run:async()=>{session.fn({type:'message_start',message:{role:'assistant'}});transform=session.agent.transformContext;transformed=await transform(messages);return 'ok';}};
 const host=createHarnessHost({home:await mkdtemp(resolve(tmpdir(),'suffice-ctx-')),send:m=>sent.push(m),createRuntime:async()=>({isUsingSubscription:()=>true}),createSession:async()=>agent});
 const cwd=await mkdtemp(resolve(tmpdir(),'suffice-ctx-cwd-'));
 await host({id:1,action:'status'});
 const ids=contextItems(inventory).filter(i=>i.kind==='history'&&i.label.startsWith('You:')).map(i=>i.id);
 await host({id:2,action:'run',payload:{prompt:'go',effort:'low',cwd,context:{exclude:[...ids,'tool:grep'],summaries:true}}});
 assert.equal(sent.find(m=>m.id===2).ok,true);
 assert.equal(transformed[0].content[0].text,REMOVED);assert.match(transformed[3].content[0].text,/Summary/);
 assert.deepEqual(setTools[0],['bash'],'excluded tool schema is not declared on that run');
 assert.deepEqual(setTools.at(-1),['bash','grep'],'tools restored after the run');
 assert.equal(session.agent.transformContext,undefined,'hook removed after the run');
 await host({id:3,action:'context'});
 const result=sent.find(m=>m.id===3).result;
 assert.equal(result.window,200000);assert.ok(result.items.some(i=>i.kind==='tools'&&i.label==='grep'));
 assert.equal(result.turns.length,1);assert.deepEqual(result.turns[0].removed,[...ids,'tool:grep']);assert.equal(result.turns[0].summaries,true);
 await host({id:4,action:'run',payload:{prompt:'again',effort:'low',cwd}});
 assert.equal(setTools.length,2,'a run with no choices leaves tools alone');
 await host({id:5,action:'reset'});
 await host({id:6,action:'run',payload:{prompt:'fresh',effort:'low',cwd}});
 await host({id:7,action:'context'});
 assert.deepEqual(sent.find(m=>m.id===7).result.turns.map(t=>t.n),[1],'turns restart at 1 after reset');
});
