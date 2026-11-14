import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudProvider,chips,clock,previewHtml} from '../src/cloud-data.js';

test('timeline is newest first and chips read code, rows and memory',()=>{
 const line=cloudProvider('t1').timeline();
 assert.equal(line.length,5);
 assert.deepEqual(line.map(e=>e.created),[...line.map(e=>e.created)].sort((a,b)=>b-a));
 const saved=line.find(e=>e.label==='Saved before the edit');
 assert.equal(chips(saved),'code 41a9c2 · db 3,212 rows · memory 412 MB');
 assert.match(clock(saved.created),/^\d\d:\d\d$/);
});

test('runs hold the failing checkout step and a rewind target that exists',()=>{
 const p=cloudProvider('t2'),failed=p.runs().find(r=>!r.passed);
 assert.equal(failed.failing_step.index,3);
 assert.ok(failed.steps.length>failed.failing_step.index);
 assert.ok(p.timeline().some(e=>e.id===failed.rewind_to));
 assert.ok(p.runs().some(r=>r.passed&&r.steps.every(s=>s.ok)));
 assert.match(p.agentPrompt(failed),/step 4/);
});

test('rewind adds an entry and threads do not share state',()=>{
 const a=cloudProvider('a'),b=cloudProvider('b'),before=a.timeline().length;
 a.rewind('cp_03','inplace');
 assert.equal(a.timeline().length,before+1);assert.match(a.timeline()[0].label,/^Rewound to \d\d:\d\d$/);
 assert.equal(b.timeline().length,before);
 assert.throws(()=>a.rewind('nope','inplace'));
});

test('activity rows point at a tab and go live returns an address; the fake never uses the network',()=>{
 const p=cloudProvider('c');
 assert.deepEqual(p.activity().map(r=>r.tab),['preview','tests','timeline','tests']);
 assert.equal(p.activity().find(r=>r.status==='error').text,'Checkout test failed at step 4');
 const live=p.goLive();assert.match(live.url,/^https:\/\//);assert.ok(live.address);
 assert.ok(previewHtml.includes('<'));
});
