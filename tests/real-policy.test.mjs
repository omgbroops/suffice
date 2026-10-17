import test from 'node:test';
import assert from 'node:assert/strict';
import {compactReadOutputs,validateCases,parseReview,aggregatePhases,caseTestSource,phaseCompletion,reviewEligible} from '../src/real-policy.mjs';
test('pruning preserves task instructions, edits, tests and recent evidence',()=>{
  const messages=[{role:'user',content:'contract'},
    {role:'assistant',content:[]},{role:'toolResult',toolName:'file_read',content:[{type:'text',text:'x'.repeat(20000)}]},
    {role:'assistant',content:[]},{role:'toolResult',toolName:'file_edit',content:[{type:'text',text:'edit proof'.repeat(300)}]},
    {role:'assistant',content:[]},{role:'toolResult',toolName:'test',content:[{type:'text',text:'test proof'.repeat(300)}]},
    {role:'assistant',content:[]},{role:'toolResult',toolName:'file_read',content:[{type:'text',text:'recent'.repeat(1000)}]}];
  const before=JSON.stringify(messages),result=compactReadOutputs(messages);
  assert.ok(result.removedCharacters>15000);assert.equal(result.references.length,1);
  for(const i of [0,4,6,8])assert.deepEqual(result.messages[i],messages[i]);
  assert.equal(JSON.stringify(messages),before);assert.match(result.messages[2].content[0].text,/index=2/);
});
test('unknown mixed codemode outputs are never discarded',()=>{
  const messages=[{role:'assistant',content:[]},{role:'toolResult',toolName:'codemode',content:[{type:'text',text:'x'.repeat(20000)}]},...Array.from({length:4},()=>({role:'assistant',content:[]}))];
  assert.equal(compactReadOutputs(messages).removedCharacters,0);
});
test('review requires inspected patch and consistent structured verdict',()=>{
  assert.equal(parseReview('{"verdict":"approve","findings":[]}').valid,false);
  assert.equal(parseReview('{"verdict":"approve","findings":[]}',{patchReads:1}).valid,true);
  assert.equal(parseReview('{"verdict":"approve","findings":["bug"]}',{patchReads:1}).valid,false);
  assert.equal(parseReview('{"verdict":"repair","findings":[]}',{patchReads:1}).valid,false);
});
test('declarative reproductions cannot request arbitrary functions or code',()=>{
  assert.throws(()=>validateCases([{method:'constructor',args:[],expected:1}]));
  assert.throws(()=>validateCases([{method:'inc',args:[],expected:1,code:'anything'}]));
  const cases=[{method:'valid',args:['\"; process.exit(0); //'],expected:null}];
  assert.deepEqual(validateCases(cases),cases);assert.ok(caseTestSource(cases).includes(JSON.stringify(cases)));
});
test('review and repair costs count and unknown telemetry stays unknown',()=>{
  const result=aggregatePhases([{turns:2,latencyMs:20,usage:{estimatedApiUsd:1,totalTokens:10}},{turns:1,latencyMs:10,usage:{estimatedApiUsd:2,totalTokens:20},usageCostUnknown:true}]);
  assert.equal(result.totalEstimatedUsd,null);assert.equal(result.knownEstimatedUsd,3);assert.equal(result.usage.totalTokens,30);assert.equal(result.turns,3);
});
test('review can rescue exhausted workers but cannot hide provider or repair failures',()=>{
  assert.equal(reviewEligible('turn_limit'),true);assert.equal(reviewEligible('provider_error'),false);
  const arm={review:true},review={valid:true,verdict:'repair'};
  assert.equal(phaseCompletion([{status:'turn_limit'},{status:'completed'},{status:'completed'}],arm,review),'completed');
  assert.equal(phaseCompletion([{status:'completed'},{status:'completed'}],arm,review),'repair_missing');
  assert.equal(phaseCompletion([{status:'completed'},{status:'completed'},{status:'timeout'}],arm,review),'timeout');
  assert.equal(phaseCompletion([{status:'provider_error'}],arm,review),'provider_error');
  assert.equal(phaseCompletion([{status:'completed',reproduction:{before:'failed',after:'failed'}}],{repro:true}),'verification_failed');
});
