import {loadDesktopBinding} from './native-binding.mjs';

// napi strings are UTF-8. Encode exceptional JavaScript code units and the
// escape prefix reversibly; ordinary path hashes and draft IDs pass verbatim.
function encode(id){
 if(id==null)return null;
 if(typeof id!=='string'||id.length>4096)throw Error('Invalid live run ID');
 return id.startsWith('~')||!id.isWellFormed()?'~'+JSON.stringify(id):id;
}
const decode=id=>id?.startsWith('~')?JSON.parse(id.slice(1)):id;
const state=value=>value?{...value,threadId:decode(value.threadId),clientId:decode(value.clientId)}:null;

export function verifyLiveRegistry(binding){
 if(typeof binding.LiveRunRegistry!=='function'||binding.liveRunProtocolVersion?.()!==1||typeof binding.LiveRunRegistry.prototype.beginRelease!=='function'||typeof binding.LiveRunRegistry.prototype.endRelease!=='function')throw Error('Native live registry protocol 1 is required');
}
export async function createNativeRunRegistry(){
 const binding=await loadDesktopBinding();
 verifyLiveRegistry(binding);
 const registry=new binding.LiveRunRegistry();
 return {
  requiresGeneration:true,
  get stopped(){return registry.stopped;},
  admit:(resume,client,selected)=>state(registry.admit(encode(resume),encode(client),selected)),
  resolve:id=>id?state(registry.resolve(encode(id))):null,
  state:slot=>state(registry.state(slot)),
  bind:(slot,generation,id)=>state(registry.bind(slot,generation,encode(id))),
  settle(slot,generation,failed){
   const settled=registry.settle(slot,generation,failed);
   return settled?{forgotten:settled.forgotten,state:state(settled.state)}:null;
  },
  beginRelease:(slot,generation)=>registry.beginRelease(slot,generation),
  endRelease:(slot,generation,disposed)=>registry.endRelease(slot,generation,disposed),
  forget:(slot,generation)=>registry.forget(slot,generation),
  shutdown:()=>registry.shutdown(),
 };
}
