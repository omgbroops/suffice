import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSessionProjection} from '@earendil-works/pi-coding-agent';
import {transcriptMessages} from '../../../apps/desktop/electron/transcript-messages.mjs';
import {savedUsage} from '../../../apps/desktop/electron/usage.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const bin=resolve(root,'crates/suffice-session/target/debug/suffice-session'+(process.platform==='win32'?'.exe':''));
const rust=req=>{const p=spawnSync(bin,{input:JSON.stringify(req),encoding:'utf8'});assert.equal(p.status,0,p.stderr);const v=JSON.parse(p.stdout);assert.equal(v.ok,true,v.error);return v.result};
const normalize=message=>({role:message.role,timestamp:message.timestamp,provider:message.provider,model:message.model,turn:message.turn,displayText:message.displayText,attachments:message.attachments,kind:message.kind,automatic:message.automatic,toolName:message.toolName,toolCallId:message.toolCallId,isError:message.isError,content:typeof message.content==='string'?[{type:'text',text:message.content}]:(Array.isArray(message.content)?message.content:[{type:'text',text:message.output||JSON.stringify(message,null,2)}]).map(part=>part.type==='text'?{type:'text',text:part.text}:part.type==='thinking'?{type:'thinking',text:part.thinking}:part.type==='toolCall'?{type:'toolCall',id:part.id,name:part.name,text:JSON.stringify(part.arguments,null,2)}:part.type==='image'?{type:'image',data:part.data,mimeType:part.mimeType}:{type:part.type,text:`[${part.type}]`})});
const oracle=(entries,leaf,contextWindow)=>JSON.parse(JSON.stringify({messages:transcriptMessages(buildSessionProjection(entries.filter(e=>e.type!=='session'),leaf),entries).map(normalize),usage:savedUsage(entries,{contextWindow})}));
const msg=(id,parentId,role,content,extra={})=>({type:'message',id,parentId,message:{role,content,timestamp:123,...extra}});
const custom=(id,parentId,customType,data)=>({type:'custom',id,parentId,customType,data});
const hash=t=>createHash('sha256').update(t).digest('hex');
const usage={input:10,output:4,cacheRead:3,cacheWrite:2,totalTokens:30,cost:{total:0.25}};
const fixtures=[
 [custom('start',null,'suffice:turn-start',{id:'turn',startedAt:'start',promptHash:hash('hello'),displayPrompt:'shown',attachments:[{name:'pic'}]}),msg('u','start','user','hello'),msg('a','u','assistant',[{type:'thinking',thinking:'thought'},{type:'toolCall',id:'call',name:'read',arguments:{z:1,a:2}}],{provider:'p',model:'m',usage}),custom('end','a','suffice:turn-end',{id:'turn',endedAt:'end'})],
 [msg('u',null,'user','old'),msg('a','u','assistant','kept',{stopReason:'aborted'}),{type:'compaction',id:'c',parentId:'a',summary:'PRIVATE SUMMARY',firstKeptEntryId:'a',tokensBefore:1},custom('reason','c','suffice:compaction',{entryId:'c',reason:'manual'}),custom('interrupt','reason','suffice:interrupted',{}),custom('interrupt2','interrupt','suffice:interrupted',{}),msg('z','interrupt2','user','new')],
 [msg('u',null,'user','prompt\n\nAttached local files (user-provided data):\n'+JSON.stringify({name:'a.png',path:'/private/a',size:2})+'\n'+JSON.stringify({name:'b.txt',path:'/private/b',size:3})),msg('a','u','assistant','result',{usage:{...usage,totalTokens:0}})],
 [msg('u',null,'user','branch'),msg('a','u','assistant','hidden',{usage}),msg('b','u','user','chosen'),msg('c','b','assistant',[{type:'image',data:'x',mimeType:'image/png'},{type:'unknown'}],{usage:{input:2}})],
 [msg('u',null,'user','prompt\n\nAttached local files (user-provided data):\n'+Array.from({length:21},(_,i)=>JSON.stringify({name:`${i}.png`,path:'/x',size:1})).join('\n'))],
];
for(const [i,entries] of fixtures.entries())test(`desktop presentation and usage ${i}`,()=>{for(const leaf of [undefined,entries[0].id]){const actual=rust({op:'present',entries,leaf,contextWindow:100});assert.deepEqual(actual,oracle(entries,leaf,100));assert.ok(!JSON.stringify(actual.messages).includes('PRIVATE SUMMARY'));}});
test('saved file presentation leaves bytes unchanged',async()=>{const dir=await mkdtemp(resolve(tmpdir(),'suffice-present-'));try{await mkdir(resolve(dir,'group'));const file=resolve(dir,'group','session.jsonl'),entries=[{type:'session',version:3,id:'id',timestamp:'2025-01-01T00:00:00Z',cwd:'/test'},...fixtures[0]];await writeFile(file,entries.map(JSON.stringify).join('\n')+'\n');const digest=async()=>hash(await readFile(file));const before=await digest();const got=rust({op:'present_session',root:dir,relativePath:'group/session.jsonl',contextWindow:100});assert.deepEqual(got,oracle(entries,undefined,100));assert.equal(await digest(),before);}finally{await rm(dir,{recursive:true,force:true})}});
test('turn aliases backfill and latest end metadata',()=>{const entries=[custom('t',null,'suffice:turn-start',{id:'turn'}),msg('u','t','user','x'),msg('a','u','assistant','y',{provider:'p',model:'m'}),custom('e1','a','suffice:turn-end',{id:'turn',endedAt:1}),custom('e2','e1','suffice:turn-end',{id:'turn',endedAt:2})];const result=rust({op:'present',entries});assert.deepEqual(result,oracle(entries));assert.equal(result.messages[0].turn.provider,'p');assert.equal(result.messages[0].turn.endedAt,2)});
test('unmatched display hash and invalid attachment marker remain visible',()=>{for(const tail of ['{"name":"x","path":"secret","size":"3"}','not json']){const text='prompt\n\nAttached local files (user-provided data):\n'+tail;const entries=[custom('t',null,'suffice:user-presentation',{promptHash:hash('different'),displayPrompt:'wrong'}),msg('u','t','user',text)];const actual=rust({op:'present',entries});assert.deepEqual(actual,oracle(entries));assert.equal(actual.messages[0].displayText,undefined);}});
test('usage missing, aborted and compaction behavior',()=>{for(const entries of [[],[msg('u',null,'user','x')],[msg('a',null,'assistant','x',{usage,stopReason:'aborted'})],[msg('a',null,'assistant','x',{usage}),{type:'compaction',id:'c',parentId:'a',summary:'private',firstKeptEntryId:'missing',usage:{input:1,output:2}}]])assert.deepEqual(rust({op:'present',entries,contextWindow:100}),oracle(entries,undefined,100));});
test('fallback content serializes the final presented message',()=>{const entries=[msg('u',null,'user','hi'),msg('a','u','assistant',null,{provider:'p',model:'m'})];assert.deepEqual(rust({op:'present',entries}),oracle(entries));});
test('Pi context arithmetic handles null and nonnumeric totals',()=>{for(const u of [{input:null,output:3,cacheRead:2,cacheWrite:1,totalTokens:0},{input:1,output:2,cacheRead:3,cacheWrite:4,totalTokens:'50'},{input:1,output:2,cacheRead:3,cacheWrite:4,totalTokens:true}]){const entries=[msg('a',null,'assistant','x',{usage:u})];assert.deepEqual(rust({op:'present',entries,contextWindow:100}),oracle(entries,undefined,100));}});
test('off-branch compaction reason does not change selected checkpoint status',()=>{
 const entries=[msg('u',null,'user','old'),{type:'compaction',id:'c',parentId:'u',summary:'PRIVATE SUMMARY',firstKeptEntryId:'u'},custom('abandoned','c','suffice:compaction',{entryId:'c',reason:'automatic'}),msg('next','c','user','new')];
 const actual=rust({op:'present',entries});assert.deepEqual(actual,oracle(entries));assert.equal(actual.messages.find(message=>message.kind==='compacted').automatic,false);
});
test('undefined backfill and missing display prompt override old nullable fields',()=>{
 const entries=[custom('t',null,'suffice:turn-start',{id:'turn',provider:null,model:null,effort:''}),{type:'thinking_level_change',id:'think',parentId:'t'},msg('u','think','user','real',{displayText:'stale'}),msg('a','u','assistant','reply')];
 assert.deepEqual(rust({op:'present',entries}),oracle(entries));
});
test('cumulative usage preserves per-entry floating-point grouping',()=>{
 const entries=[msg('a',null,'assistant','first',{usage:{input:9007199254740992,output:0,cacheRead:0,cacheWrite:0}}),msg('b','a','assistant','next',{usage:{input:1,output:1,cacheRead:1,cacheWrite:1}})];
 assert.deepEqual(rust({op:'present',entries,contextWindow:100}),oracle(entries,undefined,100));
});
test('turn IDs keep JavaScript scalar identity and latest end metadata',()=>{
 const entries=[custom('t1',null,'suffice:turn-start',{id:7,startedAt:1}),msg('u1','t1','user','first'),msg('a1','u1','assistant','reply',{provider:'first'}),custom('e1','a1','suffice:turn-end',{id:7,endedAt:9}),custom('t2','e1','suffice:turn-start',{id:8,startedAt:10}),msg('u2','t2','user','second'),msg('a2','u2','assistant','reply',{provider:'second'}),custom('e2','a2','suffice:turn-end',{id:8,endedAt:20})];
 const actual=rust({op:'present',entries});assert.deepEqual(actual,oracle(entries));assert.equal(actual.messages[0].turn.endedAt,9);assert.equal(actual.messages[2].turn.endedAt,20);
});
test('null undefined and object turn identities do not alias accidentally',()=>{
 for(const ids of [[undefined,'undefined'],[null,'null'],[true,1],[{id:1},{id:1}],[[],[]]]){
  // JSON.parse gives object-valued IDs distinct reference identity, just as the
  // wire protocol does. Do not smuggle programmatic reference aliases into oracle.
  const entries=JSON.parse(JSON.stringify([custom('t1',null,'suffice:turn-start',{id:ids[0],startedAt:1}),msg('u1','t1','user','first'),custom('t2','u1','suffice:turn-start',{id:ids[1],startedAt:2}),msg('u2','t2','user','second')]));
  assert.deepEqual(rust({op:'present',entries}),oracle(entries));
 }
});
