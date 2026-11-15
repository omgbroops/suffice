import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {resolve} from 'node:path';

const states=new WeakMap();
const interval=6*60*60*1000;
export const modelRuntimeOptions=home=>({authPath:resolve(home,'auth.json'),modelsPath:resolve(home,'models.json'),modelsStorePath:resolve(home,'catalog.json'),allowModelNetwork:false});

export async function refreshModelCatalog(runtime,{force=false,providers,timeoutMs=8000,onRefresh}={}){
 let state=states.get(runtime);if(!state){state={};states.set(runtime,state);}
 if(state.pending)return state.pending;
 if(process.env.PI_OFFLINE!==undefined)return {offline:true,checkedAt:state.checkedAt||null,failedProviders:[]};
 if(!force&&state.checkedAt&&Date.now()-state.checkedAt<(state.result?.aborted||state.result?.failedProviders?.length?5*60*1000:interval))return state.result;
 const controller=new AbortController();let timer;
 state.pending=(async()=>{
  try{
   const result=await Promise.race([runtime.refresh({allowNetwork:true,force,providers,signal:controller.signal}),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({aborted:true,errors:new Map()});},timeoutMs);})]);
   state.checkedAt=Date.now();state.result={checkedAt:state.checkedAt,aborted:!!result.aborted,failedProviders:[...(result.errors?.keys?.()||[])]};
  }catch{state.checkedAt=Date.now();state.result={checkedAt:state.checkedAt,aborted:controller.signal.aborted,failedProviders:['catalog']};}
  finally{clearTimeout(timer);state.pending=null;}
  try{onRefresh?.(state.result);}catch{/* UI notification must not invalidate a catalog. */}
  return state.result;
 })();return state.pending;
}

export async function createSufficeModelRuntime(options,{onRefresh}={}){
 const runtime=await ModelRuntime.create(options);
 if(process.env.PI_OFFLINE===undefined){
  const refresh=()=>void refreshModelCatalog(runtime,{onRefresh});
  const initial=setTimeout(refresh,0);initial.unref?.();
  const periodic=setInterval(refresh,5*60*1000);periodic.unref?.();
 }
 return runtime;
}
