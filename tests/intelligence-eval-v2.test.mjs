import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {suite} from '../benchmarks/intelligence-eval-v2/tasks.mjs';
import {CONFIG,schedule,snapshot,initializeWorkspaceGit} from '../src/intelligence-eval.mjs';
import {execFileSync} from 'node:child_process';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
import {onDemandExtension} from '../packages/cli/src/intelligence/on-demand.mjs';

test('24 tasks have eight prospective categories and a balanced reproducible 144-run schedule',()=>{
  assert.equal(suite.length,24);assert.equal(new Set(suite.map(t=>t.id)).size,24);
  for(const c of ['simple','cross-file','complex'])assert.equal(suite.filter(t=>t.category===c).length,8);
  const blocks=schedule(suite),flat=blocks.flat();assert.equal(flat.length,144);assert.deepEqual(blocks,schedule(suite));assert.notDeepEqual(blocks,schedule(suite,2,123));
  for(const t of suite)for(const arm of ['A','B','C'])assert.equal(flat.filter(r=>r.task===t.id&&r.arm===arm).length,2);
  for(const b of blocks)assert.deepEqual(b.map(r=>r.arm).sort(),['A','B','C']);
  assert.equal(CONFIG.model,'gpt-6-luna');assert.equal(CONFIG.effort,'xhigh');assert.equal(CONFIG.retryCount,0);
});
async function setup(t,files){
  const workspace=await mkdtemp(resolve(tmpdir(),'suffice-demand-'));t.after(()=>rm(workspace,{recursive:true,force:true}));
  for(const [p,s]of Object.entries(files))await writeFile(resolve(workspace,p),s);
  const events=[],engine=createIntelligence({workspace}),handlers=new Map();onDemandExtension(engine,{workspace,log:e=>events.push(e)})({on:(name,fn)=>handlers.set(name,fn)});
  await handlers.get('before_agent_start')({});return {workspace,engine,handlers,events};
}
const result={toolName:'codemode',toolCallId:'outer',content:[{type:'text',text:'done'}],structuredContent:{ok:true},details:{}};
test('on-demand does not index initially or after one private edit',async t=>{
  const f=await setup(t,{'private.mjs':'function local(){return 1}'});assert.equal(f.engine.current,undefined);
  await f.handlers.get('tool_call')({toolName:'edit',toolCallId:'edit',input:{path:'private.mjs'}});
  await writeFile(resolve(f.workspace,'private.mjs'),'function local(){return 2}');assert.equal(await f.handlers.get('tool_result')(result),undefined);
  assert.equal(f.engine.current,undefined);assert.equal(f.events.filter(e=>e.type==='graph_query').length,0);
});
test('export edits trigger current evidence and unchanged results are reused',async t=>{
  const f=await setup(t,{'public.mjs':'export function value(){return 1}'});
  await f.handlers.get('tool_call')({toolName:'edit',toolCallId:'edit',input:{path:'public.mjs'}});assert.ok(f.engine.current);
  await writeFile(resolve(f.workspace,'public.mjs'),'export function value(){return 2}');
  const out=await f.handlers.get('tool_result')(result);assert.deepEqual(out.structuredContent,{ok:true});assert.match(out.content.at(-1).text,/editing-exported-module/);assert.match(out.content.at(-1).text,/modified/);
  const n=f.events.filter(e=>e.type==='graph_query').length;assert.equal(await f.handlers.get('tool_result')(result),undefined);assert.equal(f.events.filter(e=>e.type==='graph_query').length,n);
});
test('two private-file modifications trigger independently of task labels',async t=>{
  const f=await setup(t,{'a.mjs':'const a=1;','b.mjs':'const b=1;'});
  for(const p of ['a.mjs','b.mjs']){await f.handlers.get('tool_call')({toolName:'edit',toolCallId:p,input:{path:p}});await writeFile(resolve(f.workspace,p),'const changed=2;');}
  const out=await f.handlers.get('tool_result')(result);assert.match(out.content.at(-1).text,/coordinated-file-edits/);assert.ok(f.events.every(e=>!('task' in e)));
});
test('failed public verification is a trigger even without edits',async t=>{
  const f=await setup(t,{'a.mjs':'const a=1;'});
  await f.handlers.get('tool_call')({toolName:'bash',toolCallId:'check',input:{command:'node --test tests/visible.test.mjs'}});
  await f.handlers.get('tool_result')({toolName:'bash',toolCallId:'check',parentToolCallId:'outer',isError:true,content:[{type:'text',text:'not ok 1 - public test'}]});
  const out=await f.handlers.get('tool_result')(result);assert.match(out.content.at(-1).text,/failed-verification/);
});

test('workspace Git roots are independent of parent metadata and reproduce identical starting commits',async t=>{
  const parent=await mkdtemp(resolve(tmpdir(),'suffice-git-isolation-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  execFileSync('git',['-C',parent,'init','-q'],{windowsHide:true});await writeFile(resolve(parent,'parent-only.txt'),'must not appear in a trial');
  const roots=[];
  for(const name of ['first','second']){const workspace=resolve(parent,name);await mkdir(workspace);await writeFile(resolve(workspace,'input.mjs'),'export const value=1;\n');const before=await snapshot(workspace),git=await initializeWorkspaceGit(workspace);assert.deepEqual(await snapshot(workspace),before);assert.equal(git.root.replaceAll('\\','/').toLowerCase(),workspace.replaceAll('\\','/').toLowerCase());assert.equal(execFileSync('git',['-C',workspace,'status','--porcelain'],{encoding:'utf8',windowsHide:true}),'');assert.equal(execFileSync('git',['-C',workspace,'ls-files'],{encoding:'utf8',windowsHide:true}).trim(),'input.mjs');roots.push(git);}
  assert.equal(roots[0].head,roots[1].head);assert.equal(roots[0].tree,roots[1].tree);
});
