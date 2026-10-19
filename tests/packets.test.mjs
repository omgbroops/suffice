import {test} from 'node:test';import assert from 'node:assert/strict';
import {initialRoute,parsePlan,POLICY} from '../src/packets/policy.mjs';
import {executeTask} from '../src/packets/executor.mjs';
test('routing is deterministic and does not decompose ordinary tasks',()=>{
 assert.equal(initialRoute('baseline','Fix typo').model,POLICY.sol);
 assert.equal(initialRoute('routing','Fix typo').model,POLICY.luna);
 assert.equal(initialRoute('packets','Fix asynchronous stream error and preserve default compatibility').complexity.complex,true);
});
test('packet plan is bounded and rejects traversal and duplicate identifiers',()=>{
 const valid={invariants:['preserve defaults'],packets:[{id:'repair',goal:'repair the public contract',files:['src/a.js']}]};
 assert.equal(parsePlan(JSON.stringify(valid)).packets.length,1);
 assert.throws(()=>parsePlan(JSON.stringify({...valid,packets:Array(3).fill(valid.packets[0])})),/one or two/);
 assert.throws(()=>parsePlan(JSON.stringify({...valid,packets:[{...valid.packets[0],files:['../private/grader.js']}]})),/Unsafe/);
 assert.throws(()=>parsePlan(JSON.stringify({...valid,packets:[valid.packets[0],valid.packets[0]]})),/identifier/);
});
test('experimental execution requires explicit activation',async()=>{
 await assert.rejects(executeTask({mode:'packets'}),/feature flag/);
 await assert.rejects(executeTask({mode:'routing'}),/feature flag/);
});
