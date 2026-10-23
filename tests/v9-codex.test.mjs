import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseCodexEvents,codexArgs,createCodexAdapter} from '../src/v9/codex.mjs';
import {runProcess} from '../src/v9/process.mjs';
const stream=(extra=[])=>[{type:'thread.started',thread_id:'fixture'},{type:'turn.started'},...extra,{type:'item.completed',item:{id:'reply',type:'agent_message',text:'done'}},{type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:80,output_tokens:20}}].map(x=>JSON.stringify(x)).join('\n');
test('native usage estimates cache reads once and preserves model identity',()=>{
  const p=parseCodexEvents(stream(),{model:'gpt-6.1-sol'});assert.equal(p.valid,true);assert.equal(p.costKnown,true);assert.equal(p.text,'done');assert.equal(p.costUsd,(20*2+80*.1+20*10)/1e6);
});
test('missing, duplicate, invalid, aborted or error receipts do not imply free inference',()=>{
  for(const text of [stream().split('\n').slice(0,-1).join('\n'),stream()+'\n'+JSON.stringify({type:'turn.completed',usage:{}}),stream()+'\nnot json',stream()+'\n'+JSON.stringify({type:'error',message:'lost request'})])assert.equal(parseCodexEvents(text,{model:'gpt-6-luna'}).costKnown,false);
  assert.equal(parseCodexEvents(stream(),{model:'gpt-6-luna',timedOut:true}).costKnown,false);
});
test('review tool activity is rejected, including unknown item types',()=>{
  const p=parseCodexEvents(stream([{type:'item.started',item:{id:'tool',type:'command_execution'}},{type:'item.completed',item:{id:'tool',type:'command_execution'}}]),{model:'gpt-6.1-sol',noTools:true});
  assert.equal(p.valid,false);assert.equal(p.toolCalls,1);assert.match(p.error,/used a tool/);
});
test('Codex arguments disable inherited extensions and use argv for model text',()=>{
  const args=codexArgs({model:'gpt-6-luna',effort:'high',workspace:'C:/task with spaces',noTools:true});
  assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('features.shell_tool=false'));assert.ok(args.includes('mcp_servers={}'));assert.ok(args.includes('features.hooks=false'));assert.equal(args.at(-1),'-');
});
test('adapter retains exact prompt without executing shell syntax',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'suffice-v9-codex-')));t.after(()=>rm(root,{recursive:true,force:true}));let seen;
  const adapter=createCodexAdapter({bin:[process.execPath,'fake-codex.mjs'],run:async(command,args,options)=>{seen={command,args,options};return {stdout:stream(),stderr:'',exitCode:0,latencyMs:1};}});
  const prompt='literal `command` $(never execute) "quotes"\nsecond line';const out=await adapter({role:'implement',model:'gpt-6-luna',effort:'high',workspace:root,runDir:join(root,'receipt'),prompt,timeoutMs:1000});
  assert.equal(out.status,'completed');assert.equal(seen.options.input,prompt);assert.equal(seen.args.includes(prompt),false);assert.equal(await readFile(join(root,'receipt','prompt.txt'),'utf8'),prompt);
});
test('process captures full bytes to files and terminates a timed-out process',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'suffice-v9-process-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const out=await runProcess(process.execPath,['-e',"process.stdout.write('héllo');setTimeout(()=>{},60000)"],{timeoutMs:250,stdoutPath:join(root,'stdout'),stderrPath:join(root,'stderr')});
  assert.equal(out.timedOut,true);assert.equal(await readFile(join(root,'stdout'),'utf8'),'héllo');
});
