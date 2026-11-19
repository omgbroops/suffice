import test from 'node:test';
import assert from 'node:assert/strict';
import {createMic} from '../src/overlay-mic.js';

function rig(){
 const log={started:0,stopped:0,tracksStopped:0,audio:0,errors:0};const pending=[];
 class Recorder{constructor(){this.state='inactive';}start(){this.state='recording';log.started++;}stop(){this.state='inactive';log.stopped++;this.ondataavailable?.({data:new Blob(['x'])});this.onstop?.();}}
 const stream={getTracks:()=>[{stop:()=>log.tracksStopped++}]};
 const mic=createMic({getUserMedia:()=>new Promise(r=>{pending.push(()=>r(stream));}),Recorder,onAudio:()=>log.audio++,onError:()=>log.errors++});
 return {mic,log,grant:(i=pending.length-1)=>pending[i]()};
}

test('release before the mic permission resolves never leaves it recording',async()=>{
 const {mic,log,grant}=rig();const p=mic.start();mic.stop();grant();await p;
 assert.equal(log.started,0);assert.equal(log.tracksStopped,1,'stream released');
});
test('hold then release records and sends audio',async()=>{
 const {mic,log,grant}=rig();const p=mic.start();grant();await p;assert.equal(log.started,1);
 mic.stop();await new Promise(r=>setImmediate(r));assert.equal(log.stopped,1);assert.equal(log.audio,1);assert.equal(log.tracksStopped,1);
});
test('release then a new hold: the stale start is dropped, the new one records',async()=>{
 const {mic,log,grant}=rig();const a=mic.start();mic.stop();const b=mic.start();grant(0);await a;grant(1);await b;
 assert.equal(log.started,1);
});
