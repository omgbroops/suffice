import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {preparePipelineInput,createNoticeExtension} from '../src/pipeline/preparation.mjs';
import {prepareTaskContext} from '../src/pipeline/context.mjs';
import {createRunbook,promoteRunbook} from '../src/pipeline/knowledge.mjs';

async function fixture(t){
  const base=await mkdtemp(path.join(os.tmpdir(),'suffice-preparation-'));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const workspace=path.join(base,'repo');await mkdir(workspace);
  await writeFile(path.join(workspace,'index.mjs'),'export const thing = true;\n');
  return {base,workspace};
}
test('preparation flags independently select evidence and preserve exact original prefix',async t=>{
  const {base,workspace}=await fixture(t),prompt='Original task\nKeep this exact text.  ';
  const context={paths:['index.mjs'],contracts:['Preserve cancellation'],guidance:['Use node test'],commands:{test:'node --test'}};
  const normal=await preparePipelineInput({workspace,prompt,runDir:path.join(base,'normal'),context});
  assert.equal(normal.prompt,prompt);assert.equal(normal.record.bundle.sources.length,0);
  const source=await preparePipelineInput({workspace,prompt,runDir:path.join(base,'source'),features:{preparedContext:true},context});
  assert.ok(source.prompt.startsWith(prompt));assert.match(source.prompt,/untrusted evidence/);
  assert.equal(source.record.bundle.sources.length,1);assert.deepEqual(source.record.bundle.guidance,[]);
  const guidance=await preparePipelineInput({workspace,prompt,runDir:path.join(base,'guidance'),features:{guidance:true},context});
  assert.equal(guidance.record.bundle.sources.length,0);assert.deepEqual(guidance.record.bundle.guidance,context.guidance);
  const stored=JSON.parse(await readFile(path.join(base,'source','preparation.json'),'utf8'));
  assert.deepEqual(stored.references,source.record.references);
  if(process.platform!=='win32')assert.equal((await stat(path.join(base,'source','preparation.json'))).mode&0o777,0o600);
  await assert.rejects(preparePipelineInput({workspace,prompt,runDir:path.join(workspace,'artifacts')}),/outside the actor workspace/);
});

test('notice extension preserves nested results and appends soft notices at codemode parent',async t=>{
  const {workspace}=await fixture(t),record={references:[],notices:[]},hooks=new Map();
  const extension=createNoticeExtension({workspace,record});extension({on:(name,fn)=>hooks.set(name,fn)});
  const call=hooks.get('tool_call'),result=hooks.get('tool_result');
  const read={toolName:'read',input:{path:'index.mjs',offset:1,limit:1},parentToolCallId:'outer'};
  for(let n=0;n<2;n++){
    await call({...read,toolCallId:`outer/${n}`});
    const unchanged=await result({...read,toolCallId:`outer/${n}`,content:[{type:'text',text:'export const thing = true;'}],isError:false});
    assert.equal(unchanged,undefined);
  }
  const structuredContent={result:'exact programmatic value'},details={nestedCalls:['original']};
  const parent=await result({toolName:'codemode',toolCallId:'outer',input:{},content:[{type:'text',text:'export const thing = true;'}],structuredContent,details,isError:false});
  assert.equal(parent.structuredContent,structuredContent);assert.equal(parent.details,details);
  assert.equal(parent.content[0].text,'export const thing = true;');assert.match(parent.content[1].text,/unchanged range/);
  assert.equal(record.notices[0].blocksTool,false);
});

test('preparation reuses only explicitly enabled verified runbooks and excludes stale source lessons',async t=>{
  const {base,workspace}=await fixture(t),{references}=await prepareTaskContext({workspace,paths:['index.mjs']});
  const verification={id:'v1',taskId:'t1',command:'node --test',success:true,completedAt:'2026-10-19T12:00:00Z'};
  const candidate=createRunbook({id:'lesson',taskId:'t1',lesson:'Preserve public cancellation behavior',references,verification});
  const runbook=await promoteRunbook({workspace,runbook:candidate,replayVerification:{...verification,id:'v2',taskId:'t2',freshReplay:true,completedAt:'2026-10-19T13:00:00Z'}});
  const disabled=await preparePipelineInput({workspace,prompt:'task',runDir:path.join(base,'disabled'),features:{guidance:true},runbooks:[runbook]});
  assert.equal(disabled.record.knowledge.reusable.length,0);
  const enabled=await preparePipelineInput({workspace,prompt:'task',runDir:path.join(base,'enabled'),features:{runbooks:true},runbooks:[runbook]});
  assert.equal(enabled.record.knowledge.reusable.length,1);
  assert.match(enabled.prompt,/Preserve public cancellation behavior/);
  await writeFile(path.join(workspace,'index.mjs'),'changed');
  const stale=await preparePipelineInput({workspace,prompt:'task',runDir:path.join(base,'stale'),features:{guidance:true,runbooks:true},runbooks:[runbook]});
  assert.equal(stale.record.knowledge.reusable.length,0);
  assert.equal(stale.record.knowledge.excluded[0].reason,'stale_sources');
});

test('notice collector handles command signatures, failed fingerprint providers and shutdown without blocking',async t=>{
  const {workspace}=await fixture(t),hooks=new Map(),extension=createNoticeExtension({workspace,record:()=>{},sourceFingerprint:'revision-1'});
  extension({on:(name,fn)=>hooks.set(name,fn)});
  for(let n=0;n<2;n++){
    const event={toolName:'bash',toolCallId:String(n),input:{command:'node --test'}};
    assert.equal(await hooks.get('tool_call')(event),undefined);
    const response=await hooks.get('tool_result')({...event,content:[{type:'text',text:'same assertion'}],isError:false,structuredContent:{exit_code:1}});
    if(n===0)assert.equal(response,undefined);else assert.match(response.content[1].text,/same command failed/);
  }
  const failing=new Map();
  createNoticeExtension({workspace,sourceFingerprint:()=>{throw Error('optional observer failed');}})({on:(name,fn)=>failing.set(name,fn)});
  assert.equal(await failing.get('tool_call')({toolName:'bash',toolCallId:'x',input:{command:'false'}}),undefined);
  assert.equal(await hooks.get('session_shutdown')(),undefined);
});

test('truncated or unprinted nested reads do not claim retained source ranges',async t=>{
  const {workspace}=await fixture(t),hooks=new Map(),extension=createNoticeExtension({workspace});
  extension({on:(name,fn)=>hooks.set(name,fn)});
  for(let n=0;n<2;n++){
    const direct={toolName:'read',toolCallId:`direct-${n}`,input:{path:'index.mjs',limit:1}};
    await hooks.get('tool_call')(direct);
    const result=await hooks.get('tool_result')({...direct,content:[{type:'text',text:'export'}],details:{truncation:{truncated:true}},isError:false});
    assert.equal(result,undefined);
    const nested={...direct,toolCallId:`parent-${n}/0`,parentToolCallId:`parent-${n}`};
    await hooks.get('tool_call')(nested);
    await hooks.get('tool_result')({...nested,content:[{type:'text',text:'export const thing = true;'}],isError:false});
    assert.equal(await hooks.get('tool_result')({toolName:'codemode',toolCallId:`parent-${n}`,input:{},content:[{type:'text',text:'No source printed'}],isError:false}),undefined);
  }
  assert.deepEqual(extension.observations,[]);
});
