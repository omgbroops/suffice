import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {ModelRuntime,createAgentSession} from '@earendil-works/pi-coding-agent';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';
import {createPiAdapter} from '../src/v10/pi.mjs';
import {createWorkerTools} from '../src/v10/tools.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {runPublicCheck} from '../src/v9/checks.mjs';
const usage={input:20,cacheRead:10,cacheWrite:2,output:5,totalTokens:37,cost:{input:.001,cacheRead:.0001,cacheWrite:.0001,output:.001,total:.0022}};
const modelFor=id=>({id,provider:'openai',maxTokens:6000,cost:{input:.1,output:.5,cacheRead:.01,cacheWrite:0}});
const message=(model,content=[{type:'text',text:'done'}],extra={})=>({role:'assistant',api:'openai-responses',provider:'openai',model,timestamp:Date.now(),content,stopReason:'stop',usage,...extra});
async function fixture(t){const root=await realpath(await mkdtemp(join(tmpdir(),'suffice-v10-pi-')));t.after(()=>rm(root,{recursive:true,force:true}));const workspace=join(root,'repo');await mkdir(workspace);execFileSync('git',['init','--quiet'],{cwd:workspace});await writeFile(join(workspace,'impl.mjs'),'export function add(a,b){return a-b;}\n');await writeFile(join(workspace,'public.test.mjs'),"import {test} from 'node:test';test('placeholder',()=>{});\n");return {workspace,runDir:join(root,'receipts'),role:'implement',model:'gpt-6-luna',effort:'high',prompt:'Add numbers.',maxCostUsd:.5,timeoutMs:10000,checks:[{id:'public',command:[process.execPath,'--test','public.test.mjs'],testsRequired:true}]};}
test('independent reviewer is a direct completion with no tools and exact requested model',async t=>{
  const call=await fixture(t);let received;
  const runtime={isUsingSubscription:()=>true,getModel:(_,id)=>modelFor(id),completeSimple:async(...args)=>{received=args;return message(call.model,[{type:'text',text:'{}'}]);}};
  const out=await createPiAdapter({runtime,createSession:()=>{throw Error('Reviewer must not create a session');}})({...call,noTools:true,outputSchema:{type:'object'}});
  assert.equal(out.status,'completed');assert.deepEqual(received[1].tools,[]);assert.equal(received[0].id,call.model);assert.equal(received[2].maxRetries,0);assert.equal(out.costUsd,.0022);assert.equal(out.usage.inputTokens,32);assert.equal(out.usage.cachedInputTokens,10);
});
test('missing Pi subscription fails before any model call with known zero cost',async t=>{
  const call=await fixture(t);let calls=0;const out=await createPiAdapter({runtime:{getModel:()=>({id:call.model}),isUsingSubscription:()=>false,completeSimple:()=>{calls++;}}})({...call,noTools:true});
  assert.equal(calls,0);assert.equal(out.status,'unavailable');assert.equal(out.costKnown,true);assert.equal(out.costUsd,0);
});
test('missing usage and wrong model identities cannot be priced as a successful stage',async t=>{
  const call=await fixture(t),runtime={isUsingSubscription:()=>true,getModel:(_,id)=>modelFor(id),completeSimple:async()=>message('wrong-model',undefined,{usage:undefined})};
  const out=await createPiAdapter({runtime})({...call,noTools:true});assert.equal(out.costKnown,false);assert.equal(out.costUsd,null);
});
test('v10 tools retain AST navigation, edits beyond src and full observation recovery',async t=>{
  const call=await fixture(t),logs=[],signal=new AbortController().signal,observed=await createWorkerTools({...call,signal,compactResponses:true,log:e=>logs.push(e)});
  const byName=new Map(observed.tools.map(tool=>[tool.name,tool]));for(const name of ['symbols','symbol_read','symbol_references','observation_read','file_edit','exec','test'])assert.ok(byName.has(name));
  const symbols=await byName.get('symbols').execute('one',{path:'impl.mjs'});assert.equal(symbols.structuredContent.matches[0].name,'add');
  await byName.get('file_edit').execute('two',{path:'impl.mjs',oldText:'a-b',newText:'a+b'});assert.match(await readFile(join(call.workspace,'impl.mjs'),'utf8'),/a\+b/);
  const source=await byName.get('symbol_read').execute('three',{path:'impl.mjs',name:'add'});assert.match(source.structuredContent.text,/a\+b/);
  await assert.rejects(byName.get('file_write').execute('bad',{path:'public.test.mjs',content:'removed'}),/protected/);
  const recovery=await byName.get('observation_read').execute('recover',{reference:'o1'});assert.match(recovery.structuredContent.text,/add/);assert.ok(logs.some(e=>e.type==='navigation'));
});
test('actual Pi session exposes codemode and executes registered AST tools without network',async t=>{
  const call=await fixture(t);const runtime=await ModelRuntime.create({authPath:join(call.workspace,'unused-auth.json'),modelsPath:null,refreshOnCreate:false});
  runtime.hasConfiguredAuth=()=>true;runtime.checkAuth=async()=>true;runtime.isUsingSubscription=()=>true;
  const requests=[];runtime.streamSimple=async(model,context)=>{
    requests.push(context);const first=requests.length===1;
    const m=message(model.id,first?[{type:'toolCall',id:'navigation',name:'codemode',arguments:{code:"const out = await tools.symbols({path:'impl.mjs'}); console.log(out);"}}]:[{type:'text',text:'done'}],{stopReason:first?'toolUse':'stop'});
    const stream=createAssistantMessageEventStream();stream.push({type:'done',reason:m.stopReason,message:m});stream.end(m);return stream;
  };
  let registered;
  const adapter=createPiAdapter({runtime,createSession:async options=>{const result=await createAgentSession(options);registered=result.session.getAllTools().map(t=>t.name);return result;}});
  const out=await adapter(call);assert.equal(out.status,'completed',out.error);assert.ok(registered.includes('symbols'));assert.ok(registered.includes('symbol_read'));assert.ok(registered.includes('codemode'));assert.equal(requests.length,2);
  const events=await readFile(join(call.runDir,'events.jsonl'),'utf8');assert.match(events,/"type":"navigation"/);assert.equal(out.costUsd,.0044);
});
test('a response crossing the stage allowance prevents the next Pi request',async t=>{
  const call=await fixture(t);const runtime=await ModelRuntime.create({authPath:join(call.workspace,'unused-auth.json'),modelsPath:null,refreshOnCreate:false});runtime.hasConfiguredAuth=()=>true;runtime.checkAuth=async()=>true;runtime.isUsingSubscription=()=>true;
  let count=0;runtime.streamSimple=async model=>{count++;const m=message(model.id,[{type:'toolCall',id:'extra',name:'codemode',arguments:{code:'console.log(1);'}}],{stopReason:'toolUse',usage:{...usage,cost:{total:.02}}}),stream=createAssistantMessageEventStream();stream.push({type:'done',reason:'toolUse',message:m});stream.end(m);return stream;};
  const out=await createPiAdapter({runtime})({...call,maxCostUsd:.01});assert.equal(count,1);assert.equal(out.status,'budget_stopped');assert.equal(out.knownCostFloorUsd,.02);
});
test('request reservation refuses an unaffordable completion before inference',async t=>{
  const call=await fixture(t);let calls=0;const runtime={getModel:(_,id)=>modelFor(id),isUsingSubscription:()=>true,completeSimple:async()=>{calls++;}};
  const out=await createPiAdapter({runtime})({...call,noTools:true,maxCostUsd:.0001});assert.equal(calls,0);assert.equal(out.status,'budget_stopped');assert.equal(out.costKnown,true);assert.equal(out.costUsd,0);
});
test('process cancellation stops an active development command',async()=>{
  const controller=new AbortController();setTimeout(()=>controller.abort(),100);const out=await runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal,timeoutMs:5000});assert.equal(out.aborted,true);assert.ok(out.latencyMs<4000);
});
test('a suite containing only skipped tests remains unverified',async t=>{
  const call=await fixture(t);await writeFile(join(call.workspace,'skip.test.mjs'),"import {test} from 'node:test';test.skip('not executed',()=>{});\n");
  const out=await runPublicCheck({workspace:call.workspace,check:{id:'skip',command:[process.execPath,'--test','skip.test.mjs'],testsRequired:true},timeoutMs:10000});assert.equal(out.exitCode,0);assert.equal(out.tests,1);assert.equal(out.status,'unverified');
});
