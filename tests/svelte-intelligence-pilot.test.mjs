import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gradeSvelte,production,derived} from '../src/svelte-intelligence-pilot.mjs';
function observation({passes=['target','regression'],failures=['legacy'],pending=['existing skip']}={}){
  const entries=ns=>ns.map(fullTitle=>({fullTitle}));return {status:'reported',exitCode:failures.length,report:{stats:{tests:passes.length+failures.length+pending.length,passes:passes.length,failures:failures.length,pending:pending.length},tests:entries([...passes,...failures,...pending]),passes:entries(passes),failures:entries(failures),pending:entries(pending)}};
}
const known={knownFailures:['legacy'],knownPending:['existing skip']};
test('legacy failures and skips never stand in for passing scored criteria',()=>{
  assert.equal(gradeSvelte(observation(),['target','regression'],known).status,'passed');
  assert.equal(gradeSvelte(observation(),['legacy'],known).status,'failed');
  assert.equal(gradeSvelte(observation(),['existing skip'],known).status,'failed');
  assert.equal(gradeSvelte(observation(),['absent'],known).status,'invalid_result');
  assert.equal(gradeSvelte(observation({failures:['legacy','new failure']}),['target'],known).status,'failed');
  assert.equal(gradeSvelte(observation({pending:['existing skip','new skip']}),['target'],known).status,'failed');
  assert.equal(gradeSvelte({...observation(),exitCode:0},['target'],known).status,'invalid_result');
});
test('target misses remain separate from required regression endpoint',()=>{
  const observed=observation({passes:['regression'],failures:['target','legacy']});
  assert.equal(gradeSvelte(observed,['target'],known).status,'failed');
  assert.equal(gradeSvelte(observed,['regression'],{...known,otherEndpointTests:['target']}).status,'passed');
  assert.equal(gradeSvelte(observed,['target'],{...known,otherEndpointTests:['target']}).status,'failed');
});
test('independent reconstruction copies production rather than test code or build outputs',()=>{
  assert.equal(production('src/css/Stylesheet.ts'),true);assert.equal(production('src/parser/__test__.js'),false);assert.equal(production('test/css/index.js'),false);assert.equal(production('compiler/svelte.js'),false);assert.equal(derived('compiler/svelte.js'),true);
});
test('duplicate titles require every case to pass and preserve frozen multiplicities',()=>{
  const expectedTitleCounts={'existing skip':1,legacy:1,regression:1,target:2};
  const options={...known,expectedTitleCounts};
  assert.equal(gradeSvelte(observation({passes:['target','target','regression']}),['target'],options).status,'passed');
  assert.equal(gradeSvelte(observation({passes:['target','regression'],failures:['legacy','target']}),['target'],options).status,'failed');
  assert.equal(gradeSvelte(observation(),['target'],options).status,'invalid_result');
});
