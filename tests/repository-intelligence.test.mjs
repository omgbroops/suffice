import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,rename,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
import {repositoryTools} from '../packages/cli/src/tools.mjs';
import {intelligenceExtension} from '../packages/cli/src/intelligence/tools.mjs';
import {parseOptions} from '../packages/cli/src/options.mjs';
import {createSufficeSession} from '../packages/cli/src/session.mjs';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {execFileSync} from 'node:child_process';

async function fixture(t,files={}){
  const root=await mkdtemp(resolve(tmpdir(),'suffice-intelligence-')),workspace=resolve(root,'repo'),cacheDir=resolve(root,'cache');
  await mkdir(workspace);t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(path,text)=>{await mkdir(dirname(resolve(workspace,path)),{recursive:true});await writeFile(resolve(workspace,path),text);};
  for(const [p,s]of Object.entries(files))await put(p,s);
  return {root,workspace,cacheDir,put,engine:createIntelligence({workspace,cacheDir})};
}

test('cross-file aliases, default imports, reexports and call provenance',async t=>{
  const {engine}=await fixture(t,{
    'a.mjs':'export function work(x){ return x+1 } export default work;',
    'barrel.mjs':"export {work as renamed} from './a.mjs';",
    'b.mjs':"import {renamed as go} from './barrel.mjs'; import fallback from './a.mjs'; export function run(){return go(fallback(2))}",
    'unrelated.mjs':'export function work(){return 99}'
  });
  const g=await engine.snapshot(),a=g.symbols.find(s=>s.path==='a.mjs'&&s.name==='work');
  const calls=g.edges.filter(e=>e.kind==='call'&&e.to===a.id);
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.from.includes('function:run')));
  assert.ok(calls.some(c=>c.via.some(v=>v.path==='barrel.mjs')));
  assert.ok(calls.every(c=>c.evidence.fileVersion===g.files.find(f=>f.path==='b.mjs').version));
  assert.equal(g.edges.filter(e=>e.kind==='module').length,3);
  assert.ok(g.edges.every(e=>e.evidence?.path&&e.evidence.fileVersion));
});

test('lexical shadowing, block/var scope, destructuring and non-reference property keys',async t=>{
  const {engine}=await fixture(t,{'a.mjs':`export function target(){};
function one(target){ target(); }
function two(){ {let target=()=>1;target()} target(); const {value: local}={value:1}; return local; }
function three(){ if(true){ var scoped=()=>1 } scoped(); }
const obj={target: 1}; obj.target();`});
  const g=await engine.snapshot(),target=g.symbols.find(s=>s.name==='target'&&s.kind==='function'&&s.start===1);
  assert.equal(g.edges.filter(e=>e.kind==='call'&&e.to===target.id).length,1);
  const scoped=g.symbols.find(s=>s.name==='scoped');assert.equal(g.edges.filter(e=>e.kind==='call'&&e.to===scoped.id).length,1);
  assert.ok(g.unresolved.some(u=>u.reason==='dynamic-dispatch'));
  assert.ok(!g.unresolved.some(u=>u.name==='value'));
});

test('stable identities survive line shifts; edits detect changed symbols and invalidate importers',async t=>{
  const {engine,put}=await fixture(t,{'a.mjs':'export function answer(){return 1}', 'b.mjs':"import {answer} from './a.mjs'; export function run(){return answer()}", 'tests/a.test.mjs':"import {run} from '../b.mjs';run();"});
  const g=await engine.snapshot(),id=g.symbols.find(s=>s.name==='answer'&&s.path==='a.mjs').id;
  await put('a.mjs','\n\nexport function answer(){return 2}');
  const result=await engine.get_impact_analysis();
  assert.deepEqual(result.changedFiles,['a.mjs']);assert.equal(result.changedSymbols[0].id,id);assert.equal(result.changedSymbols[0].change,'modified');
  assert.deepEqual(result.impacted.map(i=>i.path),['a.mjs','b.mjs','tests/a.test.mjs']);
  assert.equal(result.impacted[2].evidence.length,2);assert.equal(result.impacted[2].status,'inferred');
  const tests=await engine.get_relevant_tests();assert.deepEqual(tests.tests.map(i=>i.path),['tests/a.test.mjs']);
  assert.equal(tests.commands[0].runner,'unknown');
});

