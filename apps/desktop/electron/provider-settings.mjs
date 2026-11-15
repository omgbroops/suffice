import {brandOAuthCallbacks,oauthPageTheme} from './oauth-page-branding.mjs';
import {installationId} from '../../../packages/cli/src/installation-id.mjs';
import {createSufficeModelRuntime,modelRuntimeOptions,refreshModelCatalog} from '../../../packages/cli/src/model-runtime.mjs';

import {parseOptions} from '@suffice/harness';


// Pi owns provider discovery, login prompts, persistence and token refresh.
export function createProviderSettings({emit,openBrowser,getPreferences=async()=>({}),onCatalog=()=>{},createRuntime=options=>createSufficeModelRuntime(options,{onRefresh:onCatalog}),home=parseOptions([]).home}){
 let runtimePromise,operation,pending,sequence=0;
 const runtime=()=>runtimePromise??=createRuntime(modelRuntimeOptions(home));
 async function list(){const rt=await runtime(),credentials=await rt.listCredentials();return rt.getProviders().map(provider=>({id:provider.id,name:provider.name,connected:rt.hasConfiguredAuth(provider.id),credential:credentials.find(c=>c.providerId===provider.id)?.type,methods:[...(provider.auth.apiKey?.login?[{id:'api_key',name:provider.auth.apiKey.name}]:[]),...(provider.auth.oauth?[{id:'oauth',name:provider.auth.oauth.name||'Subscription'}]:[])]})).sort((a,b)=>a.name.localeCompare(b.name));}
 async function login(payload){
  if(operation)throw new Error('Finish or cancel the current connection first');
  const rt=await runtime(),provider=rt.getProvider(payload?.provider);
  if(!provider||!['api_key','oauth'].includes(payload.type)||(payload.type==='api_key'?!provider.auth.apiKey?.login:!provider.auth.oauth))throw new Error('Unsupported provider login');
  if(operation)throw new Error('Finish or cancel the current connection first');
  const controller=new AbortController();operation=controller;const timeout=setTimeout(()=>controller.abort(),15*60*1000);
  let branding;try{if(payload.type==='oauth'){try{branding=brandOAuthCallbacks(await oauthPageTheme((await getPreferences())['interface-font']||'Inter'));}catch{/* A missing presentation asset must not prevent sign-in. */}}const deviceId=payload.type==='oauth'?await installationId(home):undefined;await rt.login(provider.id,payload.type,{signal:controller.signal,notify:event=>{if(event.type==='auth_url')branding?.authorizationUrl(event.url);emit({type:'notice',event});const target=event.type==='auth_url'?event.url:event.type==='device_code'?event.verificationUri:null;if(target){const url=new URL(target);if(url.protocol==='https:')Promise.resolve(openBrowser(url.href)).catch(()=>emit({type:'notice',event:{type:'progress',message:'Open the sign-in link in your browser to continue.'}}));}},prompt:prompt=>new Promise((resolve,reject)=>{
   const id=++sequence;const abort=()=>{if(pending?.id===id){pending=null;emit({type:'prompt-cancel',id});}reject(new Error('Connection cancelled'));};
   const signal=prompt.signal??controller.signal;if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});pending={id,answer:value=>{signal.removeEventListener('abort',abort);resolve(value);}};
   emit({type:'prompt',id,prompt:{type:prompt.type,message:prompt.message,placeholder:prompt.placeholder,options:prompt.options}});
  })},{getDeviceId:()=>deviceId,agentName:'Suffice'});void refresh({force:true,providers:[provider.id]});return await list();}finally{branding?.dispose();clearTimeout(timeout);operation=null;pending=null;emit({type:'finished'});}
 }
 function answer(payload){if(!pending||payload?.id!==pending.id||typeof payload.value!=='string'||payload.value.length>32000)throw new Error('Invalid login response');const prompt=pending;pending=null;prompt.answer(payload.value);}
 async function logout(id){if(operation)throw new Error('Finish connection first');const rt=await runtime();if(!rt.getProvider(id))throw new Error('Unknown provider');await rt.logout(id);return list();}
 async function refresh(options={}){return refreshModelCatalog(await runtime(),{...options,onRefresh:onCatalog});}
 return {list,login,answer,logout,refresh,cancel(){operation?.abort();}};
}

// SDK errors may contain token responses. Only known, static explanations cross IPC.
export function providerLoginErrorMessage(error){
 const message=error?.message||'';
 if(/port \d+ is in use|EADDRINUSE/i.test(message)||error?.code==='EADDRINUSE')return 'Another sign-in is using the local callback port. Cancel that sign-in and try again.';
 if(error?.name==='AbortError'||/\bcancelled\b|\bcanceled\b/i.test(message))return 'Sign-in cancelled.';
 if(/device ID|installation ID/i.test(message))return 'Suffice could not load its sign-in installation ID. Check access to your Suffice settings folder.';
 if(['EACCES','EPERM','EROFS'].includes(error?.code))return 'Suffice could not save sign-in settings. Check access to your Suffice settings folder.';
 if(/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(message)||['ENOTFOUND','ECONNREFUSED','ECONNRESET','ETIMEDOUT'].includes(error?.cause?.code))return 'Could not reach the provider. Check your connection and try again.';
 const status=message.match(/token request failed \((\d{3})\)/i)?.[1];
 if(status)return 'The provider rejected sign-in (HTTP '+status+'). Please sign in again.';
 return 'Could not connect to the provider. Please try again.';
}
