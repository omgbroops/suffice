import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const {validate,nextRunAt,createAutomations}=createRequire(import.meta.url)('../electron/automations.cjs');
const dir=mkdtempSync(join(tmpdir(),'auto-test-'));
const base={name:'Nightly',prompt:'run tests',projectPath:dir,schedule:{kind:'daily',at:'09:00'}};
const at=(y,m,d,h,mi=0)=>new Date(y,m-1,d,h,mi).getTime();

test('nextRunAt: hourly, daily, weekdays',()=>{
  assert.equal(nextRunAt({schedule:{kind:'hourly',everyHours:3}},at(2026,11,12,8)),at(2026,11,12,11));
  const daily={schedule:{kind:'daily',at:'09:00'}};
  assert.equal(nextRunAt(daily,at(2026,11,12,8)),at(2026,11,12,9));
  assert.equal(nextRunAt(daily,at(2026,11,12,9)),at(2026,11,13,9),'strictly after the base');
  const wk={schedule:{kind:'weekdays',at:'09:00'}};// 2026-11-13 is a Friday
  assert.equal(nextRunAt(wk,at(2026,11,13,10)),at(2026,11,16,9),'Friday evening -> Monday');
  assert.equal(nextRunAt(wk,at(2026,11,14,8)),at(2026,11,16,9),'Saturday -> Monday');
});

test('validate accepts good input and rejects bad fields',()=>{
  assert.equal(validate(base).effort,'medium');
  const bad=[{...base,name:''},{...base,name:'x'.repeat(81)},{...base,prompt:5},{...base,projectPath:'relative'},{...base,projectPath:join(dir,'missing')},
   {...base,projectPath:join(dir,'..','..','etc','hosts')},{...base,schedule:{kind:'monthly'}},{...base,schedule:{kind:'daily',at:'25:00'}},
   {...base,schedule:{kind:'hourly',everyHours:0}},{...base,schedule:{kind:'hourly',everyHours:1.5}},{...base,effort:'huge'},{...base,model:'m'},null,[]];
  for(const b of bad)assert.throws(()=>validate(b),Error,JSON.stringify(b)?.slice(0,80));
  assert.deepEqual(validate({...base,model:'m',provider:'p'}).model,'m');
});

test('store: busy skips and retries, due run records thread, clock injected',async()=>{
  let t=at(2026,11,12,8),isBusy=true;const ran=[];
  const a=createAutomations({file:join(dir,'a.json'),now:()=>t,busy:()=>isBusy,run:async i=>{ran.push(i.name);return {threadId:'th1'};}});
  const item=a.save(base);assert.equal(item.nextRunAt,at(2026,11,12,9));
  t=at(2026,11,12,9,1);await a.tick();
  assert.equal(a.list()[0].lastStatus,'skipped: busy');assert.equal(ran.length,0);
  isBusy=false;t+=60000;await a.tick();
  const [r]=a.list();assert.equal(r.lastStatus,'ok');assert.equal(r.lastThreadId,'th1');assert.equal(r.nextRunAt,at(2026,11,13,9));
  await a.tick();assert.equal(ran.length,1,'not due again');
  a.toggle(r.id,false);t=at(2026,11,20,9);await a.tick();assert.equal(ran.length,1,'disabled never runs');
  assert.equal(JSON.parse(readFileSync(join(dir,'a.json'),'utf8'))[0].lastThreadId,'th1','persisted');
  const failing=createAutomations({file:join(dir,'b.json'),now:()=>t,run:async()=>{throw new Error('boom');}});
  const f=failing.save(base);assert.equal((await failing.runNow(f.id)).lastError,'boom');
  assert.equal(a.remove(r.id),true);assert.equal(a.list().length,0);
});
