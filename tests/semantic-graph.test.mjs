import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,rename,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {SemanticGraph} from '../packages/cli/src/semantic/graph.mjs';
import {RecipeRegistry} from '../packages/cli/src/semantic/recipes.mjs';
import {repositoryTools} from '../packages/cli/src/tools.mjs';
import {parseOptions} from '../packages/cli/src/options.mjs';
import {createSufficeSession} from '../packages/cli/src/session.mjs';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';

async function fixture(t,files={}) {
  const root=await mkdtemp(resolve(tmpdir(),'suffice-semantic-'));
  const put=async(path,text)=>{await mkdir(dirname(resolve(root,path)),{recursive:true});await writeFile(resolve(root,path),text);};
  await put('tsconfig.json',JSON.stringify({compilerOptions:{module:'esnext',moduleResolution:'bundler',target:'esnext',baseUrl:'.',paths:{'@lib/*':['lib/*']}}}));
  for(const [path,text]of Object.entries(files))await put(path,text);
  const graph=new SemanticGraph(root);t.after(async()=>{graph.dispose();assert.equal(dirname(root),resolve(tmpdir()));assert.ok(root.startsWith(resolve(tmpdir(),'suffice-semantic-')));await rm(root,{recursive:true,force:true});});
  const find=(name,path)=>{const matches=graph.symbols({query:name,path,limit:80}).matches.filter(n=>n.name===name);assert.equal(matches.length,1,`Expected one ${name} in ${path}: ${JSON.stringify(matches)}`);return matches[0].id;};
  return {root,graph,put,find};
}
const sources={
  'lib/a.ts':'export interface Input { value: number }\nexport function validate(x: Input): number { return x.value; }\nexport default class Box { run(x: Input) { return validate(x); } }\nexport let state = 0; export function mutate() { state++; }\n',
  'lib/other.ts':'export function validate(x: number) { return x + 100; }\n',
  'barrel.ts':'export {validate as check, default as Box} from "./lib/a.js";\n',
  'consumer.ts':'import {check as alias, Box} from "./barrel.js"; import * as ns from "@lib/a";\nexport function execute() { const box = new Box(); const value = alias({value: 1}); box.run({value}); return ns.validate({value}); }\nexport function shadow() { function validate(x: number) { return x; } return validate(2); }\n',
  'tests/a.test.ts':'import {validate} from "../lib/a.js"; export function directTest() { return validate({value: 1}); }\n',
  'tests/inferred.test.ts':'import {execute} from "../consumer.js"; export function indirectTest() { return execute(); }\n',
  'tests/unmapped.test.ts':'export function unrelatedTest() { return true; }\n',
  'tests/dynamic.test.ts':'export function dynamicTest(key: string) { return import(key); }\n',
};

test('compiler resolves aliases, reexports, namespaces, paths, methods, types and shadows without name conflation',async t=>{
  const {graph,find}=await fixture(t,sources),target=find('validate','lib/a.ts'),other=find('validate','lib/other.ts'),execute=find('execute','consumer.ts'),shadow=find('shadow','consumer.ts');
  const calls=graph.callers({symbol:target,limit:80}).matches.map(m=>m.symbol.id);
  assert.ok(calls.includes(execute));assert.ok(calls.includes(find('run','lib/a.ts')));assert.ok(!calls.includes(shadow));
  assert.equal(graph.callers({symbol:other}).matches.length,0);
  const deps=graph.dependencies({symbol:execute,limit:80});assert.ok(deps.matches.some(m=>m.symbol.id===target));
  const typed=graph.allAnalysis().edges.filter(e=>e.from===target&&e.kind==='type_dependency');assert.ok(typed.some(e=>e.to===find('Input','lib/a.ts')));
  assert.ok(graph.allAnalysis().edges.some(e=>e.kind==='reexports'&&e.from==='barrel.ts'&&e.to==='lib/a.ts'));
  assert.ok(graph.allAnalysis().edges.some(e=>e.kind==='exports'&&e.to===target));
  const shadowCalls=graph.dependencies({symbol:shadow,limit:80});assert.ok(shadowCalls.matches.some(m=>m.symbol.name==='validate'&&m.symbol.path==='consumer.ts'));
});

