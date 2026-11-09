import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
import {listIntelligenceSources} from '../packages/cli/src/intelligence/source-files.mjs';
import {onDemandExtension} from '../packages/cli/src/intelligence/on-demand.mjs';
import {initializeWorkspaceGit} from '../src/intelligence-eval.mjs';
async function setup(t,files){
  const workspace=await mkdtemp(resolve(tmpdir(),'suffice-intel-bounds-'));t.after(()=>rm(workspace,{recursive:true,force:true}));
  const put=async(p,s)=>{await mkdir(dirname(resolve(workspace,p)),{recursive:true});await writeFile(resolve(workspace,p),s);};
  for(const [p,s]of Object.entries(files))await put(p,s);
  return {workspace,put,engine:createIntelligence({workspace})};
}
test('impact pages bound changed symbols without losing records or reverse test reachability',async t=>{
  const source=n=>Array.from({length:73},(_,i)=>`export function f${i}(){return ${i+n}}`).join('\n');
  const f=await setup(t,{'source.mjs':source(0)});
  for(let i=0;i<45;i++)await f.put(`tests/test${i}.mjs`,"import {f0} from '../source.mjs';f0();");
  await f.engine.begin();await f.put('source.mjs',source(1));
  const ids=[],first=await f.engine.get_impact_analysis({limit:3});let page=first;
  assert.equal(first.changedSymbols.length,3);assert.equal(first.total.changedSymbols,73);assert.equal(first.omittedChangedSymbols,70);
  while(true){assert.ok(page.changedSymbols.length<=3);assert.ok(page.impacted.length<=3);assert.equal(page.revision.contentVersion,first.revision.contentVersion);ids.push(...page.changedSymbols.map(s=>s.id));if(page.page.nextOffset===null)break;page=await f.engine.get_impact_analysis({limit:3,offset:page.page.nextOffset});}
  assert.equal(ids.length,73);assert.equal(new Set(ids).size,73);
  const tests=await f.engine.get_relevant_tests({limit:2});assert.equal(tests.tests.length,2);assert.equal(tests.omitted,43);
  await assert.rejects(f.engine.get_impact_analysis({offset:-1}),/pagination/);
});
test('ignored untracked outputs do not enter the graph; tracked ignored files and new source remain visible',async t=>{
  const f=await setup(t,{'.gitignore':'generated/\n','source.mjs':'export const value=1;','generated/tracked.mjs':'export const tracked=1;'});
  await initializeWorkspaceGit(f.workspace);const before=await f.engine.snapshot();
  await f.put('generated/new.mjs','export const noise=1;');const same=await f.engine.snapshot();
  assert.equal(same.fileSelection.method,'git-ignore');assert.equal(same.fileSelection.ignored,1);assert.equal(same.revision.contentVersion,before.revision.contentVersion);assert.equal(same.metrics.parsedFiles,0);assert.ok(!same.files.some(s=>s.path==='generated/new.mjs'));
  await f.put('generated/tracked.mjs','export const tracked=2;');await f.put('added.mjs','export const added=1;');
  const changed=await f.engine.get_impact_analysis();assert.deepEqual(changed.changedFiles,['generated/tracked.mjs','added.mjs']);
  await f.put('.gitignore','');const unignored=await f.engine.snapshot();assert.ok(unignored.files.some(s=>s.path==='generated/new.mjs'));assert.notEqual(unignored.revision.contentVersion,same.revision.contentVersion);
});
test('inherited parent ignore rules cannot hide a non-independent workspace',async t=>{
  const f=await setup(t,{'.gitignore':'nested/\n','source.mjs':'export const value=1;'});await initializeWorkspaceGit(f.workspace);
  const nested=resolve(f.workspace,'nested');await mkdir(nested);await writeFile(resolve(nested,'source.mjs'),'export const visible=1;');
  const selection=await listIntelligenceSources(nested);assert.equal(selection.selection.method,'filesystem');assert.deepEqual(selection.paths,['source.mjs']);
});
test('on-demand ignores generated output churn and records cheap scan time without indexing',async t=>{
  const f=await setup(t,{'.gitignore':'generated/\n','source.mjs':'const privateValue=1;'});await initializeWorkspaceGit(f.workspace);
  const handlers=new Map(),events=[];onDemandExtension(f.engine,{workspace:f.workspace,log:e=>events.push(e)})({on:(n,fn)=>handlers.set(n,fn)});
  await handlers.get('before_agent_start')({});await f.put('generated/one.mjs','export const a=1;');await f.put('generated/two.mjs','export const b=1;');
  const result=await handlers.get('tool_result')({toolName:'codemode',content:[{type:'text',text:'generated test output'}]});
  assert.equal(result,undefined);assert.equal(f.engine.current,undefined);assert.ok(!events.some(e=>e.type==='graph_query'));assert.ok(events.some(e=>e.type==='graph_version_scan'&&e.latencyMs>=0&&e.fileSelection.ignored===2));
});
