import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {ImplicitSemanticContext} from '../packages/cli/src/implicit/context.mjs';
import {countTokens,fitsPacket} from '../packages/cli/src/implicit/tokens.mjs';
import {implicitToolAdapter} from '../packages/cli/src/implicit-tools.mjs';
import {classifyChange} from '../packages/cli/src/implicit/change.mjs';
import {SemanticGraph} from '../packages/cli/src/semantic/graph.mjs';
import {workspaceTools} from '../src/workspace.mjs';
import {parseOptions} from '../packages/cli/src/options.mjs';
import {createSufficeSession} from '../packages/cli/src/session.mjs';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';

async function fixture(t,files={}){
  const root=await mkdtemp(resolve(tmpdir(),'suffice-implicit-')),put=async(path,text)=>{await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),text);};
  const sources={'src/a.ts':'export function f(x: number): number { return x + 1; }\n','src/b.ts':'import {f as alias} from "./a.js";\nexport function consumer() { return alias(2); }\n','tests/f.test.ts':'import {f} from "../src/a.js"; export const actual = f(3);\n',...files};
  for(const [p,text]of Object.entries(sources))await put(p,text);
  const disposers=[];t.after(async()=>{disposers.forEach(d=>d());assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});});
  const make=opts=>{const logs=[],engine=new ImplicitSemanticContext({workspace:root,context:true,log:e=>logs.push(e),...opts});disposers.push(()=>engine.dispose());return {engine,logs};};
  return {root,put,sources,make};
}

test('passive semantic reads retrieve resolved cross-file source evidence with strict measured budgets',async t=>{
  const {sources,make}=await fixture(t),{engine,logs}=make();
  const packet=await engine.read({path:'src/a.ts',source:sources['src/a.ts']});assert.ok(packet?.text,JSON.stringify(logs));
  assert.match(packet.text,/consumer/);assert.match(packet.text,/src\/b.ts:2/);assert.match(packet.text,/static/);assert.ok(fitsPacket(packet.text,400));assert.equal(packet.tokens,countTokens(packet.text));assert.ok(packet.visibleTokens<=400&&packet.byteTokenUpperBound<=400);assert.ok(packet.revision.length===64);
  assert.ok(packet.deliveredFacts.every(f=>f.from&&f.to&&f.location.path&&f.excerptLocation.line));
  assert.ok(logs[0].expanded.length<=6);assert.equal(await engine.read({path:'src/a.ts',source:sources['src/a.ts']}),null);assert.ok(['already_known_or_read','initial_region_already_served'].includes(logs.at(-1).reason));
});

test('ordinary irrelevant reads and local/comment-only edits abstain without repository expansion',async t=>{
  const {make}=await fixture(t),{engine,logs}=make({impact:true,verification:true});
  assert.equal(await engine.read({path:'README.md',source:'text'}),null);assert.equal(engine.graph,null);
  assert.equal(await engine.edit({path:'src/a.ts',before:'export function f(){ return 1; }',after:'// comment\nexport function f(){ return 1; }'}),null);
  assert.equal(await engine.edit({path:'src/a.ts',before:'export function f(){ const value=1; return value; }',after:'export function f(){ const local=1; return local; }'}),null);assert.equal(engine.graph,null);assert.equal(logs.at(-1).reason,'local_binding');
  assert.equal(classifyChange('export function f(){ const x=1; return {x}; }','export function f(){ const y=1; return {y}; }','a.ts').external,true);
});

test('fresh revisions invalidate relationships and repeated implementation edits do not reprint identical graphs',async t=>{
  const {sources,put,make}=await fixture(t),{engine,logs}=make({impact:true,verification:true});await engine.read({path:'src/a.ts',source:sources['src/a.ts']});
  let before=sources['src/a.ts'],after=before.replace('x + 1','x + 2');await put('src/a.ts',after);const first=await engine.edit({path:'src/a.ts',before,after});assert.ok(first?.plan?.fullSuite);assert.equal(first.plan.typecheck,true);assert.ok(first.plan.tests.includes('tests/f.test.ts'));
  before=after;after=after.replace('x + 2','x + 3');await put('src/a.ts',after);assert.equal(await engine.edit({path:'src/a.ts',before,after}),null);assert.ok(logs.at(-1).updates.some(u=>u.kind==='incremental'));
  await put('src/c.ts','import {f} from "./a.js";\nexport function newly() { return f(7); }\n');const packet=await engine.read({path:'src/a.ts',source:after});assert.ok(packet);assert.match(packet.text,/newly/);assert.notEqual(packet.revision,first.revision);
});

