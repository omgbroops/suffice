import test from 'node:test';
import assert from 'node:assert/strict';
import {extractClaims,claimsFor} from '../src/claim-check.js';

const sh=(id,command,status='ok',exitCode)=>({kind:'tool',id,category:'shell',status,input:{command},output:exitCode==null?{}:{exitCode}});
const ed=(id,file)=>({kind:'tool',id,category:'edit',status:'ok',input:{file_path:file},output:{}});
const say=(id,text)=>({kind:'assistant',id,text});
const user={kind:'user',id:'u',text:'go'};

test('extracts test, build and file claims; skips negations', () => {
 const c=extractClaims('Updated `greet.js`. All tests pass. The build succeeds. Tests did not pass yet.');
 assert.deepEqual(c.map(x=>x.kind+':'+x.label),['file:greet.js','tests:Tests pass','exit:Build succeeds']);
 assert.deepEqual(extractClaims('Tests still fail. I did not edit `a.js`.'),[]);
});

test('verified when a matching command exited 0 and the file was edited', () => {
 const m=claimsFor([user,ed('e','/p/greet.js'),sh('t','node --test'),say('a','Updated `greet.js`. All tests pass.')]).get('a');
 assert.equal(m.state,'verified');assert.deepEqual(m.rows.map(r=>r.ok),[true,true]);
});

test('failed: newest test run exited non-zero, file never edited, other turn ignored', () => {
 const items=[user,sh('old','node --test'),{...user,id:'u2'},sh('t','bun test','error',1),say('a','Fixed `util.js`. Tests pass now.')];
 const m=claimsFor(items).get('a');
 assert.equal(m.state,'failed');
 assert.equal(m.failed.length,2);
 assert.match(m.failed.map(f=>f.reason).join('|'),/no edit or write of util\.js/);
 assert.match(m.failed.map(f=>f.reason).join('|'),/exited 1/);
});

test('no matching command at all is a failure; unrelated command does not back tests', () => {
 const m=claimsFor([user,sh('l','ls'),say('a','All tests pass.')]).get('a');
 assert.equal(m.state,'failed');assert.match(m.failed[0].reason,/no matching command/);
});

test('a still-running test command is checking, not verified', () => {
 assert.equal(claimsFor([user,sh('t','npm test','running'),say('a','Tests pass.')]).get('a').state,'checking');
});

test('product names such as Node.js are not file claims', () => {
 assert.deepEqual(extractClaims('Updated Node.js to v20. Updated `Next.js` too.'),[]);
 assert.deepEqual(extractClaims('Updated `a.js`.').map(x=>x.path),['a.js']);
});

test('rows are ranked: failed first', () => {
 const v=claimsFor([user,ed('e','/p/a.js'),say('a','Updated `a.js`. Updated `b.js`.')]).get('a');
 assert.deepEqual(v.ordered.map(r=>r.label+':'+(r.ok?'ok':'bad')),['b.js:bad','a.js:ok']);
});
