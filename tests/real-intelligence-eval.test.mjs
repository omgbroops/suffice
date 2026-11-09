import {test} from 'node:test';
import assert from 'node:assert/strict';
import {realSchedule,cellId,reserveWave,providerUnavailable,providerFailure,REAL_CONFIG} from '../src/real-intelligence-eval.mjs';
const tasks=['simple','cross-file','complex'].flatMap(category=>Array.from({length:8},(_,i)=>({id:category+i,category})));
test('144 randomized cells form category-balanced waves and independent repeat identities',()=>{
  const waves=realSchedule(tasks),cells=waves.flat();assert.equal(cells.length,144);assert.equal(new Set(cells.map(cellId)).size,144);assert.deepEqual(waves,realSchedule(tasks));assert.notDeepEqual(waves,realSchedule(tasks,123));
  for(const wave of waves)for(const category of ['simple','cross-file','complex'])assert.equal(wave.filter(item=>item.category===category).length,3);
  for(const task of tasks)for(const arm of ['A','B','C'])assert.deepEqual(cells.filter(c=>c.task===task.id&&c.arm===arm).map(c=>c.repetition),[0,1]);
});
test('a whole wave is reserved before dispatch without clearing historical unknown costs',()=>{
  const ledger={cap:12,entries:[{runId:'older-unknown',known:0,reserved:0.75,unknown:true,state:'finished'}]},wave=realSchedule(tasks)[0];
  assert.equal(reserveWave(ledger,wave),true);assert.equal(ledger.entries.length,10);assert.equal(ledger.entries[0].reserved,0.75);assert.equal(ledger.entries[0].unknown,true);assert.ok(ledger.entries.slice(1).every(e=>e.reserved===REAL_CONFIG.maxCost&&e.state==='reserved'));assert.throws(()=>reserveWave(ledger,wave));
  const tight={cap:1,entries:[]};assert.equal(reserveWave(tight,wave),false);assert.deepEqual(tight.entries,[]);
  const unknown={cap:12,entries:[{runId:'luna-xhigh-real-v3/'+wave[0].task+'-'+wave[0].arm+'-r'+wave[0].repetition+'-a0',state:'not_started',unknown:true,known:0,reserved:0.5}]};assert.throws(()=>reserveWave(unknown,wave));assert.equal(unknown.entries[0].reserved,0.5);
});
test('provider interruption is distinct from coding failure and exhausted model budgets',()=>{
  assert.equal(providerUnavailable({status:'agent_error',error:'OpenAI API error (503): subscription_sharing_user_unavailable'}),true);
  assert.equal(providerUnavailable({status:'budget_or_incomplete',error:'Task allowance exhausted'}),false);assert.equal(providerUnavailable({status:'completed',success:false}),false);
  assert.equal(providerFailure({status:'agent_error',error:'OpenAI API error (401): authorization failed'}),true);assert.equal(providerUnavailable({status:'agent_error',error:'OpenAI API error (401): authorization failed'}),false);assert.equal(providerFailure({status:'budget_or_incomplete',error:'OpenAI API error (400): context length exceeded'}),false);
});
