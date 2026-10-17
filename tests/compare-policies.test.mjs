import test from 'node:test';
import assert from 'node:assert/strict';
import {replay,summarize,gateModel} from '../scripts/compare-policies.mjs';
const run=(arm,task,success,usd,status='completed')=>({arm,task,repetition:0,success,status,knownEstimatedUsd:usd,usageCostUnknown:false});
test('escalation replay charges both attempts and uses the strong result when the gate rejects',()=>{
  const runs=[run('luna-repro','a',true,1),run('sol','a',true,10),run('luna-repro','b',false,1,'verification_failed'),run('sol','b',true,10),run('luna-repro','c',false,1),run('sol','c',true,10)];
  const s=summarize('x',replay(runs));
  assert.deepEqual([s.pass,s.escalated,s.gateFalseAccepts,s.meanUsdKnownFloor],['2/3',1,1,4.3333]);
});
test('gateModel: perfect gate on a never-correct cheap model always escalates; perfect gate on always-correct never does',()=>{
  assert.deepEqual(gateModel({p:0,alpha:0,beta:0,g:0.01,c:0.005,s:0.05}),{usd:0.065,pass:1,escalated:1,breakEvenG:-0.005});
  assert.equal(gateModel({p:1,alpha:0,beta:0,g:0.01,c:0.005,s:0.05}).escalated,0);
  const m=gateModel({p:1/3,alpha:0.19,beta:0.17,g:0.01,c:0.0048,s:0.0549});assert.ok(m.pass<1&&m.usd<0.0549);
});
