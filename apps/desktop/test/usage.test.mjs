import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionUsage,savedUsage,runCapExceeded,recordSpend} from '../electron/usage.mjs';

test('Pi usage separates cumulative tokens from the current context window',()=>{
  const usage={input:1000,output:200,cacheRead:300,cacheWrite:50,cost:{total:.12}};
  const entry={type:'message',message:{role:'assistant',usage,stopReason:'stop'}};
  const result=savedUsage([entry,entry],{contextWindow:10000});
  assert.equal(result.totalTokens,3100);
  assert.equal(result.windowTokens,1550);
  assert.equal(result.windowPercent,15.5);
  assert.equal(result.cost,.24);
  assert.equal(savedUsage([entry,{type:'compaction'}],{contextWindow:10000}).windowTokens,null);
  assert.equal(savedUsage([],{}).totalTokens,null);
  assert.deepEqual(sessionUsage({getSessionStats:()=>({cost:.24,tokens:{total:3100},contextUsage:{tokens:1550,percent:15.5}})}),result);
});

test('run cap helpers live beside usage: cost over cap reports cap and spend',()=>{
 assert.match(runCapExceeded({cost:0,totalTokens:0},{cost:5.03,totalTokens:1200000},{usd:5,tokens:2000000}),/\$5\.00 cap \(spent \$5\.03, 1\.2M tokens\)/);
});

test('daily budget counts input+output only, never past the room, and names itself when it stops a run',()=>{
  const recorded=[],hold={settle:r=>recorded.push(r.inputTokens)};
  recordSpend({base:{inputTokens:0,outputTokens:0,totalTokens:0},hold},{inputTokens:100,outputTokens:50,totalTokens:5000});
  recordSpend({base:{totalTokens:0},hold,room:1000},{totalTokens:1100});
  assert.deepEqual(recorded,[150,1000]);
  assert.match(runCapExceeded({inputTokens:0,outputTokens:0,totalTokens:0},{inputTokens:90,outputTokens:20,totalTokens:9e6},{usd:5,tokens:100,daily:true}),/daily token budget is used up/);
  assert.equal(runCapExceeded({inputTokens:0,outputTokens:0,totalTokens:0},{inputTokens:50,outputTokens:20,totalTokens:9e6},{usd:5,tokens:100,daily:true}),null);
});