test('data flow, nonlocal writes, default imports, destructuring and JSX/TSX remain compiler-based',async t=>{
  const {graph,find}=await fixture(t,{...sources,'view.tsx':'import DefaultBox from "./lib/a.js";\nexport function view() { const box = new DefaultBox(); const {run: action} = box; const out = action({value: 3}); return <span>{out}</span>; }\n'});
  const edges=(graph.refresh(),graph.allAnalysis().edges),mutate=find('mutate','lib/a.ts'),state=find('state','lib/a.ts');
  assert.ok(edges.some(e=>e.from===mutate&&e.to===state&&e.kind==='writes'));
  assert.ok(edges.some(e=>e.from===mutate&&e.to===state&&e.kind==='side_effect'));
  assert.ok(edges.some(e=>e.kind==='data_flow'&&e.evidence==='destructured_property'));
  assert.ok(edges.some(e=>e.kind==='calls'&&e.to===find('Box','lib/a.ts')&&e.location.path==='view.tsx'));
  assert.ok(edges.some(e=>e.kind==='calls'&&e.to===find('run','lib/a.ts')&&e.location.path==='view.tsx'));
  assert.ok(graph.symbols({path:'view.tsx'}).matches.some(n=>n.name==='view'));
});

test('transitive impacts label structural evidence separately from possible behavior and recommend conservative tests',async t=>{
  const {graph,find}=await fixture(t,sources),symbol=find('validate','lib/a.ts'),impact=graph.impact({symbol,change:'return_type',depth:5,limit:80});
  assert.ok(impact.affected.some(m=>m.symbol.name==='indirectTest'&&!m.direct));
  assert.ok(impact.affected.every(m=>m.categories.some(c=>c.category==='behavioral'&&c.certainty==='possible')));
  assert.ok(impact.affected.every(m=>m.path.length>0&&m.path.every(e=>e.location.path&&e.certainty==='resolved')));
  assert.equal(impact.verification.typecheck,true);assert.equal(impact.verification.fullSuiteRecommended,true);
  const tests=graph.affectedTests({symbols:[symbol]});
  assert.ok(tests.direct.some(v=>v.path==='tests/a.test.ts'&&!v.coverageProven));
  assert.ok(tests.inferred.some(v=>v.path==='tests/inferred.test.ts'));
  assert.ok(tests.uncertain.some(v=>v.path==='tests/dynamic.test.ts'));
  assert.ok(tests.unmapped.includes('tests/unmapped.test.ts'));
  assert.equal(graph.impact({symbol,change:'implementation'}).verification.typecheck,false);
  assert.throws(()=>graph.impact({symbol,change:'guaranteed_safe'}),/Change must/);
});

test('queries hash source, reuse unrelated analysis, invalidate dependents, and remove renamed/deleted declarations',async t=>{
  const {graph,find,put,root}=await fixture(t,sources),id=find('validate','lib/a.ts');graph.allAnalysis();
  const unaffected=graph.cache.get(resolve(root,'lib/other.ts'));
  await put('lib/a.ts',sources['lib/a.ts'].replace('return x.value;','return x.value + 1;'));
  assert.equal(find('validate','lib/a.ts'),id);assert.equal(graph.lastUpdate.kind,'incremental');
  assert.ok(graph.lastUpdate.invalidated.includes('consumer.ts'));assert.ok(!graph.lastUpdate.invalidated.includes('lib/other.ts'));
  graph.allAnalysis();assert.equal(graph.cache.get(resolve(root,'lib/other.ts')),unaffected);
  await rename(resolve(root,'lib/a.ts'),resolve(root,'lib/renamed.ts'));
  graph.refresh();assert.ok(!graph.nodes.has(id));assert.ok(graph.allAnalysis().unresolved.some(v=>v.reason==='external_or_unresolved_module'));
  await rm(resolve(root,'lib/renamed.ts'));graph.refresh();assert.ok(![...graph.nodes.values()].some(n=>n.path==='lib/renamed.ts'));
  await put('tsconfig.json','{ broken');graph.refresh();assert.ok(graph.state().configErrors.length);
});