test('removed files and imports retain previous impact evidence and never retain current resolved edges',async t=>{
  const {engine,workspace,put}=await fixture(t,{'a.mjs':'export const a=1;', 'b.mjs':"import {a} from './a.mjs';a;"});
  await engine.begin();await rm(resolve(workspace,'a.mjs'));
  let g=await engine.snapshot();assert.ok(!g.symbols.some(s=>s.path==='a.mjs'));assert.ok(g.unresolved.some(u=>u.reason==='missing-or-implicit-module-path'));
  let impact=await engine.get_impact_analysis();assert.ok(impact.changedSymbols.some(s=>s.change==='deleted'));assert.deepEqual(impact.impacted.map(x=>x.path),['a.mjs','b.mjs']);
  await put('b.mjs','export const b=2;');impact=await engine.get_impact_analysis();assert.ok(impact.changedFiles.includes('b.mjs'));
  g=await engine.snapshot();assert.ok(!g.edges.some(e=>e.kind==='module'));
});

test('persistent warm cache revalidates hashes, additions, deletes and same timestamp edits',async t=>{
  const f=await fixture(t,{'a.mjs':'export const a=1;'});const first=await f.engine.snapshot();
  let fresh=createIntelligence(f);let warm=await fresh.snapshot();assert.equal(warm.metrics.parsedFiles,0);
  await f.put('a.mjs','export const a=2;');await utimes(resolve(f.workspace,'a.mjs'),new Date(0),new Date(0));
  fresh=createIntelligence(f);warm=await fresh.snapshot();assert.equal(warm.metrics.parsedFiles,1);assert.notEqual(warm.revision.contentVersion,first.revision.contentVersion);
  await f.put('b.mjs','export const b=1;');assert.equal((await fresh.snapshot()).files.length,2);
  await rename(resolve(f.workspace,'a.mjs'),resolve(f.workspace,'c.mjs'));warm=await fresh.snapshot();assert.ok(!warm.files.some(f=>f.path==='a.mjs'));
});

test('dynamic dispatch, eval, wildcard exports, missing modules and unsupported syntax abstain',async t=>{
  const {engine}=await fixture(t,{
    'a.mjs':`export function action(){}; const object={action}; object.action(); import('./missing.mjs'); require('./other.cjs');`,
    'b.mjs':"import {missing} from './missing.mjs';missing(); export * from './a.mjs';",
    'eval.mjs':"const x=()=>1; eval('x=other'); x();",
    'bad.jsx':'export const x=<div/>;',
    'bad.js':'function {'
  });
  const g=await engine.snapshot();for(const reason of ['dynamic-dispatch','dynamic-import','commonjs','wildcard-export','dynamic-scope','missing-or-implicit-module-path'])assert.ok(g.unresolved.some(u=>u.reason===reason),reason);
  assert.ok(!g.edges.some(e=>e.kind==='call'&&e.evidence.path==='eval.mjs'));
  assert.equal(g.files.filter(f=>f.error).length,2);
  const c=await engine.get_symbol_context({name:'x'});assert.equal(c.coverage.unparsed.length,2);
});

test('export cycles terminate and implicit paths are never invented',async t=>{
  const {engine}=await fixture(t,{'a.mjs':"export {x} from './b.mjs'",'b.mjs':"export {x} from './a.mjs'",'c.mjs':"import {x} from './a'; x();"});
  const g=await engine.snapshot();assert.ok(g.unresolved.some(u=>u.reason==='export-cycle'));assert.ok(!g.edges.some(e=>e.kind==='module'&&e.evidence.path==='c.mjs'));
});

test('parameter initializers abstain and class static var scopes cannot leak',async t=>{
  const {engine}=await fixture(t,{'a.mjs':`const target=()=>1;
function f(x=target()){ var target=()=>2; return target() }
class A { static { var hidden=()=>3; hidden() } }
hidden();`});
  const g=await engine.snapshot();
  assert.ok(g.unresolved.some(u=>u.name==='target'&&u.reason==='parameter-initializer'));
  assert.ok(g.unresolved.some(u=>u.name==='hidden'&&u.evidence.line===4&&u.reason==='unbound'));
  assert.equal(g.edges.filter(e=>e.kind==='call'&&e.name==='hidden').length,1);
});

