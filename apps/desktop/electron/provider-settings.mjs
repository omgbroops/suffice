import {createSufficeModelRuntime,modelRuntimeOptions,refreshModelCatalog} from '../../../packages/cli/src/model-runtime.mjs';

import {parseOptions} from '@suffice/harness';


// Pi owns provider discovery, login prompts, persistence and token refresh.
export function createProviderSettings({emit,openBrowser,onCatalog=()=>{},createRuntime=options=>createSufficeModelRuntime(options,{onRefresh:onCatalog}),home=parseOptions([]).home}){
 let runtimePromise,operation,pending,sequence=0;
 const runtime=()=>runtimePromise??=createRuntime(modelRuntimeOptions(home));
 async function list(){const rt=await runtime(),credentials=await rt.listCredentials();return rt.getProviders().map(provider=>({id:provider.id,name:provider.name,connected:rt.hasConfiguredAuth(provider.id),credential:credentials.find(c=>c.providerId===provider.id)?.type,methods:[...(provider.auth.apiKey?.login?[{id:'api_key',name:provider.auth.apiKey.name}]:[]),...(provider.auth.oauth?[{id:'oauth',name:provider.auth.oauth.name||'Subscription'}]:[])]})).sort((a,b)=>a.name.localeCompare(b.name));}
 async function login(payload){
  if(operation)throw new Error('Finish or cancel the current connection first');
  const rt=await runtime(),provider=rt.getProvider(payload?.provider);
  if(!provider||!['api_key','oauth'].includes(payload.type)||(payload.type==='api_key'?!provider.auth.apiKey?.login:!provider.auth.oauth))throw new Error('Unsupported provider login');
  const controller=new AbortController();operation=controller;const timeout=setTimeout(()=>controller.abort(),15*60*1000);
  try{await rt.login(provider.id,payload.type,{signal:controller.signal,notify:event=>{emit({type:'notice',event});const target=event.type==='auth_url'?event.url:event.type==='device_code'?event.verificationUri:null;if(target){const url=new URL(target);if(url.protocol==='https:')Promise.resolve(openBrowser(url.href)).catch(()=>emit({type:'notice',event:{type:'progress',message:'Open the sign-in link in your browser to continue.'}}));}},prompt:prompt=>new Promise((resolve,reject)=>{
   const id=++sequence;const abort=()=>{if(pending?.id===id){pending=null;emit({type:'prompt-cancel',id});}reject(new Error('Connection cancelled'));};
   const signal=prompt.signal??controller.signal;if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});pending={id,answer:value=>{signal.removeEventListener('abort',abort);resolve(value);}};
   emit({type:'prompt',id,prompt:{type:prompt.type,message:prompt.message,placeholder:prompt.placeholder,options:prompt.options}});
  })});void refresh({force:true,providers:[provider.id]});return await list();}finally{clearTimeout(timeout);operation=null;pending=null;emit({type:'finished'});}
 }
 function answer(payload){if(!pending||payload?.id!==pending.id||typeof payload.value!=='string'||payload.value.length>32000)throw new Error('Invalid login response');const prompt=pending;pending=null;prompt.answer(payload.value);}
 async function logout(id){if(operation)throw new Error('Finish connection first');const rt=await runtime();if(!rt.getProvider(id))throw new Error('Unknown provider');await rt.logout(id);return list();}
 async function refresh(options={}){return refreshModelCatalog(await runtime(),{...options,onRefresh:onCatalog});}
 return {list,login,answer,logout,refresh,cancel(){operation?.abort();}};
}
