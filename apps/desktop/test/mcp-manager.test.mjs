import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {parseSnippet,splitCommand} from '../electron/mcp-snippet.mjs';
import {checkServer} from '../electron/mcp-health.mjs';
import {createResourceService} from '../electron/resources.mjs';
import {mcpConfig} from '../../../packages/cli/src/mcp-config.mjs';
import {mcpScope,threadKey} from '../../../packages/cli/src/mcp-scope.mjs';
const fake=resolve(import.meta.dirname,'mcp-fake-server.mjs');

test('snippets: wrapped JSON, bare server, bare map, command and URL all become mcpServers',()=>{
 assert.deepEqual(parseSnippet('{"mcpServers":{"a":{"command":"x"}}}'),{mcpServers:{a:{command:'x'}}});
 assert.deepEqual(parseSnippet('{"command":"npx","args":["-y","@acme/server-docs"]}').mcpServers,{'server-docs':{command:'npx',args:['-y','@acme/server-docs']}});
 assert.deepEqual(parseSnippet('{"b":{"url":"https://x.test/mcp"}}').mcpServers,{b:{url:'https://x.test/mcp'}});
 assert.deepEqual(parseSnippet('npx -y @acme/server-docs "/my dir"').mcpServers['server-docs'].args,['-y','@acme/server-docs','/my dir']);
 assert.deepEqual(parseSnippet('https://mcp.example.com/sse',).mcpServers,{example:{url:'https://mcp.example.com/sse'}});
 assert.deepEqual(parseSnippet('uvx tool','mine').mcpServers,{mine:{command:'uvx',args:['tool']}});
 assert.throws(()=>parseSnippet('{bad'),/valid JSON/);assert.throws(()=>parseSnippet('  '),/Paste/);assert.throws(()=>splitCommand('a "b'),/quote/);
});

test('health check spawns the server, lists its tools and prices their schemas; failures say why',async()=>{
 const ok=await checkServer({command:process.execPath,args:[fake]});
 assert.equal(ok.ok,true);assert.deepEqual(ok.tools,['search_docs','read_page']);assert.ok(ok.tokens>20);
 const missing=await checkServer({command:'definitely-not-a-command-xyz'});
 assert.equal(missing.ok,false);assert.match(missing.error,/Command not found/);
 const silent=await checkServer({command:process.execPath,args:['-e','setTimeout(()=>{},60000)']},{timeout:400});
 assert.equal(silent.ok,false);assert.equal(silent.error,'Timed out');
});

test('scope layers thread over project over everywhere, and the engine config honours them',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-mcp-scope-')),service=createResourceService(home),project=resolve(home,'proj'),session=resolve(home,'sessions','a.jsonl'),thread=threadKey(session);
 await service.action({action:'mcp-install',text:JSON.stringify({mcpServers:{docs:{command:process.execPath,args:[fake]},wiki:{url:'https://wiki.test/mcp'}}})});
 const state=async level=>service.action({action:'mcp-state',level,project,thread});
 const on=(s,id)=>[...s.toolkits,...s.servers].find(x=>x.id===id).enabled;
 assert.equal(on(await state('thread'),'docs'),true);
 await service.action({action:'mcp-scope',level:'project',id:project,key:'docs',enabled:false});
 assert.equal(on(await state('project'),'docs'),false);assert.equal(on(await state('global'),'docs'),true);
 await service.action({action:'mcp-scope',level:'thread',id:thread,key:'docs',enabled:true});
 assert.equal(on(await state('thread'),'docs'),true);assert.equal(on(await state('project'),'docs'),false);
 assert.deepEqual(mcpConfig(home,project,false,null).servers.map(s=>s.name),['wiki']);
 assert.deepEqual(mcpConfig(home,project,false,session).servers.map(s=>s.name),['docs','wiki']);
 await service.action({action:'mcp-scope',level:'thread',id:thread,key:'docs',enabled:null});
 assert.equal(on(await state('thread'),'docs'),false);
 await service.action({action:'mcp-scope',level:'global',key:'toolkit:shell',enabled:false});
 assert.equal(mcpScope(home,project,session).tool('bash'),false);assert.equal(mcpScope(home,project,session).tool('read'),true);assert.equal(mcpScope(home,project,session).toolkit('web'),true);
 const shell=(await state('global')).toolkits.find(t=>t.id==='shell');assert.equal(shell.enabled,false);
 const files=(await state('global')).toolkits.find(t=>t.id==='files');assert.ok(files.tokens>50,'built-in schemas are priced');
 await assert.rejects(service.action({action:'mcp-scope',level:'project',key:'docs',enabled:true}),/Select a project/);
 await assert.rejects(service.action({action:'mcp-scope',level:'global',key:'toolkit:nope',enabled:true}),/Unknown tool/);
 await assert.rejects(service.action({action:'mcp-install',text:'{"mcpServers":{"docs":{"command":"x"}}}'}),/Already installed/);
 await service.action({action:'mcp-health',name:'docs'});
 const checked=(await state('global')).servers.find(s=>s.id==='docs').health;assert.equal(checked.ok,true);assert.equal(checked.tools.length,2);
 service.dispose();
});
