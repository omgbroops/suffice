import {resolve} from 'node:path';
import {ModelRuntime,readStoredCredential} from '@earendil-works/pi-coding-agent';
import {stateDir} from './runtime.mjs';

// Read only the authorized provider credential. OAuth refreshes remain in process
// memory; no auth/catalog file writes and no credentials in actor tools or logs.
export async function createBenchmarkRuntime(){
 const credential=readStoredCredential('openai',resolve(stateDir,'pi/auth.json'));
 const data=credential?{openai:credential}:{};let tail=Promise.resolve();
 const credentials={
  read:async p=>data[p],
  list:async()=>Object.entries(data).map(([providerId,c])=>({providerId,type:c.type})),
  modify(p,fn){const next=tail.then(async()=>{const c=await fn(data[p]);if(c===undefined)delete data[p];else data[p]=c;return c;});tail=next.catch(()=>{});return next;},
  delete:async p=>{await tail;delete data[p];}
 };
 const runtime=await ModelRuntime.create({credentials,modelsPath:null,allowModelNetwork:false});
 const model=runtime.getModel('openai','gpt-6.1-sol');
 if(!model||!runtime.isUsingSubscription('openai'))throw new Error('Authorized subscription Sol model unavailable; no fallback');
 return runtime;
}
