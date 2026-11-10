import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pairedTaskDifferences} from '../src/intelligence-v4-analysis.mjs';
const row=(arm,repetition,accepted)=>({task:'case',arm,repetition,accepted,scorable:true,resourcePolicyPhase:'phase'});

test('opposite repetition outcomes remain visible under a zero task-mean difference',()=>{
  const result=pairedTaskDifferences([row('A',0,true),row('B',0,false),row('A',1,false),row('B',1,true)],[{id:'case'}],'B','A')[0];
  assert.equal(result.delta,0);assert.equal(result.discordantRepetitions,2);
  assert.deepEqual(result.pairs.map(pair=>pair.difference),[-1,1]);
});

test('paired accuracy refuses missing, duplicate or unverified outcomes instead of counting failures',()=>{
  const rows=[row('A',0,true),row('B',0,true),row('A',1,false),row('B',1,true)];
  assert.equal(pairedTaskDifferences(rows,[{id:'case'}],'B','A')[0].delta,0.5);
  assert.throws(()=>pairedTaskDifferences(rows.slice(1),[{id:'case'}],'B','A'));
  assert.throws(()=>pairedTaskDifferences([...rows,rows[0]],[{id:'case'}],'B','A'));
  assert.throws(()=>pairedTaskDifferences(rows.map((r,i)=>i? r:{...r,accepted:null}),[{id:'case'}],'B','A'));
  assert.throws(()=>pairedTaskDifferences(rows.map((r,i)=>i? r:{...r,scorable:false}),[{id:'case'}],'B','A'));
});
