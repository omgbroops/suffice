import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {buildSessionProjection} from '@earendil-works/pi-coding-agent';
import {transcriptMessages} from '../../../apps/desktop/electron/transcript-messages.mjs';
import {savedUsage} from '../../../apps/desktop/electron/usage.mjs';
const bin=resolve('crates/suffice-session/target/debug/suffice-session'+(process.platform==='win32'?'.exe':''));
const normalize=message=>({role:message.role,timestamp:message.timestamp,provider:message.provider,model:message.model,turn:message.turn,displayText:message.displayText,attachments:message.attachments,kind:message.kind,automatic:message.automatic,toolName:message.toolName,toolCallId:message.toolCallId,isError:message.isError,content:typeof message.content==='string'?[{type:'text',text:message.content}]:(Array.isArray(message.content)?message.content:[{type:'text',text:message.output||JSON.stringify(message,null,2)}]).map(part=>part.type==='text'?{type:'text',text:part.text}:part.type==='thinking'?{type:'thinking',text:part.thinking}:part.type==='toolCall'?{type:'toolCall',id:part.id,name:part.name,text:JSON.stringify(part.arguments,null,2)}:part.type==='image'?{type:'image',data:part.data,mimeType:part.mimeType}:{type:part.type,text:`[${part.type}]`})});
function oracle(op,entries,leaf){if(op==='project'){const p=buildSessionProjection(entries,leaf);return {...p,entries:p.entries.map(e=>({sourceIndex:entries.indexOf(e.sourceEntry),messages:e.messages}))};} const p=buildSessionProjection(entries.filter(e=>e.type!=='session'),leaf);return {messages:transcriptMessages(p,entries).map(normalize),usage:savedUsage(entries,{})};}
const cases=[
 [{type:'message',id:'x',parentId:null,message:true}],
 ...[false,0,'hello','😀','A😀é',[],['one','😀'],{}].map(message=>[{type:'message',id:'x',parentId:null,message}]),
 ...[null,undefined].map(message=>[{type:'message',id:'bad',parentId:null,message},{type:'message',id:'good',parentId:null,message:{role:'user',content:'ok'}}]),
 ...[false,0,''].map(last=>[{type:'message',id:'x',parentId:null,message:{role:'user',content:'invisible'}},last]),
 ...[null,0,false,'x',{},[],{type:4},{type:null},{type:{}},{type:[1,2]},{type:{toString:1}},{type:'thinking'}, {type:'toolCall',arguments:{x:1}}].map(block=>[{type:'message',id:'x',parentId:null,message:{role:'unknown',content:[block]}}]),
 ...[null,{},true,'x',[null]].map(content=>[{type:'message',id:'x',parentId:null,message:{role:'user',content}}]),
 [{type:'custom',id:'turn',parentId:null,customType:'suffice:turn-start',data:{id:'turn',startedAt:1,effort:'high'}},{type:'message',id:'primitive',parentId:'turn',message:'😀'},{type:'message',id:'answer',parentId:'primitive',message:{role:'assistant',provider:'p',model:'m',content:[]}},{type:'custom',id:'end',parentId:'answer',customType:'suffice:turn-end',data:{id:'turn',endedAt:2}}],
 [{type:'message',id:{a:1},parentId:null,message:{role:'user',content:'not linked'}},{type:'message',id:'b',parentId:{a:1},message:{role:'assistant',content:'linked?'}}],
 ...[1,true,{},[1,2],{toString:1}].map(text=>[{type:'message',id:'x',parentId:null,message:{role:'user',content:[{type:'text',text}]}}]),
 ...['custom_message','branch_summary','compaction'].map(type=>[{type,id:'x',parentId:null,summary:'x',timestamp:{toString:1}}]),
 [{type:'message',id:'x',parentId:null,message:{role:'assistant',content:'before'}},{type:'context_edit',id:'e',parentId:'x',targetId:'x'}],
];
for (const [i,entries] of cases.entries()) for(const op of ['project','present']) test(`${op} malformed corpus ${i}`,()=>{
 const request=JSON.parse(JSON.stringify({op,entries}));let expected,error;try{expected=JSON.parse(JSON.stringify(oracle(op,request.entries)));}catch(e){error=e;}
 const p=spawnSync(bin,{input:JSON.stringify(request),encoding:'utf8',timeout:5000});assert.equal(p.status,0,p.stderr);const actual=JSON.parse(p.stdout);if(error)assert.equal(actual.ok,false,`oracle error ${error} but Rust ${p.stdout}`);else {assert.equal(actual.ok,true,actual.error);assert.deepEqual(actual.result,expected);}
});
