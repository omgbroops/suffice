import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp, mkdir, readFile, writeFile, rm, utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const crate=resolve(dirname(fileURLToPath(import.meta.url)),'..'), root=resolve(crate,'../..');
const oracleRoot=resolve(process.env.SUFFICE_PI_ORACLE_ROOT||root);
const require=createRequire(resolve(oracleRoot,'package.json')); const pi=await import(pathToFileURL(require.resolve('./node_modules/@earendil-works/pi-coding-agent/dist/index.js')).href);
const bin=resolve(crate,'target/debug/suffice-session'+(process.platform==='win32'?'.exe':''));
function rustRaw(input){const p=spawnSync(bin,{input,encoding:'utf8'});assert.equal(p.status,0,p.stderr);return p.stdout}
function rust(request){return JSON.parse(rustRaw(JSON.stringify(request)))}
const norm=x=>JSON.parse(JSON.stringify(x));
function oracle(entries,leaf){const p=pi.buildSessionProjection(entries,leaf);return norm({...p,entries:p.entries.map(e=>({sourceIndex:entries.indexOf(e.sourceEntry),messages:e.messages}))});}
const t='2025-01-02T03:04:05.000Z';
const msg=(id,parentId,role,content)=>({type:'message',id,parentId,timestamp:t,message:{role,content,timestamp:1735787045000,...(role==='assistant'?{provider:'test',model:'m'}:{})}});
const fixtures=[
 [msg('u',null,'user','hello 🌍'),msg('a','u','assistant',null)],
 [msg('a',null,'user','root'),msg('b','a','assistant','abandoned'),msg('c','a','user','fork'),{type:'custom',id:'d',parentId:'c',customType:'suffice:interrupted'}],
 [msg('a',null,'user','first'),msg('a',null,'user','duplicate'),msg('b','a','assistant','chosen')],
 [msg('u',null,'user','old'),msg('s','u','system','sys'),msg('a','s','assistant','kept'),{type:'compaction',id:'c',parentId:'a',timestamp:t,summary:'private',tokensBefore:20,firstKeptEntryId:'s'},msg('z','c','user','new')],
 [msg('u',null,'user','old'),{type:'compaction',id:'c',parentId:'u',timestamp:t,summary:'one',tokensBefore:2,firstKeptEntryId:'u'},{type:'compaction',id:'d',parentId:'c',timestamp:t,summary:'two',tokensBefore:3,firstKeptEntryId:'u'}],
 [msg('u',null,'user','initial'),msg('a','u','assistant','answer'),{type:'context_edit',id:'e',parentId:'a',targetId:'a',replacement:{content:'edited'}},{type:'context_edit',id:'f',parentId:'e',targetId:'u',replacement:null}],
 [{type:'thinking_level_change',id:'t',parentId:null,thinkingLevel:'high'},{type:'model_change',id:'m',parentId:'t',provider:'p',modelId:'x'},{type:'custom_message',id:'c',parentId:'m',timestamp:t,customType:'example',content:'hé',display:true,details:{x:1}},{type:'branch_summary',id:'b',parentId:'c',timestamp:t,summary:'summary',fromId:'a'}],
 [msg('x','missing','user','orphan')],
];
for(const [index,entries] of fixtures.entries()) test('projection differential '+index,()=>{for(const leaf of [undefined,null,entries[0].id,'unknown']) {const req={op:'project',entries,...(leaf===undefined?{}:{leaf})};assert.deepEqual(rust(req),{ok:true,result:oracle(entries,leaf)});}});
test('strict parsing and cycle detection',()=>{assert.deepEqual(rust({op:'journal',source:'{"type":"session"}\r\n{"broken"'}).result,[{type:'session'}]);assert.match(rust({op:'journal',source:'{}\nBAD\n'}).error,/line 2/);assert.match(rust({op:'project',entries:[{id:'a',parentId:'a'}]}).error,/Cycle/)});
test('listing oracle and bytes unchanged for legacy sessions',async()=>{const dir=await mkdtemp(resolve(tmpdir(),'suffice-session-'));try{const group=resolve(dir,'sessions','group');await mkdir(group,{recursive:true});const path=resolve(group,'fixture.jsonl');const rows=[{type:'session',version:1,id:'old',timestamp:t,cwd:'C:/unicode/é'},{type:'session_info',name:' old name '},msg('u',null,'user',[{type:'text',text:'Hello'},{type:'text',text:'world'}]),msg('a','u','assistant','answer'),{type:'session_info',name:'   '}];const bytes=rows.map(JSON.stringify).join('\r\n')+'\r\n';await writeFile(path,bytes);const hash=async()=>createHash('sha256').update(await readFile(path)).digest('hex');const before=await hash();const got=rust({op:'discover',root:resolve(dir,'sessions')}).result[0];const expected=(await pi.SessionManager.listAll(group))[0];assert.deepEqual(got,{path:expected.path,id:expected.id,cwd:expected.cwd,name:expected.name??null,parentSessionPath:expected.parentSessionPath??null,created:+expected.created,modified:+expected.modified,messageCount:expected.messageCount,firstMessage:expected.firstMessage,allMessagesText:expected.allMessagesText});assert.equal(await hash(),before)}finally{await rm(dir,{recursive:true,force:true})}});



