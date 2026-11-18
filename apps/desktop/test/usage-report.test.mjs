import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildUsageReport,readUsageReport} from '../electron/usage-report.mjs';
import {lastDays,money,compact,percent} from '../src/usage-settings.js';

const at=(day,hour=12)=>new Date(2026,10,day,hour).toISOString();
const user=(day,text)=>({type:'message',timestamp:at(day),message:{role:'user',content:[{type:'text',text}]}});
const assistant=(day,usage,model='sol')=>({type:'message',timestamp:at(day,13),message:{role:'assistant',model,content:[],usage}});
const u=(input,output,cacheRead,cacheWrite,total)=>({input,output,cacheRead,cacheWrite,cost:{total}});

test('counters add per thread and per day, with cache-hit as cached share of prompt tokens',()=>{
 const report=buildUsageReport([
  {id:'a',entries:[user(10,'Fix the typo'),assistant(10,u(100,50,300,100,.1)),assistant(11,u(200,10,800,0,.2))]},
  {id:'b',entries:[user(11,'Explain'),assistant(11,u(50,5,0,0,.05))]},
 ]);
 const a=report.threads.find(t=>t.id==='a');
 assert.deepEqual([a.input,a.output,a.cacheRead,a.cacheWrite,a.turns],[300,60,1100,100,2]);
 assert.ok(Math.abs(a.cost-.3)<1e-9);assert.equal(a.tokens,300+1100+100+60);assert.equal(a.cacheHit,1100/1500);assert.equal(a.title,'Fix the typo');
 assert.deepEqual(report.days.map(d=>d.day),['2026-11-10','2026-11-11']);
 const d11=report.days[1];assert.equal(d11.turns,2);assert.equal(d11.input,250);assert.ok(Math.abs(d11.cost-.25)<1e-9);
 assert.equal(report.total.turns,3);assert.ok(Math.abs(report.total.cost-.35)<1e-9);
 assert.deepEqual(report.threads.map(t=>t.id),['a','b']);// most expensive first
});

test('compaction usage counts, missing cost and empty input do not throw or invent numbers',()=>{
 const report=buildUsageReport([{id:'c',entries:[{type:'compaction',timestamp:at(12),usage:u(10,5,0,0,.01)},assistant(12,{input:5,output:1})]},{id:'empty',entries:[user(12,'hello')]}]);
 assert.equal(report.threads.length,1);assert.equal(report.total.input,15);assert.equal(report.total.turns,1);assert.equal(report.total.cost,.01);
 const none=buildUsageReport([]);assert.equal(none.total.cacheHit,null);assert.deepEqual(none.days,[]);
});

test('readUsageReport reads saved session files from the sessions directory',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-usage-report-'));await mkdir(resolve(home,'sessions/proj'),{recursive:true});
 const lines=[{type:'session',id:'x',timestamp:at(10),cwd:'/p'},user(10,'Hello'),assistant(10,u(10,2,30,0,.02))].map(e=>JSON.stringify(e)).join('\n');
 await writeFile(resolve(home,'sessions/proj/one.jsonl'),lines+'\n');
 const report=await readUsageReport(home);assert.equal(report.threads.length,1);assert.equal(report.threads[0].cacheHit,.75);assert.match(report.threads[0].id,/^[a-f0-9]{32}$/);
 assert.equal((await readUsageReport(resolve(home,'missing'))).total.turns,0);
});

test('page helpers: zero-filled day window and number formats',()=>{
 const days=lastDays([{day:'2026-11-17',cost:1,tokens:5,turns:1,cacheHit:.5}],3,new Date(2026,10,18,9));
 assert.deepEqual(days.map(d=>d.day),['2026-11-16','2026-11-17','2026-11-18']);assert.equal(days[0].cost,0);assert.equal(days[1].cost,1);
 assert.deepEqual([money(0),money(.0347),money(.0042),money(.00004),money(12.345)],['$0.00','$0.035','$0.0042','$0.0000','$12.35']);
 assert.deepEqual([compact(999),compact(1500),compact(2_400_000),percent(null),percent(.846)],['999','1.5K','2.4M','n/a','85%']);
});
