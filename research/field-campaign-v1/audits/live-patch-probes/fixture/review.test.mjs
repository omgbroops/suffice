// Post-hoc exploratory review probes. Not campaign graders or score changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {setImmediate as immediate} from 'node:timers/promises';
import {createRequire} from 'node:module';
import wait from './wait-patched.mjs';
import baselineDebounce from './debounce-baseline.mjs';
import patchedDebounce from './debounce-patched.mjs';
const {Promise:P}=createRequire(import.meta.url)('./workerpool-Promise.cjs');
test('l01 callbacks can reenter without resettling source or losing new subscribers',()=>{
 const d=P.defer();const seen=[];
 d.promise.then(value=>{seen.push(value);d.reject(new Error('ignored'));d.promise.then(value=>seen.push(value));d.resolve('ignored')});
 d.resolve(7);assert.deepEqual(seen,[7,7]);assert.equal(d.promise.resolved,true);assert.equal(d.promise.rejected,false);
});
test('l01 finally propagates rejected asynchronous cleanup',async()=>{
 const d=P.defer();const reason=new Error('cleanup');
 const out=globalThis.Promise.resolve(d.promise.finally(()=>globalThis.Promise.reject(reason)));
 d.resolve(7);await assert.rejects(out,error=>error===reason);
});
test('l02 helper removes abort listener on success and synchronous condition error',async()=>{
 for(const throws of [false,true]){
  const controller=new AbortController();const reason=new Error('condition');
  const p=wait(()=>{if(throws)throw reason;return true},{signal:controller.signal});
  if(throws)await assert.rejects(p,error=>error===reason);else await p;
  assert.equal(getEventListeners(controller.signal,'abort').length,0);
 }
});
for(const [label,debounce] of [['baseline',baselineDebounce],['patched',patchedDebounce]]){
 test(`l03 ${label}: completing old leading work must preserve abort for the new window`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const controller=new AbortController();const reason=new Error('cancel newer window');const finishes=[];
  const fn=debounce(()=>new Promise(resolve=>finishes.push(resolve)),10,{before:true,signal:controller.signal});
  const first=fn();const firstSuppressed=fn();
  t.mock.timers.tick(10);await immediate();
  const second=fn();let outcome='pending';
  const secondSuppressed=fn().then(()=>{outcome='fulfilled'},error=>{outcome=error===reason?'rejected':'wrong rejection'});
  const listenersBefore=getEventListeners(controller.signal,'abort').length;
  finishes[0](1);await first;await firstSuppressed;await immediate();
  const listenersAfter=getEventListeners(controller.signal,'abort').length;
  controller.abort(reason);await immediate();const observed=outcome;
  t.mock.timers.tick(10);finishes[1](2);await second;await secondSuppressed;
  t.diagnostic(JSON.stringify({listenersBefore,listenersAfter,observed}));
  assert.equal(observed,'rejected','new suppressed caller must reject at abort before its timer fires');
 });
}