test('global scripts invalidate ambient consumers and malformed/dynamic code explicitly reports uncertainty',async t=>{
  const {graph,put,root}=await fixture(t,{'global.ts':'function globalValue() { return 1; }','use.ts':'export const out = globalValue();','bad.ts':'export function {','dynamic.ts':'export function run(obj: any,key: string) { obj[key](); return import(key); }'});
  graph.refresh();graph.allAnalysis();await put('global.ts','function globalValue() { return "x"; }');graph.refresh();
  assert.ok(graph.lastUpdate.invalidated.includes('use.ts'));
  const analysis=graph.allAnalysis();assert.ok(analysis.unresolved.some(u=>u.reason==='parse_error'));assert.ok(analysis.unresolved.some(u=>u.reason==='computed_access'));assert.ok(analysis.unresolved.some(u=>u.reason==='dynamic_call'));
  assert.ok(graph.cache.has(resolve(root,'dynamic.ts')));
});

test('retrieval and indexing bounds are visible, symlinks are excluded, partial graphs cannot apply recipes',async t=>{
  const {root}=await fixture(t,{'a.ts':'export function a() { return 1; }','b.ts':'export const b = 2;'});
  await symlink(resolve(root,'a.ts'),resolve(root,'linked.ts'),'file');
  const graph=new SemanticGraph(root,{maxFiles:2});t.after(()=>graph.dispose());const found=graph.symbols({limit:1});
  assert.equal(found.incomplete,true);assert.ok(found.omittedCount>0);
  const registry=new RecipeRegistry(graph),result=await registry.apply({recipe:'rename_symbol',parameters:{symbol:found.matches[0].id,newName:'changed'},expectedRevision:found.revision});
  assert.match(result.error,/complete/);assert.throws(()=>graph.symbols({limit:100}),/Limit/);
  const complete=new SemanticGraph(root);t.after(()=>complete.dispose());complete.refresh();assert.ok(complete.omitted.some(v=>v.reason==='symlink'));
});

test('recipe rename updates resolved references and preserves shadowed names with a verified candidate journal',async t=>{
  const {graph,find,root}=await fixture(t,{'a.ts':'export function run(x: number) { return x + 1; }\n','b.ts':'import {run as local} from "./a.js"; export const result = local(2); export function shadow(run: number) { return run; }\n'});
  const symbol=find('run','a.ts'),registry=new RecipeRegistry(graph),revision=graph.revision;
  const preview=await registry.apply({recipe:'rename_symbol',parameters:{symbol,newName:'calculate'},expectedRevision:revision});assert.equal(preview.preview,true);assert.equal(preview.changes.length,2);
  assert.match(await readFile(resolve(root,'a.ts'),'utf8'),/function run/);
  const applied=await registry.apply({recipe:'rename_symbol',parameters:{symbol,newName:'calculate'},expectedRevision:revision,apply:true,verification:{command:process.execPath,args:['-e','process.exit(0)']}});
  assert.equal(applied.applied,true,JSON.stringify(applied));assert.match(await readFile(resolve(root,'b.ts'),'utf8'),/calculate as local/);assert.match(await readFile(resolve(root,'b.ts'),'utf8'),/shadow\(run: number\)/);
  const candidate=JSON.parse(await readFile(applied.candidate,'utf8'));assert.equal(candidate.status,'candidate');assert.equal(candidate.promotion.trusted,false);assert.equal(candidate.sourceRevision,revision);assert.equal(candidate.verification.passed,true);
  assert.equal(registry.inspectCandidate(applied.candidate).validFoundation,true);assert.equal(registry.inspectCandidate(applied.candidate).trusted,false);
});