test('already-read neighboring evidence is suppressed and AST candidates use exact import/export bindings',async t=>{
  const {sources,make}=await fixture(t),a=make({mode:'ast'});a.engine.noteRead({path:'src/a.ts',source:sources['src/a.ts']});assert.equal(await a.engine.read({path:'src/b.ts',source:sources['src/b.ts']}),null);
  const b=make({mode:'ast'}),packet=await b.engine.read({path:'src/b.ts',source:sources['src/b.ts']});assert.ok(packet);assert.match(packet.text,/syntax candidates/);assert.match(packet.text,/ast:function:f/);assert.equal(b.engine.graph,null);
});

test('packet/total budgets, omission counts and cache bounds fail closed',async t=>{
  const {make,sources}=await fixture(t),tiny=make({maxPacketTokens:20});assert.equal(await tiny.engine.read({path:'src/a.ts',source:sources['src/a.ts']}),null);assert.equal(tiny.logs.at(-1).reason,'packet_budget');
  const total=make({maxTotalTokens:1});assert.equal(await total.engine.read({path:'src/a.ts',source:sources['src/a.ts']}),null);assert.equal(total.logs.at(-1).reason,'total_context_budget');
  const normal=make(),p=await normal.engine.read({path:'src/a.ts',source:sources['src/a.ts']});assert.match(p.text,/omitted:\d+/);assert.ok(normal.engine.totalTokens<=1200);
});

test('neighborhood expansion stays bounded and never invokes whole-graph traversal',async t=>{
  const {root,sources,put}=await fixture(t);for(let i=0;i<20;i++)await put(`src/use${i}.ts`,`import {f} from "./a.js";export const result${i}=f(${i});`);
  let visited=0;class Bounded extends SemanticGraph{allAnalysis(){throw new Error('whole graph forbidden');}analyze(path){visited++;return super.analyze(path);}}
  const logs=[],engine=new ImplicitSemanticContext({workspace:root,context:true,maxFiles:4,graphFactory:Bounded,log:e=>logs.push(e)});t.after(()=>engine.dispose());await engine.read({path:'src/a.ts',source:sources['src/a.ts']});assert.ok(visited<=4);assert.equal(logs[0].expanded.length,4);assert.ok(logs[0].unexpanded>0);
});

test('dynamic/parse/index failures and stale input preserve ordinary source behavior',async t=>{
  const {root,put,sources,make}=await fixture(t),{engine,logs}=make();await put('src/b.ts',sources['src/b.ts']+'export function dynamic(x:any,k:string){return x[k]();}\n');const p=await engine.read({path:'src/a.ts',source:sources['src/a.ts']});assert.ok(p);assert.ok(logs.at(-1).unresolved>0);assert.match(p.text,/u:[1-9]/);
  await put('src/a.ts','export function {');assert.equal(await engine.read({path:'src/a.ts',source:'export function {'}),null);assert.equal(logs.at(-1).reason,'parse_failure');
  await put('src/a.ts',sources['src/a.ts']);assert.equal(await engine.read({path:'src/a.ts',source:'stale source'}),null);assert.equal(logs.at(-1).staleDetected,true);
  const tools=workspaceTools({workspace:root,artifactsDir:resolve(root,'.artifacts')}),original=tools.find(t=>t.name==='file_read'),adapted=implicitToolAdapter({workspace:root,tools,context:true,engineFactory:class{constructor(){throw new Error('index failed');}}});
  const actual=await adapted.tools.find(t=>t.name==='file_read').execute('read',{path:'src/a.ts'});assert.deepEqual(actual,await original.execute('old',{path:'src/a.ts'}));
});

test('disabled adapters are identical and enabled adapters never alter the requested source',async t=>{
  const {root}=await fixture(t),tools=workspaceTools({workspace:root,artifactsDir:resolve(root,'.artifacts')});assert.equal(implicitToolAdapter({workspace:root,tools}).tools,tools);
  const adapted=implicitToolAdapter({workspace:root,tools,context:true});t.after(()=>adapted.dispose());const before=await tools.find(t=>t.name==='file_read').execute('a',{path:'src/a.ts'}),after=await adapted.tools.find(t=>t.name==='file_read').execute('b',{path:'src/a.ts'});
  assert.equal(before.structuredContent.text,after.structuredContent.text);assert.deepEqual(before.content[0],after.content[0]);assert.ok(after.structuredContent.context);
  assert.equal(parseOptions([]).autoContext,undefined);assert.equal(parseOptions(['--auto-impact']).autoImpact,true);assert.throws(()=>parseOptions(['--packet-tokens','401']),/budget/);
});

