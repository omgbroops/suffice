import test from 'node:test';
import assert from 'node:assert/strict';
import {reduce,step,initial,toLogEvent,liveStreak,verbFor,statFor,ACHIEVEMENTS,dayKey,xpForLevel,levelFor,runCtx,isTestCommand} from '../shared/progress-store.mjs';
import {parsePlan} from '../src/live-plan.js';
const D=n=>new Date(2026,10,n,12).getTime();
const fixture=[{tool:'Bash',tokens:0,outcome:'ok',ts:D(1)},{tool:'',tokens:12000,outcome:'tokens',ts:D(1)},{tool:'Bash',tokens:0,outcome:'pass',ts:D(1)},{tool:'Edit',tokens:0,outcome:'ok',ts:D(2)},{tool:'',tokens:0,outcome:'finish',ts:D(2)},{tool:'',tokens:0,outcome:'rewind',ts:D(3)},{tool:'',tokens:3000,outcome:'tokens',ts:D(3)}];
test('XP is monotonic and replay is deterministic',()=>{let s=initial(),last=0;for(const e of fixture){s=step(s,e).state;assert.ok(s.xp>=last);last=s.xp;}
 assert.deepEqual(reduce(fixture),reduce(structuredClone(fixture)));assert.equal(reduce(fixture).xp,Math.floor(15000/500)+20+10);});
test('idle and failed tools add zero XP',()=>{const s=reduce([{tool:'Read',tokens:0,outcome:'ok',ts:D(1)},{tool:'Bash',tokens:0,outcome:'fail',ts:D(1)},{tool:'',tokens:0,outcome:'idle',ts:D(2)}]);assert.equal(s.xp,0);assert.equal(s.days.length,0);assert.equal(s.streak,0);});
test('achievements fire once, with the unlocking timestamp',()=>{let s=initial(),count={};for(const e of [...fixture,...fixture]){const r=step(s,e);s=r.state;r.unlocked.forEach(a=>count[a.id]=(count[a.id]||0)+1);}
 assert.ok(Object.values(count).every(v=>v===1));assert.equal(ACHIEVEMENTS.length,14);assert.equal(s.achievements['first-pass'],D(1));assert.equal(s.achievements['streak-3'],D(3));});
test('streak uses local dates and lapses after a missed day',()=>{const s=reduce(fixture);assert.equal(s.streak,3);assert.equal(liveStreak(s,D(4)),3);assert.equal(liveStreak(s,D(5)),0);assert.equal(dayKey(new Date(2026,10,1,23,59).getTime()),'2026-11-01');});
test('levels and stat table',()=>{assert.equal(levelFor(xpForLevel(5)),5);assert.equal(levelFor(xpForLevel(5)-1),4);
 assert.equal(statFor('Bash','ok'),'debugging');assert.equal(statFor('Edit','ok'),'patience');assert.equal(statFor('Write','ok'),'wisdom');assert.equal(statFor('Bash','pass'),'rigor');
 assert.equal(verbFor('Bash',{command:'node --test x'}),'Testing');assert.equal(verbFor('Edit',{}),'Patching');assert.equal(verbFor('Read',{}),'Reading');});
test('worker events map to log events',()=>{const c={};assert.equal(toLogEvent({event:'tool_start',id:'1',name:'Bash',input:{command:'bun test'}},c),null);
 assert.equal(toLogEvent({event:'tool_end',id:'1'},c,5).outcome,'pass');toLogEvent({event:'tool_start',id:'2',name:'Bash',input:{command:'bun test'}},c);assert.equal(toLogEvent({event:'tool_end',id:'2',isError:true},c,5).outcome,'fail');
 assert.equal(toLogEvent({event:'usage',usage:{totalTokens:900}},c,1).tokens,900);assert.equal(toLogEvent({event:'usage',usage:{totalTokens:900}},c,1),null);assert.equal(toLogEvent({event:'usage',usage:{totalTokens:1000}},c,1).tokens,100);
});
test('plan checklist state from canned todo updates',()=>{const todo=(...s)=>({todos:s.map((status,i)=>({content:'t'+i,status}))});
 const st=i=>parsePlan('TodoWrite',i).map(x=>x.state);assert.deepEqual(st(todo('in_progress','pending')),['active','todo']);assert.deepEqual(st(todo('completed','in_progress')),['done','active']);assert.deepEqual(st(todo('completed','completed')),['done','done']);});

test('session-cumulative usage across runs in one thread is not double counted',()=>{
 const use=(ctx,total)=>toLogEvent({event:'usage',usage:{totalTokens:total}},ctx,D(1));
 const a=runCtx('thread-x'),b=runCtx('thread-x'),other=runCtx('thread-y');
 let s=initial();for(const e of [use(a,150000),use(b,160000),use(other,5000)])s=step(s,e).state;
 assert.equal(s.tokens,165000);
});
test('only real test runners count as a test run',()=>{
 for(const c of ['ls test','cat tests/a.txt','grep -r "test" src','echo test','git log --grep=test'])assert.equal(isTestCommand({command:c}),false,c);
 for(const c of ['node --test','node --test tests/*.test.mjs','npm test','npm run test -- -u','cargo test -p x','cd a && bun test','FOO=1 pytest -q','npx vitest run','go test ./...','python3 -m pytest'])assert.equal(isTestCommand({command:c}),true,c);
 assert.equal(verbFor('Bash',{command:'ls test'}),'Running');
});
