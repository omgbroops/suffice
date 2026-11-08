import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {InvestigationGate} from '../src/semantic-activation.mjs';
import {createSemanticTools} from '../packages/cli/src/semantic-tools.mjs';
import {createNavigation} from '../packages/cli/src/navigation.mjs';

async function fixture(t,arm){
  const root=await mkdtemp(resolve(tmpdir(),'suffice-activation-')),sources={'a.ts':'export function value() { return 1; }','b.ts':'import {value} from "./a.js"; export function caller() { return value(); }'};
  for(const [path,text]of Object.entries(sources))await writeFile(resolve(root,path),text);
  const gate=new InvestigationGate({arm,sourceFiles:Object.keys(sources),readSource:path=>readFile(resolve(root,path),'utf8')}),disposers=[];
  t.after(async()=>{disposers.forEach(f=>f());assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});});
  const tools=arm==='ast-assisted'?createNavigation({workspace:root,includeTypeScript:true}):createSemanticTools({workspace:root,onDispose:f=>disposers.push(f)});
  let calls=0;const call=async(tool,args)=>{const startEpoch=gate.epoch,id=`call-${++calls}`,result=await tools.find(t=>t.name===tool).execute(id,args);if(!result.isError)await gate.observe(tool,args,result.structuredContent,{startEpoch,callId:id});return result.structuredContent;};
  return {gate,root,sources,call};
}
test('baseline and semantic optional never require navigation',async t=>{
  for(const arm of ['baseline','semantic-optional']){const {gate}=await fixture(t,arm);const auth=await gate.authorize('file_write',{path:'a.ts',content:'x'});gate.completed(auth,{version:'v'});assert.equal(gate.summary().compliant,true);assert.equal(gate.summary().semanticCalls,0);}
});
test('AST gate requires successful discovery and read of the first edited file before initial modification',async t=>{
  const {gate,call}=await fixture(t,'ast-assisted');await assert.rejects(gate.authorize('file_write',{path:'a.ts'}),/symbols/);
  await call('symbols',{path:'a.ts'});await call('symbol_read',{path:'a.ts',name:'absent'});await assert.rejects(gate.authorize('file_write',{path:'a.ts'}),/symbol_read/);
  await call('symbol_read',{path:'a.ts',name:'value'});await assert.rejects(gate.authorize('file_write',{path:'b.ts'}),/symbols/);
  const auth=await gate.authorize('file_write',{path:'a.ts'});gate.completed(auth,{version:'v'});
  assert.equal(gate.summary().compliant,true);assert.ok(auth.evidence.ast.callId);
  assert.ok(await gate.authorize('file_write',{path:'b.ts'}));
});
test('semantic gate enforces same relevant symbol, revision, graph and impact before edits',async t=>{
  const {gate,call}=await fixture(t,'semantic-assisted');const symbols=await call('semantic_symbols',{path:'a.ts',query:'value'}),id=symbols.matches[0].id;
  await call('impact_analysis',{symbol:id,change:'implementation',limit:6});await assert.rejects(gate.authorize('file_edit',{path:'a.ts',oldText:'return 1;'}),/SAME/);
  await call('symbol_callers',{symbol:id,limit:6});await call('impact_analysis',{symbol:id,change:'implementation',limit:6});
  await assert.rejects(gate.authorize('file_write',{path:'a.ts'}),/module/);
  await assert.rejects(gate.authorize('file_edit',{path:'b.ts',oldText:'return value();'}),/SAME/);
  const auth=await gate.authorize('file_edit',{path:'a.ts',oldText:'return 1;'});gate.completed(auth,{version:'v'});assert.equal(gate.summary().compliant,true);
  await assert.rejects(gate.authorize('file_edit',{path:'a.ts',oldText:'return 1;'}),/Repeat/);
});
test('module analysis covers whole-file writes; stale, failed and racing evidence cannot unlock edits',async t=>{
  const {gate,call,sources,root}=await fixture(t,'semantic-assisted');await call('semantic_symbols',{path:'a.ts'});await call('symbol_dependencies',{symbol:'a.ts',limit:6});await call('impact_analysis',{symbol:'a.ts',change:'implementation',limit:6});
  const auth=await gate.authorize('file_write',{path:'a.ts'});assert.equal(auth.evidence.target,'a.ts');
  await writeFile(resolve(root,'a.ts'),sources['a.ts'].replace('1','2'));gate.completed(auth,{version:'next'});
  const symbols=await call('semantic_symbols',{path:'a.ts'}),id=symbols.matches[0].id;
  await gate.observe('symbol_dependencies',{symbol:id},{symbol:id,revision:'old',matches:[]});await gate.observe('impact_analysis',{symbol:id,change:'implementation'},{symbol:id,revision:symbols.revision,affected:[],verification:{targets:['a.ts']}});
  await assert.rejects(gate.authorize('file_write',{path:'a.ts'}),/SAME/);
  await gate.observe('symbol_dependencies',{symbol:id},{symbol:id,revision:symbols.revision,matches:[]},{startEpoch:0});
  await assert.rejects(gate.authorize('file_write',{path:'a.ts'}),/SAME/);
  assert.equal(new InvestigationGate({arm:'semantic-assisted',sourceFiles:[],readSource:async()=>''}).summary().compliant,false);
});
