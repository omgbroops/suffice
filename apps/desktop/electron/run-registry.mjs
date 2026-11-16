// JavaScript implementation used by the original desktop backend. Each
// reservation belongs to one router/worker and one generation of a live host.
export function createJsRunRegistry(){
 const slots=new Map(),aliases=new Map();
 let sequence=0,stopped=false;
 const snapshot=state=>state?{...state}:null;
 function remove(state){
  for(const [alias,slot] of aliases)if(slot===state.slot)aliases.delete(alias);
  slots.delete(state.slot);
 }
 function checkAlias(id,owner){
  const other=slots.get(aliases.get(id));
  if(!other||other===owner)return;
  if(other.busy||other.retiring)throw Error('A task is already running in this thread');
  if(other.threadId===id)throw Error('Thread ID belongs to another live host');
 }
 return {
  get stopped(){return stopped;},
  resolve:id=>snapshot(slots.get(aliases.get(id))),
  state:slot=>snapshot(slots.get(slot)),
  admit(resumeId,clientId,selectedSlot){
   if(stopped)throw Error('Harness is shutting down');
   if(selectedSlot!=null&&!slots.has(selectedSlot))throw Error('Unknown live run slot');
   let state=slots.get(selectedSlot)??slots.get(aliases.get(resumeId));
   if([state,slots.get(aliases.get(resumeId)),slots.get(aliases.get(clientId))].some(s=>s?.busy||s?.retiring))throw Error('A task is already running in this thread');
   checkAlias(clientId,state);
   const created=!state;
   if(created){
    state={slot:++sequence,generation:0,busy:false,started:false,failed:false,threadId:resumeId||null,clientId:null};
    slots.set(state.slot,state);
    if(resumeId)aliases.set(resumeId,state.slot);
   }
   state.generation++;state.busy=true;state.failed=false;state.clientId=clientId;
   if(clientId)aliases.set(clientId,state.slot);
   return {...state,created};
  },
  bind(slot,generation,id){
   const state=slots.get(slot);
   if(!state?.busy||state.generation!==generation)return null;
   checkAlias(id,state);
   state.started=true;state.threadId=id;aliases.set(id,slot);
   return snapshot(state);
  },
  settle(slot,generation,failed){
   const state=slots.get(slot);
   if(!state?.busy||state.generation!==generation)return null;
   state.busy=false;state.failed=failed;
   const forgotten=failed&&!state.started&&generation===1;
   if(forgotten)remove(state);
   return {state:snapshot(state),forgotten};
  },
  beginRelease(slot,generation){
   const state=slots.get(slot);
   if(!state||state.generation!==generation)return null;
   if(state.busy||state.retiring)throw Error('Stop this thread before deleting it');
   state.retiring=true;return ++state.generation;
  },
  endRelease(slot,generation,disposed){
   const state=slots.get(slot);
   if(!state?.retiring||state.generation!==generation)return false;
   if(disposed)remove(state);else delete state.retiring;
   return true;
  },
  forget(slot,generation){
   const state=slots.get(slot);
   if(!state||state.generation!==generation)return false;
   if(state.busy||state.retiring)throw Error('Stop this thread before deleting it');
   remove(state);return true;
  },
  shutdown(){stopped=true;slots.clear();aliases.clear();},
 };
}