test('missing retained entry and latest edit win',()=>{const entries=[msg('u',null,'user','before'),{type:'compaction',id:'c',parentId:'u',timestamp:t,summary:'summary',tokensBefore:1,firstKeptEntryId:'missing'},msg('a','c','assistant','one'),{type:'context_edit',id:'e1',parentId:'a',targetId:'a',replacement:{content:'two'}},{type:'context_edit',id:'e2',parentId:'e1',targetId:'a',replacement:{content:'three'}}];assert.deepEqual(rust({op:'project',entries}).result,oracle(entries));});
test('v2 browse preserves file bytes and does not migrate hook role',async()=>{const dir=await mkdtemp(resolve(tmpdir(),'suffice-v2-'));try{const file=resolve(dir,'v2.jsonl');const entries=[{type:'session',version:2,id:'v2',timestamp:t,cwd:dir},msg('u',null,'user','prompt'),msg('h','u','hookMessage','old')];await writeFile(file,entries.map(JSON.stringify).join('\n')+'\n');const before=await readFile(file);const journal=rust({op:'journal',source:before.toString('utf8')}).result;const body=journal.filter(e=>e.type!=='session');assert.deepEqual(rust({op:'project',entries:body}).result,oracle(body));assert.deepEqual(await readFile(file),before)}finally{await rm(dir,{recursive:true,force:true})}});

