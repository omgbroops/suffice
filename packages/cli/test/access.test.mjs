import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {repositoryTools} from '../src/tools.mjs';
import {parseOptions} from '../src/options.mjs';
import {commandGate} from '../src/command-gate.mjs';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {createSufficeSession} from '../src/session.mjs';

test('access allowlists compose with native tools and reject invalid levels',async()=>{
 const workspace=await mkdtemp(resolve(tmpdir(),'suffice-access-'));
 const names=access=>repositoryTools({workspace,access}).map(tool=>tool.name).sort();
 const navigation=['symbols','symbol_read','symbol_references'];
 assert.deepEqual(names('read'),['read',...navigation].sort());
 assert.deepEqual(names('edit'),['read','write','edit',...navigation].sort());
 assert.ok(names('full').includes('bash'));assert.throws(()=>names('admin'),/Unknown access/);
 for(const access of ['read','edit','full'])assert.equal(parseOptions(['--access',access]).access,access);
 assert.throws(()=>parseOptions(['--access','admin']),/Invalid access/);
});

test('native file tools receive checked absolute paths without expanding literal @ or ~ names',async()=>{
 const workspace=await mkdtemp(resolve(tmpdir(),'suffice-literal-'));
 const tools=repositoryTools({workspace}),write=tools.find(t=>t.name==='write'),read=tools.find(t=>t.name==='read');
 for(const name of ['@literal.txt','~/literal.txt']){
  await write.execute('write',{path:name,content:'inside'},undefined,()=>{});
  assert.equal(await readFile(resolve(workspace,name),'utf8'),'inside');
  const result=await read.execute('read',{path:name},undefined,()=>{});assert.match(result.content[0].text,/inside/);
 }
 await assert.rejects(write.execute('escape',{path:'../outside',content:'denied'},undefined,()=>{}),/outside/);
});

async function gateFixture(source){
 const root=await mkdtemp(resolve(tmpdir(),'suffice-gate-')),script=resolve(root,'gate.mjs');await writeFile(script,source);
 return {root,hook:`"${process.execPath.replaceAll('\\','/')}" "${script.replaceAll('\\','/')}"`};
}
test('configured gates receive input on stdin, deny commands, and preserve no-hook behavior',async()=>{
 const {root,hook}=await gateFixture(`let input='';for await(const chunk of process.stdin)input+=chunk;const v=JSON.parse(input);process.exit(v.tool_name==='Bash'&&v.tool_input.command==='allowed'?0:2);`);
 await commandGate('allowed',{hook});await assert.rejects(commandGate('denied',{hook}),/denied/);await commandGate('unchanged',{hook:''});
 const saved=process.env.SUFFICE_GATE_CMD;process.env.SUFFICE_GATE_CMD=hook;
 try{const bash=repositoryTools({workspace:root}).find(t=>t.name==='bash');await assert.rejects(bash.execute('denied',{command:'echo should-not-run > marker'},undefined,()=>{}),/denied/);await assert.rejects(readFile(resolve(root,'marker')),/ENOENT/);}finally{if(saved===undefined)delete process.env.SUFFICE_GATE_CMD;else process.env.SUFFICE_GATE_CMD=saved;}
});
test('gate timeout and cancellation fail closed',async()=>{
 const {hook}=await gateFixture('setInterval(()=>{},1000);');
 await assert.rejects(commandGate('blocked',{hook,timeoutMs:100}),/timed out/);
 const controller=new AbortController();const waiting=commandGate('blocked',{hook,signal:controller.signal});setTimeout(()=>controller.abort(),100);
 await assert.rejects(waiting,/cancelled/);await assert.rejects(commandGate('blocked',{hook,signal:controller.signal}));
});

test('restricted sessions never register deferred browser or desktop escape capabilities',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-restricted-'));
 const runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
 for(const access of ['read','edit']){
  const agent=await createSufficeSession({...parseOptions([]),cwd:home,home,access},runtime);
  try{const names=agent.session.getAllTools().map(tool=>tool.name);assert.ok(names.includes('read'));assert.ok(!names.includes('bash'));assert.ok(!names.some(name=>/browser|desktop/.test(name)));assert.doesNotMatch(agent.session.systemPrompt,/operating websites and native apps/);assert.equal(agent.totals.modelCalls,0);}finally{await agent.dispose();}
 }
});
