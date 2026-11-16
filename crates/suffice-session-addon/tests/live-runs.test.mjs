import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createJsRunRegistry} from '../../../apps/desktop/electron/run-registry.mjs';

const require=createRequire(import.meta.url);
const binding=require(join(import.meta.dirname,'../../../apps/desktop-bridge/native',`suffice-session-${process.platform}-${process.arch}.node`));
const {LiveRunRegistry}=binding;

test('typed protocol v1 exposes synchronous reservations and rejects invalid numeric handles',()=>{
 assert.equal(binding.liveRunProtocolVersion(),1);
 const live=new LiveRunRegistry();assert.equal(live.version,1);assert.equal(live.stopped,false);
 const first=live.admit('saved','pending',null);
 assert.equal(first.created,true);assert.equal(first.busy,true);assert.equal(first.generation,1);
 for(const invalid of [-1,0,1.3,2**32+1,NaN,Infinity]){
  assert.throws(()=>live.state(invalid),/Invalid live run slot or generation/);
  assert.throws(()=>live.forget(first.slot,invalid),/Invalid live run slot or generation/);
 }
 assert.throws(()=>live.admit('unclaimed','pending'),/already running/);assert.equal(live.resolve('unclaimed'),null);
 assert.throws(()=>live.admit('unclaimed','z'.repeat(4097)),/Invalid live run ID/);assert.equal(live.resolve('unclaimed'),null);
 assert.throws(()=>live.admit('unclaimed','\ud800'),/invalid utf-16|lone surrogate/i);assert.equal(live.resolve('\ufffd'),null);
 assert.equal(live.resolve('saved').busy,true);assert.equal(live.resolve('pending').slot,first.slot);
 assert.throws(()=>live.forget(first.slot,first.generation),/Stop this thread before deleting it/);
 live.shutdown();assert.equal(live.stopped,true);assert.equal(live.resolve('saved'),null);
 assert.throws(()=>live.admit('saved',null,null),/Harness is shutting down/);
});

test('independent native worker registries isolate aliases and reject late completions after retry',()=>{
 const first=new LiveRunRegistry(),second=new LiveRunRegistry();
 const original=first.admit('a','x'),independent=second.admit('a','x');
 assert.equal(first.settle(original.slot,original.generation,true).forgotten,true);
 const retry=first.admit('a','x');assert.notEqual(retry.slot,original.slot);
 assert.equal(first.bind(original.slot,original.generation,'unexpected'),null);
 assert.equal(first.settle(original.slot,original.generation,false),null);assert.equal(first.resolve('unexpected'),null);
 assert.equal(second.state(independent.slot).busy,true);first.shutdown();
 assert.equal(second.bind(independent.slot,independent.generation,'canonical').threadId,'canonical');
 assert.equal(second.settle(independent.slot,independent.generation,false).state.failed,false);
 second.shutdown();
});

const canonical=s=>s==null?null:{
 slot:s.slot,generation:s.generation,busy:s.busy,started:s.started,failed:s.failed,threadId:s.threadId??null,clientId:s.clientId??null,
 ...('created' in s?{created:s.created}:{}),
};
function outcome(registry,op,args){
 try{
  const value=registry[op](...args);
  if(op==='forget'||op==='shutdown')return {ok:true,value};
  if(op==='settle')return {ok:true,value:value&&{forgotten:value.forgotten,state:canonical(value.state)}};
  return {ok:true,value:canonical(value)};
 }catch(error){
  // Both adapters reject ownership conflicts. The precise wording is internal.
  return {ok:false,error:/already owned|belongs to another/.test(error.message)?'alias conflict':error.message};
 }
}

test('native and desktop JavaScript registries match a deterministic lifecycle trace',()=>{
 const legacy=createJsRunRegistry(),native=new LiveRunRegistry();
 const apply=(op,...args)=>{
  const reference=outcome(legacy,op,args);
  assert.deepEqual(outcome(native,op,args),reference,op+' '+JSON.stringify(args));
  return reference.value;
 };
 const first=apply('admit','saved','client',null);
 const second=apply('admit','other','second',null);
 apply('bind',first.slot,1,'canonical');apply('bind',second.slot,1,'canonical');
 apply('settle',first.slot,1,false);apply('settle',second.slot,1,true);
 let sequence=0x75cc33;
 const choose=limit=>{sequence=(Math.imul(sequence,1664525)+1013904223)>>>0;return (sequence>>>8)%limit;};
 const tickets=[first,second],ids=['saved','client','other','second','canonical',...Array.from({length:20},(_,i)=>'alias-'+i)];
 const pickId=()=>ids[choose(ids.length)];
 for(let index=0;index<1500;index++){
  const turn=tickets[choose(tickets.length)];
  const op=choose(7);
  if(op<=1){
   const result=apply('admit',choose(3)?pickId():null,choose(3)?pickId():null,null);
   if(result)tickets.push(result);
  }else if(op===2)apply('bind',turn.slot,turn.generation,pickId());
  else if(op===3)apply('settle',turn.slot,turn.generation,Boolean(choose(2)));
  else if(op===4)apply('forget',turn.slot,turn.generation);
  else if(op===5)apply('state',turn.slot);
  else apply('resolve',pickId());
 }
 for(const id of ids)apply('resolve',id);
 apply('shutdown');apply('shutdown');apply('admit','late',null,null);apply('settle',first.slot,1,true);
});