test('malformed projection errors match Pi failure',()=>{
 for(const entries of [[null],[{type:'message',id:'a',message:null}],[{type:'message',id:'a'}]]){
  assert.throws(()=>oracle(entries)); assert.equal(rust({op:'project',entries}).ok,false);
 }
});
test('missing projection fields preserve Pi undefined behavior',()=>{
 const cases=[
  [{type:'thinking_level_change',id:'t',parentId:null}],
  [{type:'model_change',id:'m',parentId:null}],
  [{type:'message',id:'a',parentId:null,message:{role:'assistant',content:[]}}],
  [msg('u',null,'user','x'),{type:'context_edit',id:'e',parentId:'u',targetId:'u',replacement:{}}],
 ];
 for(const entries of cases)assert.deepEqual(rust({op:'project',entries}).result,oracle(entries));
 const missing=[msg('u',null,'user','x'),{type:'context_edit',id:'e',parentId:'u',targetId:'u'}];
 assert.throws(()=>oracle(missing));assert.equal(rust({op:'project',entries:missing}).ok,false);
});
test('timestamp null, missing, primitives, date-only and bounded JSON coercions match Pi',()=>{
 for(const stamp of [null,true,false,0,123456789,'2020-01-02','2020-01-02T03:04:05.000Z',['2020-01-02'],[],{},undefined]){
  const e={type:'custom_message',id:'x',parentId:null,content:'x',...(stamp===undefined?{}:{timestamp:stamp})};
  assert.deepEqual(rust({op:'project',entries:[e]}).result,oracle([e]));
 }
});
test('seeded valid trees with compaction and context edits match Pi',()=>{
 let state=0x1234abcd; const rand=n=>((state=(Math.imul(state,1664525)+1013904223)>>>0)%n);
 for(let run=0;run<100;run++){
  const entries=[];
  for(let i=0;i<30;i++){
   const id='i'+i, parentId=i===0?null:'i'+rand(i), choice=rand(8); let e;
   if(choice<4) e=msg(id,parentId,['user','assistant','system','toolResult'][choice],'text '+i);
   else if(choice===4) e={type:'compaction',id,parentId,timestamp:t,summary:'s'+i,tokensBefore:i,firstKeptEntryId:'i'+rand(i||1)};
   else if(choice===5) e={type:'context_edit',id,parentId,targetId:'i'+rand(i||1),replacement:rand(2)?null:{content:'edit '+i}};
   else if(choice===6) e={type:'thinking_level_change',id,parentId,thinkingLevel:'high'};
   else e={type:'branch_summary',id,parentId,timestamp:t,summary:'branch',fromId:'i0'};
   entries.push(e);
  }
  for(const leaf of [undefined,entries[rand(entries.length)].id]) assert.deepEqual(rust({op:'project',entries,...(leaf===undefined?{}:{leaf})}).result,oracle(entries,leaf),`run ${run}`);
 }
});
test('root discovery matches Pi for ties, malformed records and timestamps',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'suffice-discovery-')); const saved=process.env.PI_CODING_AGENT_DIR;
 try{
  process.env.PI_CODING_AGENT_DIR=dir; const group=resolve(dir,'sessions','group'); await mkdir(group,{recursive:true});
  const cases=[
   ['a', {type:'session',id:'a',timestamp:'2020-01-02'}, {type:'message',timestamp:t,message:{role:'user',content:'a',timestamp:null}}],
   ['b', {type:'session',id:'b',timestamp:'2020-01-02'}, {type:'message',timestamp:t,message:{role:'user',content:'b'}}],
   ['c', {type:'session',id:'c',timestamp:'2020-01-02'}, {type:'message',timestamp:t,message:{role:'user',content:'c',timestamp:1735787045000}}],
   ['bad', {type:'session',id:'bad',timestamp:t}, {type:'message',message:null}],
   ['empty', {type:'session',id:'empty',timestamp:'2020-01-02'}],
  ];
  const before=new Map(); for(const [name,...rows] of cases){const file=resolve(group,name+'.jsonl');await writeFile(file,['null','bad json',...rows.map(JSON.stringify)].join('\n')+'\n');await utimes(file,new Date('2021-01-01'),new Date('2021-01-01'));before.set(file,await readFile(file));}
  const actual=rust({op:'discover',root:resolve(dir,'sessions')}).result;
  const expected=(await pi.SessionManager.listAll()).map(x=>({path:x.path,id:x.id,cwd:x.cwd,name:x.name??null,parentSessionPath:x.parentSessionPath??null,created:+x.created,modified:+x.modified,messageCount:x.messageCount,firstMessage:x.firstMessage,allMessagesText:x.allMessagesText}));
  assert.deepEqual(actual,expected); for(const [file,bytes] of before) assert.deepEqual(await readFile(file),bytes);
 } finally {if(saved===undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR=saved;await rm(dir,{recursive:true,force:true});}
});

