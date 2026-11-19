import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createReminders,parseReminder} from '../electron/reminders.mjs';
import {createPointTool} from '../../../packages/cli/src/point-tool.mjs';
const require=createRequire(import.meta.url);
const {createDoubleTap}=require('../electron/hotkey.cjs');
const {imageSizeFor,toScreenPoint}=require('../electron/coords.cjs');

// Each row: [name, events as [key,state,t], expected fires]
const rows=[
 ['two quick taps fire',[['option','down',0],['option','up',100],['option','down',200],['option','up',300]],1],
 ['tap then letter then tap does not',[['option','down',0],['option','up',100],['other','down',150],['option','down',200],['option','up',300]],0],
 ['option held while a letter is pressed does not',[['option','down',0],['other','down',50],['option','up',100],['option','down',150],['option','up',250]],0],
 ['slow second tap (gap 500) does not fire',[['option','down',0],['option','up',100],['option','down',600],['option','up',700]],0],
 ['hold (400 ms) then tap does not',[['option','down',0],['option','up',400],['option','down',450],['option','up',550]],0],
 ['tap then hold does not',[['option','down',0],['option','up',100],['option','down',200],['option','up',600]],0],
 ['key repeat while held is ignored',[['option','down',0],['option','down',30],['option','down',60],['option','up',100],['option','down',150],['option','up',230]],1],
 ['three taps fire once, the third starts over',[['option','down',0],['option','up',80],['option','down',150],['option','up',230],['option','down',300],['option','up',380]],1],
 ['gap just under 400 fires',[['option','down',0],['option','up',100],['option','down',499],['option','up',560]],1],
 ['gap of exactly 400 does not',[['option','down',0],['option','up',100],['option','down',500],['option','up',560]],0],
 ['key-up with no down is ignored',[['option','up',10],['option','down',20],['option','up',60]],0],
];
for(const [name,events,want] of rows)test('double tap: '+name,()=>{let fires=0;const d=createDoubleTap({onFire:()=>fires++});for(const e of events)d.feed(...e);assert.equal(fires,want);});

test('image size: 2x Retina is downscaled 2x, long edge capped at 2576',()=>{
 assert.deepEqual(imageSizeFor({width:1440,height:900}),{width:1440,height:900});
 assert.deepEqual(imageSizeFor({width:3440,height:1440}),{width:2576,height:1078});
 const big=imageSizeFor({width:6016,height:3384});assert.equal(Math.max(big.width,big.height),2576);
});
// Deterministic pseudo-random sweep over 1x, 2x and mixed layouts.
test('mapper properties across 1x/2x/mixed displays',()=>{
 let seed=7;const rnd=()=>(seed=(seed*1664525+1013904223)%4294967296)/4294967296;
 const layouts=[[{x:0,y:0,width:1920,height:1080}],[{x:0,y:0,width:1512,height:982}],[{x:0,y:0,width:1512,height:982},{x:1512,y:-300,width:2560,height:1440}],[{x:-1920,y:0,width:1920,height:1080},{x:0,y:0,width:1440,height:900}]];
 for(const layout of layouts)for(const bounds of layout){
  const image=imageSizeFor(bounds),capture={displayId:'1',bounds,image};
  for(let i=0;i<300;i++){
   const p={x:rnd()*image.width,y:rnd()*image.height},s=toScreenPoint(p,capture);
   assert.ok(s.x>=bounds.x&&s.x<=bounds.x+bounds.width&&s.y>=bounds.y&&s.y<=bounds.y+bounds.height,'inside display');
   // round trip back into image space is within one image pixel plus rounding
   const back={x:(s.x-bounds.x)*image.width/bounds.width,y:(s.y-bounds.y)*image.height/bounds.height};
   assert.ok(Math.abs(back.x-p.x)<=image.width/bounds.width+.5&&Math.abs(back.y-p.y)<=image.height/bounds.height+.5);
  }
  assert.deepEqual(toScreenPoint({x:0,y:0},capture),{x:bounds.x,y:bounds.y});
  assert.deepEqual(toScreenPoint({x:image.width,y:image.height},capture),{x:bounds.x+bounds.width,y:bounds.y+bounds.height});
  assert.equal(toScreenPoint({x:image.width+50,y:5},capture),null);
  assert.equal(toScreenPoint({x:-50,y:5},capture),null);
  assert.equal(toScreenPoint({x:NaN,y:5},capture),null);
 }
 // The grounding-scale bug: using native pixels (2x) against a points-sized capture would land at twice the offset.
 const c={displayId:'2',bounds:{x:0,y:0,width:1440,height:900},image:{width:1440,height:900}};
 assert.deepEqual(toScreenPoint({x:720,y:450},c),{x:720,y:450});
});

