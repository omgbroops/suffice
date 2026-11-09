import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
import {onDemandExtension} from '../packages/cli/src/intelligence/on-demand.mjs';
async function fixture(t,files){
  const workspace=await mkdtemp(resolve(tmpdir(),'suffice-ts-resolution-'));t.after(()=>rm(workspace,{recursive:true,force:true}));
  const put=async(path,source)=>{await mkdir(dirname(resolve(workspace,path)),{recursive:true});await writeFile(resolve(workspace,path),source);};
  for(const [p,s]of Object.entries(files))await put(p,s);
  const cacheDir=resolve(workspace,'.cache');return {workspace,put,engine:createIntelligence({workspace,cacheDir}),cacheDir};
}
const config=paths=>JSON.stringify({compilerOptions:{moduleResolution:'node',baseUrl:'.',paths}});
test('configured TS aliases, extensionless imports and reexports resolve with config provenance',async t=>{
  const f=await fixture(t,{'tsconfig.json':config({'@value':['value.ts']}),'value.ts':'export function answer(x:number){return x+1}', 'barrel.ts':"export {answer as renamed} from './value';",'use.ts':"import {renamed as run} from './barrel'; import {answer as fallback} from '@value'; export const result=run(fallback(1));"});
  const g=await f.engine.snapshot(),target=g.symbols.find(s=>s.name==='answer'&&s.path==='value.ts'),calls=g.edges.filter(e=>e.kind==='call'&&e.to===target.id);
  assert.equal(calls.length,2);assert.ok(calls.every(e=>e.via.some(v=>v.resolution?.config.path==='tsconfig.json')));
  assert.ok(calls.every(e=>e.via.filter(v=>v.resolution).every(v=>v.resolution.configurationVersion===g.revision.configurationVersion)));
  assert.equal(g.edges.filter(e=>e.kind==='module').length,3);
});
test('alias config edits relink unchanged source and invalidate warm-cache relationships',async t=>{
  const f=await fixture(t,{'tsconfig.json':config({'@target':['one.ts']}),'one.ts':'export function value(){return 1}','two.ts':'export function value(){return 2}','use.ts':"import {value} from '@target'; value();"});
  const before=await f.engine.snapshot();await f.put('tsconfig.json',config({'@target':['two.ts']}));const impact=await f.engine.get_impact_analysis();
  assert.notEqual(impact.revision.contentVersion,before.revision.contentVersion);assert.equal(impact.revision.sourceContentVersion,before.revision.sourceContentVersion);assert.equal(impact.configurationChanged,true);assert.deepEqual(impact.configurationFilesChanged,['tsconfig.json']);assert.deepEqual(impact.changedFiles,[]);assert.ok(impact.seeds.includes('use.ts'));
  const after=f.engine.current,target=after.symbols.find(s=>s.path==='two.ts'&&s.name==='value');assert.equal(after.edges.filter(e=>e.kind==='call'&&e.to===target.id).length,1);assert.equal(after.metrics.parsedFiles,0);
  const warm=await createIntelligence(f).snapshot();assert.equal(warm.metrics.parsedFiles,0);assert.ok(warm.edges.some(e=>e.kind==='call'&&e.to===target.id));
});
test('NodeNext import/require modes and package type changes are honored',async t=>{
  const f=await fixture(t,{'tsconfig.json':JSON.stringify({compilerOptions:{module:'nodenext',moduleResolution:'nodenext'}}),'package.json':'{"type":"commonjs"}','value.ts':'export function value(){return 1}','use.ts':"import {value} from './value';value();",'esm.mts':"import {value} from './value.js';value();"});
  const before=await f.engine.snapshot(),target=before.symbols.find(s=>s.path==='value.ts'&&s.name==='value');assert.equal(before.edges.filter(e=>e.kind==='call'&&e.to===target.id).length,2);
  await f.put('package.json','{"type":"module"}');const impact=await f.engine.get_impact_analysis(),after=f.engine.current;
  assert.equal(impact.configurationChanged,true);assert.deepEqual(impact.configurationFilesChanged,['package.json']);assert.equal(after.edges.filter(e=>e.kind==='call'&&e.to===target.id).length,1);assert.ok(after.unresolved.some(e=>e.kind==='module'&&e.evidence.path==='use.ts'&&e.reason==='typescript-unresolved'));
});
test('unsupported configs, declaration-only targets, JavaScript implicit paths and missing configs abstain',async t=>{
  const f=await fixture(t,{'tsconfig.json':config({}),'value.ts':'export function value(){}','types.d.ts':'export declare function declared(): void;','a.ts':"import {declared} from './types';declared();",'js.mjs':"import {value} from './value';value();"});
  let g=await f.engine.snapshot();assert.ok(g.unresolved.some(e=>e.kind==='module'&&e.reason==='declaration-only-resolution'));assert.ok(g.unresolved.some(e=>e.kind==='module'&&e.evidence.path==='js.mjs'&&e.reason==='missing-or-implicit-module-path'));
  await f.put('a.ts',"import {value} from './value';value();");await f.put('tsconfig.json','{"extends":"./external-config.json"}');g=await f.engine.snapshot();assert.ok(g.unresolved.some(e=>e.kind==='module'&&e.reason==='tsconfig-extends-not-supported'));
  await rm(resolve(f.workspace,'tsconfig.json'));g=await f.engine.snapshot();assert.ok(g.unresolved.some(e=>e.kind==='module'&&e.reason==='typescript-config-not-found'));
  await f.put('a.ts',"import {declared} from './types.d.ts';declared();");g=await f.engine.snapshot();assert.ok(g.unresolved.some(e=>e.kind==='module'&&e.evidence.path==='a.ts'&&e.reason==='declaration-only-resolution'));assert.ok(!g.edges.some(e=>e.kind==='module'&&e.evidence.path==='a.ts'));
});
test('compiler type-source substitution cannot replace an existing literal JavaScript implementation',async t=>{
  const f=await fixture(t,{'tsconfig.json':config({}),'same.ts':'export function value(){return 1}','same.js':'export function value(){return 2}','use.ts':"import {value} from './same.js';value();"});
  const g=await f.engine.snapshot(),js=g.symbols.find(s=>s.path==='same.js'&&s.name==='value'),typed=g.symbols.find(s=>s.path==='same.ts'&&s.name==='value');
  assert.equal(g.edges.filter(e=>e.kind==='call'&&e.to===js.id).length,1);assert.equal(g.edges.filter(e=>e.kind==='call'&&e.to===typed.id).length,0);
});
test('on-demand activates for config-only edits before indexed relationships change',async t=>{
  const f=await fixture(t,{'tsconfig.json':config({'@target':['one.ts']}),'one.ts':'export const value=1;','two.ts':'export const value=2;','use.ts':"import {value} from '@target';value;"});
  const handlers=new Map(),events=[];onDemandExtension(f.engine,{workspace:f.workspace,log:e=>events.push(e)})({on:(n,fn)=>handlers.set(n,fn)});
  await handlers.get('before_agent_start')({});assert.equal(f.engine.current,undefined);await handlers.get('tool_call')({toolName:'edit',toolCallId:'config',input:{path:'tsconfig.json'}});await f.put('tsconfig.json',config({'@target':['two.ts']}));
  const result=await handlers.get('tool_result')({toolName:'codemode',content:[{type:'text',text:'changed config'}]});assert.ok(result);assert.match(result.content.at(-1).text,/editing-module-configuration/);assert.ok(events.some(e=>e.type==='graph_guidance'&&e.data.impact.configurationChanged));
});
