import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionUsage,savedUsage,runCapExceeded} from '../electron/usage.mjs';

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