test('named class method IDs survive insertion of an unrelated class',async t=>{
  const {engine,put}=await fixture(t,{'a.mjs':'export class A { run(){return 1} }'});
  const before=await engine.snapshot(),id=before.symbols.find(s=>s.kind==='method').id;
  await put('a.mjs','class Earlier {}\nexport class A { run(){return 2} }');
  const after=await engine.get_impact_analysis();assert.ok(after.changedSymbols.some(s=>s.id===id&&s.change==='modified'));
});

test('parallel queries serialize refresh; corrupted cache rebuilds',async t=>{
  const f=await fixture(t,{'a.ts':'export function a(x: number): number {return x+1}'});
  const [a,b]=await Promise.all([f.engine.snapshot(),f.engine.get_symbol_context({name:'a'})]);assert.equal(a.revision.contentVersion,b.revision.contentVersion);
  const {readdir}=await import('node:fs/promises');const cache=(await readdir(f.cacheDir))[0];await writeFile(resolve(f.cacheDir,cache),'corrupt');
  assert.equal((await createIntelligence(f).snapshot()).metrics.parsedFiles,1);
});

test('repository HEAD changes are tracked independently of unchanged dirty source contents',async t=>{
  const f=await fixture(t,{'a.mjs':'export const a=1;'});
  const git=args=>execFileSync('git',['-C',f.workspace,...args],{windowsHide:true,encoding:'utf8'});
  git(['init','-q']);
  const commit=message=>git(['-c','user.name=Suffice test','-c','user.email=test@localhost','-c','commit.gpgsign=false','commit','--allow-empty','-qm',message]);
  commit('first');const before=await f.engine.snapshot();assert.ok(before.revision.head);
  commit('second');const after=await f.engine.snapshot();assert.notEqual(after.revision.head,before.revision.head);assert.equal(after.revision.contentVersion,before.revision.contentVersion);assert.equal(after.metrics.parsedFiles,0);
});

test('graph tools are opt-in; default CLI session retains existing prompt and tool set',async t=>{
  const f=await fixture(t,{'a.mjs':'export const a=1;'});
  assert.equal(parseOptions([]).intelligence,'off');assert.equal(parseOptions(['--intelligence','guided']).intelligence,'guided');assert.throws(()=>parseOptions(['--intelligence','magic']),/Invalid/);
  const baseline=repositoryTools(f).map(t=>t.name),tools=repositoryTools({...f,intelligence:f.engine});
  assert.deepEqual(tools.slice(0,baseline.length).map(t=>t.name),baseline);assert.equal(tools.length,baseline.length+3);
  const result=await tools.find(t=>t.name==='get_symbol_context').execute('a',{name:'a'});assert.equal(result.structuredContent.symbols.length,1);
  await assert.rejects(tools.find(t=>t.name==='get_impact_analysis').execute('b',{paths:['../escape.js']}),/outside/);
  const runtime=await ModelRuntime.create({authPath:resolve(f.root,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
  const options={...parseOptions([]),cwd:f.workspace,home:f.root};
  const off=await createSufficeSession(options,runtime),on=await createSufficeSession({...options,intelligence:'guided'},runtime);
  try{assert.equal(off.session.systemPrompt,on.session.systemPrompt);assert.equal(on.totals.modelCalls,0);assert.equal(off.intelligence,undefined);assert.ok(on.session.getActiveToolNames().includes('get_symbol_context'));}finally{await off.dispose();await on.dispose();}
});

test('guided extension supplies initial and post-edit evidence, tool mode does not inject',async t=>{
  const f=await fixture(t,{'a.mjs':'export function answer(){return 1}'}),handlers=new Map();
  intelligenceExtension(f.engine,{guided:true})({on:(name,fn)=>handlers.set(name,fn)});
  const initial=await handlers.get('before_agent_start')({prompt:'fix answer'});assert.match(initial.message.content,/answer/);
  const event={toolName:'codemode',content:[{type:'text',text:'edited'}],structuredContent:{ok:true},details:{}};
  assert.equal(await handlers.get('tool_result')(event),undefined);
  await f.put('a.mjs','export function answer(){return 2}');
  const result=await handlers.get('tool_result')(event);assert.deepEqual(result.structuredContent,{ok:true});assert.match(result.content[1].text,/modified/);
  assert.equal(await handlers.get('tool_result')(event),undefined);
  const passive=new Map();intelligenceExtension(f.engine)({on:(n,f)=>passive.set(n,f)});assert.equal(await passive.get('before_agent_start')({prompt:'answer'}),undefined);assert.ok(!passive.has('tool_result'));
});