test('recipes reject stale revisions, invalid parameters and collisions, and roll back failed verification',async t=>{
  const original='export function run() { return 1; }\nexport const taken = 2;\n';
  const {graph,find,put,root}=await fixture(t,{'a.ts':original});const registry=new RecipeRegistry(graph),symbol=find('run','a.ts');
  assert.match((await registry.apply({recipe:'rename_symbol',parameters:{symbol,newName:'bad-name'},expectedRevision:graph.revision})).error,/identifier/);
  const verification={command:process.execPath,args:['-e','process.exit(1)']};
  const failed=await registry.apply({recipe:'rename_symbol',parameters:{symbol,newName:'changed'},expectedRevision:graph.revision,apply:true,verification});assert.equal(failed.applied,false);assert.match(failed.error,/verification failed/);assert.equal(failed.rollback[0].status,'restored');assert.equal(await readFile(resolve(root,'a.ts'),'utf8'),original);
  const collision=await registry.apply({recipe:'rename_symbol',parameters:{symbol,newName:'taken'},expectedRevision:graph.revision,apply:true,verification});assert.match(collision.error,/collide/);assert.equal(await readFile(resolve(root,'a.ts'),'utf8'),original);
  const stale=graph.revision;await put('a.ts',original+'// external edit\n');assert.match((await registry.apply({recipe:'rename_symbol',parameters:{symbol,newName:'changed'},expectedRevision:stale})).error,/Revision/);
});

