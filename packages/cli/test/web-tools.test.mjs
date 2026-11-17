import test from 'node:test';
import assert from 'node:assert/strict';
import {deferredWebExtension} from '../src/web-tools.mjs';
test('web adapter only exposes core research tools, all deferred',()=>{
 const registered=[],active=[];
 const extension=deferredWebExtension(pi=>{
  for(const name of ['web_search','fetch_content','get_search_content','source_check','web_enable'])pi.registerTool({name,exposure:'direct'});
  pi.setActiveTools(['read','codemode','web_search','fetch_content','web_enable']);
  pi.registerCommand('search',{});
 });
 extension({registerTool:tool=>registered.push(tool),setActiveTools:names=>active.push(...names),registerCommand:()=>assert.fail('commands should not be installed')});
 assert.deepEqual(registered.map(tool=>[tool.name,tool.exposure]),[['web_search','deferred'],['fetch_content','deferred'],['get_search_content','deferred']]);
 assert.deepEqual(active,['read','codemode']);
});