test('parse reminder',()=>{
 const now=new Date(2026,10,18,10,0,0).getTime();
 assert.equal(parseReminder('what is this',now),null);
 assert.deepEqual(parseReminder('Remind me to call mum in 20 minutes',now),{text:'call mum',dueAt:now+20*60000});
 assert.deepEqual(parseReminder('remind me to stretch in an hour',now),{text:'stretch',dueAt:now+3600000});
 assert.equal(new Date(parseReminder('remind me to submit at 5pm',now).dueAt).getHours(),17);
 assert.equal(new Date(parseReminder('remind me to submit at 9am',now).dueAt).getDate(),19); // already past today
 const tomorrow=new Date(parseReminder('remind me to renew tomorrow',now).dueAt);assert.equal(tomorrow.getDate(),19);assert.equal(tomorrow.getHours(),9);
 assert.equal(parseReminder('remind me to nap',now).dueAt,now+3600000);
 assert.equal(parseReminder('can you remind me what the save button does',now),null);
 assert.equal(parseReminder('why did the build fail, remind me to check it',now),null);
 assert.equal(parseReminder('Please remind me in 10 minutes to stretch',now).text,'stretch');
 assert.equal(parseReminder('remind me in 1 hour to check the build',now).text,'check the build');
 assert.equal(parseReminder('remind me at 5pm to submit',now).text,'submit');
});
test('reminders due while timers were frozen (sleep) fire on start()',()=>{
 const c=clock(),file=join(mkdtempSync(join(tmpdir(),'rem-')),'r.json'),fired=[];
 const r=createReminders({file,...c,notify:x=>fired.push(x.text)});r.add({text:'a',dueAt:c.now()+1000});
 c.timers.length=0;c.advance(5000); // clock moved, the monotonic timer never fired
 assert.deepEqual(fired,[]);r.start();assert.deepEqual(fired,['a']);
});

function clock(){let t=1000;const timers=[];return {now:()=>t,setTimer:(fn,ms)=>{const x={fn,at:t+ms};timers.push(x);return x;},clearTimer:x=>{const i=timers.indexOf(x);if(i>=0)timers.splice(i,1);},advance(ms){t+=ms;for(const x of timers.filter(x=>x.at<=t).sort((a,b)=>a.at-b.at)){timers.splice(timers.indexOf(x),1);x.fn();}},timers};}
test('reminders fire at the due time once, persist, survive restart',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'rem-')),'r.json'),c=clock(),fired=[];let changes=0;
 const r=createReminders({file,...c,notify:x=>fired.push(x.text),onChange:()=>changes++});
 r.start();assert.equal(c.timers.length,0);
 r.add({text:'second',dueAt:c.now()+2000});r.add({text:'first',dueAt:c.now()+1000});
 assert.equal(c.timers.length,1);
 c.advance(999);assert.deepEqual(fired,[]);
 c.advance(1);assert.deepEqual(fired,['first']);
 c.advance(1000);assert.deepEqual(fired,['first','second']);
 c.advance(5000);assert.equal(fired.length,2);
 assert.equal(JSON.parse(readFileSync(file,'utf8')).length,2);
 // restart: an overdue unfired reminder fires on start; a done one never does
 const c2=clock(),f2=[];const r2=createReminders({file,...c2,notify:x=>f2.push(x.text)});assert.equal(r2.list().length,2);
 const late=r2.add({text:'late',dueAt:c2.now()-10});assert.ok(late.id);r2.start();assert.deepEqual(f2,['late']);
 const done=r2.add({text:'done one',dueAt:c2.now()+10});r2.complete(done.id);c2.advance(50);assert.deepEqual(f2,['late']);
 assert.equal(r2.remove(done.id),true);assert.equal(r2.remove('nope'),false);
 assert.throws(()=>r2.add({text:'',dueAt:1}));
});
test('far-future reminder never overflows the timer',()=>{
 const c=clock(),file=join(mkdtempSync(join(tmpdir(),'rem-')),'r.json');let ms;
 const r=createReminders({file,now:c.now,clearTimer:c.clearTimer,setTimer:(fn,m)=>{ms=m;return {};}});
 r.add({text:'x',dueAt:c.now()+90*864e5});assert.ok(ms<=2**31-1);
});

test('point tool validates and echoes pixel coordinates',async()=>{
 const tool=createPointTool();
 const out=await tool.execute('1',{x:10.4,y:20.6,label:'Save button',displayId:'69'});
 assert.deepEqual(out.structuredContent,{x:10,y:21,label:'Save button',displayId:'69'});
 await assert.rejects(tool.execute('1',{x:-3,y:2,label:'a',displayId:'1'}));
 await assert.rejects(tool.execute('1',{x:NaN,y:2,label:'a',displayId:'1'}));
});

test('key source: helper lines feed the detector; no-permission falls back to Option+Space once',async()=>{
 const {EventEmitter}=await import('node:events');const {PassThrough}=await import('node:stream');
 const {createOverlayFlow}=require('../electron/overlay-flow.cjs');
 const opened=[];let isOpen=false;
 const overlay={isOpen:()=>isOpen,close:()=>{isOpen=false;},open:()=>{isOpen=true;opened.push(1);},grab:async()=>({image:null,capture:null}),displayAt:()=>({bounds:{x:0,y:0,width:100,height:100}}),send:async()=>true,setTyping(){}};
 const flow=createOverlayFlow({overlay,status:()=>'denied',cursor:()=>({x:5,y:5}),parseReminder:()=>null});
 const child=new EventEmitter();child.stdout=new PassThrough();child.kill=()=>{};
 const shortcuts=new Map(),globalShortcut={register:(k,f)=>shortcuts.set(k,f),unregister:k=>shortcuts.delete(k)};let falls=0;
 flow.startKeys({spawn:()=>child,command:'x',globalShortcut,onFallback:()=>falls++});
 const line=(key,state,t)=>child.stdout.write(JSON.stringify({key,state,t})+'\n');
 line('option','down',0);line('option','up',80);line('option','down',160);line('option','up',230);
 await new Promise(r=>setTimeout(r,20));assert.equal(opened.length,1,'double tap opens the overlay');
 child.stdout.write('{"status":"no-permission"}\n');child.emit('exit');await new Promise(r=>setTimeout(r,10));
 assert.equal(falls,1);assert.ok(shortcuts.has('Option+Space'));
 flow.startKeys({spawn:()=>{throw new Error('no binary');},command:'x',globalShortcut,onFallback:()=>falls++});assert.equal(falls,2);
});