test('explicit import-path and narrow API call migrations enforce applicability and postconditions',async t=>{
  const {graph,find,root,put}=await fixture(t,{'a.ts':'export function run(x: number, enabled = true) { return enabled ? x : 0; }\n','b.ts':'import {run} from "./a.js"; export const result = run(2);\n'});
  const registry=new RecipeRegistry(graph),symbol=find('run','a.ts'),verification={command:process.execPath,args:['-e','process.exit(0)']};
  let result=await registry.apply({recipe:'update_import_path',parameters:{path:'b.ts',specifier:'./a.js',newSpecifier:'@lib/missing',targetModule:'a.ts'},expectedRevision:graph.revision,apply:true,verification});assert.match(result.error,/explicit target/);
  await put('tsconfig.json',JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@a':['a.ts']},module:'esnext',moduleResolution:'bundler'}}));graph.refresh();
  result=await registry.apply({recipe:'update_import_path',parameters:{path:'b.ts',specifier:'./a.js',newSpecifier:'@a',targetModule:'a.ts'},expectedRevision:graph.revision,apply:true,verification});assert.equal(result.applied,true,JSON.stringify(result));
  result=await registry.apply({recipe:'add_call_argument',parameters:{symbol,arity:1,argument:false},expectedRevision:graph.revision,apply:true,verification});assert.equal(result.applied,true,JSON.stringify(result));assert.match(await readFile(resolve(root,'b.ts'),'utf8'),/run\(2, false\)/);
  await put('b.ts','import {run} from "./a.js"; export const callback = run; export const result = run(1);\n');graph.refresh();
  result=await registry.apply({recipe:'add_call_argument',parameters:{symbol,arity:1,argument:false},expectedRevision:graph.revision});assert.match(result.error,/Non-call/);
});

test('rollback preserves concurrent edits and retains recovery evidence',async t=>{
  const {graph,find,root,put}=await fixture(t,{'a.ts':'export function run() { return 1; }\n'});
  const symbol=find('run','a.ts'),registry=new RecipeRegistry(graph,{verify:async()=>{await put('a.ts','// concurrent user change\nexport const replacement = 4;\n');return {passed:false};}});
  const result=await registry.apply({recipe:'rename_symbol',parameters:{symbol,newName:'changed'},expectedRevision:graph.revision,apply:true,verification:{command:'unused',args:[]}});
  assert.equal(result.rollback[0].status,'conflict_preserved');assert.match(await readFile(resolve(root,'a.ts'),'utf8'),/concurrent user change/);assert.equal(JSON.parse(await readFile(result.journal,'utf8')).status,'recovery_required');
});

test('configured test globs and unattributed coverage metadata remain evidence rather than invented test ownership',async t=>{
  const {graph,find}=await fixture(t,{'a.ts':'export function run() { return 1; }','checks/custom.ts':'import {run} from "../a.js"; export const actual = run();','package.json':JSON.stringify({scripts:{test:'custom-runner'},jest:{testMatch:['<rootDir>/checks/**/*.ts']}}),'coverage/coverage-final.json':'{"a.ts":{"path":"a.ts"}}'});
  const selected=graph.affectedTests({symbols:[find('run','a.ts')]});assert.ok(selected.direct.some(t=>t.path==='checks/custom.ts'));assert.equal(selected.coverageMetadata.status,'istanbul_present_without_per_test_attribution');assert.equal(selected.direct[0].coverageProven,false);assert.deepEqual(selected.testDiscovery.commands,['custom-runner']);
});

test('rename refuses a new name that would capture a reference in a nested scope',async t=>{
  const {graph,find}=await fixture(t,{'a.ts':'export function run() { return 1; }\nexport function caller(taken: () => number) { return run(); }'});
  const symbol=find('run','a.ts'),result=await new RecipeRegistry(graph).apply({recipe:'rename_symbol',parameters:{symbol,newName:'taken'},expectedRevision:graph.revision});assert.match(result.error,/collide/);
});

test('CLI stays backward compatible and semantic/recipe tools are separately opt-in and codemode-compatible',async t=>{
  const {root}=await fixture(t,{'a.ts':'export function run() { return 1; }'});
  const ordinary=repositoryTools({workspace:root});assert.ok(ordinary.some(v=>v.name==='symbols'));assert.ok(!ordinary.some(v=>v.name==='semantic_symbols'));
  assert.throws(()=>parseOptions(['--recipes']),/requires/);assert.equal(parseOptions(['--semantic']).semantic,true);assert.equal(parseOptions([]).semantic,undefined);
  const events=[],disposers=[],tools=repositoryTools({workspace:root,semantic:true,log:e=>events.push(e),onDispose:f=>disposers.push(f)});
  const result=await tools.find(v=>v.name==='semantic_symbols').execute('test',{query:'run'});assert.equal(result.structuredContent.matches[0].name,'run');assert.equal(events[0].type,'semantic');
  assert.ok(!tools.some(v=>v.name==='recipe_apply'));assert.ok(repositoryTools({workspace:root,semantic:true,recipes:true}).some(v=>v.name==='recipe_apply'));disposers.forEach(f=>f());
});

test('actual CLI session exposes semantic tools through Pi codemode without inference',async t=>{
  const {root}=await fixture(t,{'a.ts':'export function run() { return 1; }'}),home=resolve(root,'.home');
  const runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});
  const session=await createSufficeSession({...parseOptions(['--semantic']),cwd:root,home},runtime);
  try {
    const codemode=session.session.agent.state.tools.find(t=>t.name==='codemode');assert.ok(codemode);
    const args={code:'text(await tools.semantic_symbols({query:"run"}));'};
    // Pi requires the issuing assistant frame for nested-tool hook execution.
    session.session.agent.state.messages.push({role:'assistant',content:[{type:'toolCall',id:'semantic-integration',name:'codemode',arguments:args}],model:'gpt-6.1-sol',provider:'openai',api:'openai-responses',stopReason:'toolUse',timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{total:0}}});
    const result=await codemode.execute('semantic-integration',args,undefined,()=>{});
    const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('');assert.match(text,/Script completed/);assert.match(text,/function:run/);assert.equal(session.totals.modelCalls,0);
  } finally {await session.dispose();}
});
