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

test('concurrent runs each hold an estimate, not the whole day, and a refusal says why',async()=>{
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const {dailyBudget,reserveRoom,RUN_ESTIMATE,budgetFullMessage}=await import('../electron/usage.mjs');
  const home=await mkdtemp(join(tmpdir(),'usage-'));
  const settings={'budget-daily-tokens':String(RUN_ESTIMATE*3)};
  const caps={tokens:2e6},open=()=>dailyBudget(home,settings);
  const a=reserveRoom(open(),caps),b=reserveRoom(open(),caps),c=reserveRoom(open(),caps),d=reserveRoom(open(),caps);
  assert.ok(a.hold&&b.hold&&c.hold,'three runs start while the day has room');
  assert.equal(d.full,true);assert.equal(d.reserved,true);
  assert.match(budgetFullMessage(d),/running turns hold/);
  assert.doesNotMatch(budgetFullMessage(d),/used up/);
  a.hold.settle({inputTokens:RUN_ESTIMATE,outputTokens:0});b.hold.release();c.hold.release();
  assert.match(budgetFullMessage({full:true}),/used up/);
  await rm(home,{recursive:true});
});

test('a run is bounded by its hold: three runs of 120000 on a 300000 day never pass the ceiling and none takes the day',async()=>{
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const {dailyBudget,reserveRoom,topUp,recordSpend}=await import('../electron/usage.mjs');
  const home=await mkdtemp(join(tmpdir(),'usage-'));
  const settings={'budget-daily-tokens':'300000'},open=()=>dailyBudget(home,settings);
  const runs=[0,1,2].map(()=>{const got=reserveRoom(open(),{tokens:2e6});return {state:{base:{inputTokens:0,outputTokens:0},hold:got.hold,room:got.room,budget:got.budget},spent:0,stopped:null};});
  assert.ok(runs.every(r=>r.state.hold),'all three start');
  for(let step=0;step<20;step++)for(const r of runs){ // runs spend in interleaved 10000 steps
    if(r.stopped||r.spent>=120000)continue;
    r.spent+=10000;r.stopped=topUp(r.state,{inputTokens:r.spent,outputTokens:0});
    if(r.stopped)r.spent-=10000;
  }
  const settled=runs.map(r=>{recordSpend(r.state,{inputTokens:r.spent,outputTokens:0});return r.spent;});
  const day=open().status()[0];
  assert.equal(day.used,settled.reduce((a,b)=>a+b,0));assert.ok(day.used<=300000);assert.equal(day.held,0);
  assert.ok(runs.filter(r=>r.stopped).every(r=>/Wait|Stopped/.test(r.stopped)));
  assert.ok(Math.max(...settled)<300000,'no single run took the whole day');
  await rm(home,{recursive:true});
});