// Compare strings, not deep object equality: insertion order is user-visible in
// desktop tool-call text and serialized by Pi provider adapters on replay.
test('opaque tool arguments preserve Pi serialization through direct projection and edits',()=>{
 const argumentsText='{"z":1,"a":2,"nested":{"y":1,"b":2},"z":3}';
 const call=`{"type":"toolCall","id":"t","name":"tool","arguments":${argumentsText}}`;
 for(const edit of [false,true]){
  const message=`{"type":"message","id":"a","parentId":null,"message":{"role":"assistant","content":[${call}]}}`;
  const entriesText=edit?`[${message},{"type":"context_edit","id":"e","parentId":"a","targetId":"a","replacement":{"content":[${call}]}}]`:`[${message}]`;
  const entries=JSON.parse(entriesText);
  const expected=JSON.stringify(pi.buildSessionProjection(entries).messages[0].content[0].arguments);
  const wire=rustRaw(`{"op":"project","entries":${entriesText}}`);
  const actual=JSON.stringify(JSON.parse(wire).result.messages[0].content[0].arguments);
  assert.equal(actual,expected);
  // These non-index keys must also remain ordered on the wire; JS parsing alone
  // could otherwise conceal a serializer that reordered numeric property keys.
  assert.ok(wire.includes(`"arguments":${expected}`),wire);
 }
});
test('integer-like and duplicate keys match Pi after journal and projection',()=>{
 const entry='{"type":"message","id":"a","parentId":null,"message":{"role":"assistant","content":[{"type":"toolCall","id":"t","name":"tool","arguments":{"z":0,"10":"ten","2":"two","01":"leading","a":1,"z":9,"nested":{"3":3,"1":1,"y":1,"b":2}}}]}}';
 const source=entry+'\n';
 const piEntry=JSON.parse(entry);
 const journalWire=rustRaw(JSON.stringify({op:'journal',source}));
 const journal=JSON.parse(journalWire).result;
 const piArgs=pi.buildSessionProjection([piEntry]).messages[0].content[0].arguments;
 assert.equal(JSON.stringify(journal[0].message.content[0].arguments),JSON.stringify(piArgs));
 assert.ok(journalWire.includes('"arguments":{"2":"two","10":"ten","z":9,"01":"leading","a":1,"nested":{"1":1,"3":3,"y":1,"b":2}}'));
 const projectionWire=rustRaw(`{"op":"project","entries":[${entry}]}`);
 const rustArgs=JSON.parse(projectionWire).result.messages[0].content[0].arguments;
 assert.equal(JSON.stringify(rustArgs),JSON.stringify(piArgs));
 // The raw Rust wire follows JSON.stringify's integer-index enumeration too;
 // duplicate z retains its original non-index insertion slot.
 assert.ok(projectionWire.includes('"arguments":{"2":"two","10":"ten","z":9,"01":"leading","a":1,"nested":{"1":1,"3":3,"y":1,"b":2}}'));
});
test('raw wire uses JavaScript integer-index boundaries',()=>{
 const argumentsText='{"00":"double","4294967295":"not-index","0":"zero","+1":"plus","4294967294":"last-index","-0":"minus"}';
 const entry=`{"type":"message","id":"a","parentId":null,"message":{"role":"assistant","content":[{"type":"toolCall","id":"t","name":"tool","arguments":${argumentsText}}]}}`;
 const expected='{"0":"zero","4294967294":"last-index","00":"double","4294967295":"not-index","+1":"plus","-0":"minus"}';
 const journalWire=rustRaw(JSON.stringify({op:'journal',source:entry+'\n'}));
 const projectionWire=rustRaw(`{"op":"project","entries":[${entry}]}`);
 assert.ok(journalWire.includes('"arguments":'+expected),journalWire);
 assert.ok(projectionWire.includes('"arguments":'+expected),projectionWire);
});

test('confined read preserves raw journal provenance and Pi body projection without writes',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'suffice-confined-wire-'));
 try{
  const group=resolve(directory,'group');await mkdir(group);
  const entries=[{type:'session',id:'metadata',timestamp:t},msg('u',null,'user','question'),msg('a','u','assistant','answer')];
  const file=resolve(group,'saved.jsonl'),source=entries.map(JSON.stringify).join('\r\n')+'\r\n';
  await writeFile(file,source);const before=await readFile(file);
  const discovery=rust({op:'discover_confined',root:directory});assert.equal(discovery.ok,true);assert.deepEqual(discovery.result.skipped,[]);
  assert.equal(discovery.result.sessions.length,1);
  const relativePath=discovery.result.sessions[0].relativePath;
  for(const leaf of [undefined,null,'u']){
   const got=rust({op:'read_session',root:directory,relativePath,...(leaf===undefined?{}:{leaf})});assert.equal(got.ok,true);
   const expected=oracle(entries.slice(1),leaf);expected.entries=expected.entries.map(entry=>({...entry,sourceIndex:entry.sourceIndex+1}));
   assert.deepEqual(got.result.entries,entries);assert.deepEqual(got.result.projection,expected);
   for(const entry of got.result.projection.entries)assert.equal(entries[entry.sourceIndex].type,'message');
  }
  assert.equal(rust({op:'read_session',root:directory,relativePath:'../saved.jsonl'}).ok,false);
  assert.deepEqual(await readFile(file),before);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('confined read rejects middle corruption and keeps crash-tail recovery',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'suffice-confined-tail-'));
 try{
  await mkdir(resolve(directory,'group'));const file=resolve(directory,'group','saved.jsonl');
  const header=JSON.stringify({type:'session',id:'metadata',timestamp:t});
  await writeFile(file,header+'\n'+JSON.stringify(msg('u',null,'user','saved'))+'\n{"partial"');
  assert.equal(rust({op:'read_session',root:directory,relativePath:'group/saved.jsonl'}).result.entries.length,2);
  await writeFile(file,header+'\nBAD\n');
  assert.match(rust({op:'read_session',root:directory,relativePath:'group/saved.jsonl'}).error,/line 2/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
