import {createThreadRouter} from './thread-router.mjs';
import {createSufficeModelRuntime} from '../../../packages/cli/src/model-runtime.mjs';

export async function createDesktopWorker({
 home,send,backend,
 loadHost=()=>import('./worker.mjs'),
 createRuntime=options=>createSufficeModelRuntime(options,{onRefresh:catalog=>send({event:'models_changed',catalog})}),
}){
 if(backend!=='rust'){
  const [{createThreadStore},{createHarnessHost}]=await Promise.all([import('./threads.mjs'),loadHost()]);
  const threadStore=createThreadStore(home);
  return createThreadRouter({send,createRuntime,createHost:options=>createHarnessHost({...options,home,threadStore})});
 }
 const {createNativeThreadStore,createSavedCatalogHost}=await import('./threads-native.mjs');
 const {createNativeRunRegistry}=await import('../../desktop-bridge/live-registry.mjs');
 const registry=await createNativeRunRegistry();
 let runtime;
 const threadStore=createNativeThreadStore(home,{resolveModel:(provider,model)=>runtime?.getModel?.(provider,model)});
 return createThreadRouter({
  send,
  registry,savedCatalog:createSavedCatalogHost(threadStore,send),
  async createRuntime(options){runtime=await createRuntime(options);return runtime;},
  createHost(options){
   const host=Promise.resolve().then(loadHost).then(({createHarnessHost})=>createHarnessHost({...options,home,threadStore}));
   return async request=>{
    let receive;
    try{receive=await host;}catch(error){options.send({id:request.id,ok:false,error:error.message});return;}
    return receive(request);
   };
  },
 });
}
