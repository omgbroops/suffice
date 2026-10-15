import test from 'node:test';import assert from 'node:assert/strict';
import {accountStock,stockArgs} from '../src/external-pi.mjs';
const usage={input:10,cacheRead:20,cacheWrite:0,output:3,totalTokens:33,cost:{input:.01,cacheRead:.002,output:.03,total:.042}};
const assistant=(turn,stopReason='stop')=>({type:'assistant',turn,usage,stopReason});
test('all finalized failed and retried replies remain in cost accounting',()=>{const es=[{type:'provider_request'},assistant(1,'error'),{type:'provider_request'},assistant(2)];const a=accountStock(es,{exitCode:0});assert.equal(a.assistantEvents,2);assert.equal(a.usage.estimatedApiUsd,.084);assert.equal(a.unknown,true);});
test('background or unmatched provider requests cannot appear free',()=>{const a=accountStock([{type:'provider_request'},{type:'provider_request'},assistant(1)],{exitCode:0});assert.equal(a.auxiliaryOrMissing,1);assert.equal(a.unknown,true);});
test('missing request observer receipts leave total coverage unknown',()=>{assert.equal(accountStock([assistant(1)],{exitCode:0}).unknown,true);});
test('a complete successful stream has a known total and does not double-count raw SSE',()=>{const a=accountStock([{type:'provider_request'},{type:'provider_usage',usage:{input_tokens:30,output_tokens:3}},assistant(1)],{exitCode:0});assert.equal(a.unknown,false);assert.equal(a.usage.estimatedApiUsd,.042);});
test('native CLI invocation does not restrict tools, replace prompts or disable built-in extensions',()=>{const args=stockArgs({});for(const bad of ['--tools','--no-tools','--no-builtin-tools','--system-prompt','--no-extensions','--no-mcp'])assert.ok(!args.includes(bad));assert.ok(args.includes('json'));});
