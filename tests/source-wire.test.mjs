import test from 'node:test';import assert from 'node:assert/strict';
import {frameContent} from '../src/source-frames.mjs';
// Exercise the installed provider serializer without OAuth or a model request.
const {convertResponsesMessages}=await import(new URL('./api/openai-responses-shared.js',import.meta.resolve('@earendil-works/pi-ai')));
test('literal frames survive the actual installed Responses tool serializer',()=>{
 const value={path:'src/a.js',version:'abc',offset:1,totalLines:100,omittedBefore:0,omittedAfter:0,text:'1: const x = "quoted";\n2: run(x);\n'.repeat(30)};
 const original=[{type:'text',text:'Script completed\nOutput:\n'},{type:'text',text:'==> text 1/1 <==\n'+JSON.stringify(value)}],framed=frameContent(original);
 const model={provider:'openai',id:'gpt-6.1-sol',api:'openai-responses',input:['text']};
 const convert=content=>convertResponsesMessages(model,{messages:[{role:'toolResult',toolCallId:'call_test',toolName:'codemode',content,isError:false,timestamp:1}],tools:[]},new Set(['openai']));
 const a=convert(original).find(m=>m.type==='function_call_output').output,b=convert(framed.content).find(m=>m.type==='function_call_output').output;
 assert.equal(a,original.map(c=>c.text).join('\n'));assert.equal(b,framed.content.map(c=>c.text).join('\n'));assert.ok(b.includes(value.text));assert.ok(!a.includes(value.text));assert.ok(b.length<a.length);
});
