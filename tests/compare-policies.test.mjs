import test from 'node:test';
import assert from 'node:assert/strict';
import {replay,summarize} from '../scripts/compare-policies.mjs';
const run=(arm,task,success,usd,status='completed')=>({arm,task,repetition:0,success,status,knownEstimatedUsd:usd,usageCostUnknown:false});
test('escalation replay charges both attempts and uses the strong result when the gate rejects',()=>{
  const runs=[run('luna-repro','a',true,1),run('sol','a',true,10),run('luna-repro','b',false,1,'verification_failed'),run('sol','b',true,10),run('luna-repro','c',false,1),run('sol','c',true,10)];
  const s=summarize('x',replay(runs));
  assert.deepEqual([s.pass,s.escalated,s.gateFalseAccepts,s.meanUsd],['2/3',1,1,4.3333]);
});