test('real Pi codemode receives automatic packets even when its script prints only ordinary source text',async t=>{
  const {root}=await fixture(t),home=resolve(root,'.home'),runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false}),session=await createSufficeSession({...parseOptions(['--auto-context']),cwd:root,home},runtime);
  try{
    const tool=session.session.agent.state.tools.find(t=>t.name==='codemode'),args={code:'text(await tools.read({path:"src/a.ts"}));'},id='implicit-integration';
    session.session.agent.state.messages.push({role:'assistant',content:[{type:'toolCall',id,name:'codemode',arguments:args}],model:'gpt-6.1-sol',provider:'openai',api:'openai-responses',stopReason:'toolUse',timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{total:0}}});
    // Direct execute bypasses the outer event hook; exercise the same bridge on
    // the completed outer result, as Pi's tool pipeline does in a live session.
    const result=await tool.execute(id,args,undefined,()=>{});const patch=await session.session.extensionRunner.emitToolResult({toolName:'codemode',toolCallId:id,input:args,content:result.content,details:result.details,isError:false});
    const text=(patch?.content??result.content).filter(c=>c.type==='text').map(c=>c.text).join('\n');assert.match(text,/return x \+ 1/);assert.match(text,/ctx@/);assert.match(text,/consumer/);assert.equal(session.totals.modelCalls,0);
  }finally{await session.dispose();}
});

test('multi-symbol contract edits select the affected span and verification works independently',async t=>{
  const {put,make}=await fixture(t);
  const before='export function first(x:number){return x;}\nexport function second(x:number){return x;}\nexport function third(x:number){return x;}\nexport function fourth(x:number){return x;}\n';
  await put('src/a.ts',before);await put('src/b.ts','import {third,fourth} from "./a.js";\nexport function use(){return third(1)+fourth(2);}\n');
  const {engine,logs}=make({context:false,impact:false,verification:true}),after=before.replace('third(x:number)','third(x:string)').replace('fourth(x:number)','fourth(x:string)');await put('src/a.ts',after);
  const packet=await engine.edit({path:'src/a.ts',before,after});assert.ok(packet?.plan?.fullSuite);assert.ok(logs.at(-1).symbols.every(id=>/third|fourth/.test(id)));assert.equal(packet._state,undefined);
});

test('concurrent investigations deduplicate and analysis errors cannot corrupt successful edits',async t=>{
  const {root,sources}=await fixture(t),logs=[],engine=new ImplicitSemanticContext({workspace:root,context:true,log:e=>logs.push(e)});t.after(()=>engine.dispose());
  const packets=await Promise.all([engine.read({path:'src/a.ts',source:sources['src/a.ts']}),engine.read({path:'src/a.ts',source:sources['src/a.ts']})]);assert.equal(packets.filter(Boolean).length,1);
  const tools=workspaceTools({workspace:root,artifactsDir:resolve(root,'.artifacts')}),adapter=implicitToolAdapter({workspace:root,tools,impact:true,engineFactory:class{constructor(){throw new Error('unavailable');}}});
  const edited=await adapter.tools.find(t=>t.name==='file_edit').execute('edit',{path:'src/a.ts',oldText:'x + 1',newText:'x + 9'});assert.equal(edited.structuredContent.edited,true);assert.match(await readFile(resolve(root,'src/a.ts'),'utf8'),/x \+ 9/);
});

test('codemode read then multi-symbol edit emits only final-revision evidence',async t=>{
  const {root,sources}=await fixture(t),logs=[],tools=workspaceTools({workspace:root,artifactsDir:resolve(root,'.artifacts')}),adapter=implicitToolAdapter({workspace:root,tools,context:true,impact:true,verification:true,deferToCodemode:true,log:e=>logs.push(e)});t.after(()=>adapter.dispose());
  const read=adapter.tools.find(t=>t.name==='file_read'),edit=adapter.tools.find(t=>t.name==='file_edit');
  const result=await read.execute('read',{path:'src/a.ts'});await adapter.onToolResult({toolName:'file_read',toolCallId:'read',parentToolCallId:'parent',content:result.content,isError:false});
  const changed=await edit.execute('edit',{path:'src/a.ts',oldText:'x + 1',newText:'x + 7'});await adapter.onToolResult({toolName:'file_edit',toolCallId:'edit',parentToolCallId:'parent',content:changed.content,isError:false});
  const original=[{type:'text',text:result.structuredContent.text}],patch=await adapter.onToolResult({toolName:'codemode',toolCallId:'parent',content:original,isError:false});assert.ok(patch);assert.deepEqual(patch.content[0],original[0]);assert.equal(logs.filter(e=>e.type==='implicit_context').length,1);assert.equal(logs.find(e=>e.type==='implicit_context').event,'edit');assert.equal(logs.find(e=>e.type==='implicit_delivery').event,'edit');assert.ok(fitsPacket(patch.content[1].text,400));assert.match(await readFile(resolve(root,'src/a.ts'),'utf8'),/x \+ 7/);
});
