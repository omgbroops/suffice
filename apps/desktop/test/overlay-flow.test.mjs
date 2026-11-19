// Overlay flow behaviour with fakes: input never wedges, one run at a time, close cancels, double-tap closes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {parseReminder} from '../electron/reminders.mjs';
const {createOverlayFlow}=createRequire(import.meta.url)('../electron/overlay-flow.cjs');

function rig(over={}){
 let isOpen=false;const sent=[],typing=[],runs=[],aborts=[];let release=null;
 const overlay={isOpen:()=>isOpen,close:()=>{isOpen=false;},open:()=>{isOpen=true;},grab:async()=>({image:null,capture:null}),displayAt:()=>({bounds:{x:0,y:0,width:100,height:100}}),send:async c=>{sent.push(c);return isOpen;},setTyping:on=>typing.push(on)};
 const timers=[];const setTimer=(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimer=t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);};
 const flow=createOverlayFlow({overlay,status:()=>'denied',cursor:()=>({x:5,y:5}),parseReminder,addReminder:r=>({...r}),getThread:()=>'t'.repeat(32),setTimer,clearTimer,
  abort:id=>aborts.push(id),run:p=>new Promise((res)=>{runs.push(p);release=res;}),...over});
 return {flow,sent,typing,runs,aborts,timers,finish:()=>release?.({}),isOpen:()=>isOpen};
}
const tap=(flow,t)=>{flow.onKey('option','down',t);flow.onKey('option','up',t+60);};
const open=async r=>{await r.flow.toggle();};

test('a reminder or an over-limit submit hands the input back',async()=>{
 const r=rig();await open(r);
 r.typing.length=0;await r.flow.submit('remind me to stretch');
 assert.equal(r.typing.at(-1),false,'reminder releases typing');
 r.typing.length=0;await r.flow.submit('x'.repeat(20001));
 assert.equal(r.typing.at(-1),false,'over-limit releases typing');
 assert.ok(r.sent.some(c=>c.type==='notice'&&/too long/i.test(c.text)),'over-limit shows a notice');
 assert.equal(r.runs.length,0);
 // Option taps work again: tap opens the input
 r.flow.onKey('option','down',1000);r.flow.onKey('option','up',1060);
 assert.ok(r.sent.some(c=>c.type==='typing'));
});

test('double-tap while open closes the overlay',async()=>{
 const r=rig();await open(r);
 tap(r.flow,0);tap(r.flow,160);
 assert.equal(r.isOpen(),false);
});

test('double-tap while a run is busy closes it and cancels the run',async()=>{
 const r=rig();await open(r);const p=r.flow.submit('what is this');
 await new Promise(x=>setImmediate(x));
 tap(r.flow,0);tap(r.flow,160);
 assert.equal(r.isOpen(),false);assert.deepEqual(r.aborts,['t'.repeat(32)]);
 r.finish();await p;
});

test('closing mid-run cancels; reopening cannot start a second run until it ends',async()=>{
 const r=rig();await open(r);const p=r.flow.submit('first');
 await new Promise(x=>setImmediate(x));
 r.flow.close();assert.equal(r.aborts.length,1);
 await open(r);await r.flow.submit('second');
 assert.equal(r.runs.length,1,'no concurrent run');
 r.finish();await p;
 const third=r.flow.submit('third');await new Promise(x=>setImmediate(x));assert.equal(r.runs.length,2,'allowed after the first ended');
 r.finish();await third;
});

test('a new thread run aborts the thread the harness reports, not the last one',async()=>{
 const r=rig({getThread:()=>null});await open(r);const p=r.flow.submit('q');
 await new Promise(x=>setImmediate(x));
 const client=r.runs[0].clientId;r.flow.onHarnessEvent({event:'thread_started',clientId:client,id:'n'.repeat(32)});
 r.flow.close();assert.deepEqual(r.aborts,['n'.repeat(32)]);r.finish();await p;
});

test('holding Option then closing mid-hold leaves no listening state',async()=>{
 const r=rig();await open(r);
 r.flow.onKey('option','down',0);r.timers[0].fn();r.flow.onKey('option','up',400);
 assert.ok(r.sent.some(c=>c.type==='listening'&&c.on===false));
});

test('swift helper re-enables its event tap after a timeout (source check; the helper is not run in tests)',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../native/option-tap/main.swift',import.meta.url),'utf8');
 const line=src.split('\n').find(l=>l.includes('tapDisabledByTimeout'));
 assert.match(line,/tapEnable\(tap:\s*t,\s*enable:\s*true\)/);
});
