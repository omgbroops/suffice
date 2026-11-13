// Test-only harness: the real host protocol (worker.mjs) over a fake runtime, so walks never reach a provider.
// Sign-in emits an .invalid auth URL and accepts the paste "fake-code"; a run echoes the prompt.
import {parseOptions} from '../../../packages/cli/src/options.mjs';
process.env.PI_CODING_AGENT_DIR=parseOptions([]).home;
const {serve}=await import('../electron/worker.mjs');
const {SessionManager}=await import('@earendil-works/pi-coding-agent');
const {mkdirSync}=await import('node:fs');
const {resolve}=await import('node:path');
let signedIn=process.env.SUFFICE_FAKE_SIGNED_IN==='1';
const runtime={
 isUsingSubscription:()=>signedIn,async logout(){signedIn=false;},getAvailable:async()=>[],getModel:()=>undefined,
 async login(provider,type,{notify,prompt}){
  notify({type:'auth_url',url:'https://auth.example.invalid/oauth/authorize?fake=1'});
  if(await prompt({message:'Paste the login response'})!=='fake-code')throw new Error('Login response not recognized');
  signedIn=true;
 },
};
// Sessions persist through the real store (pi SessionManager), same as the real harness, so the sidebar sees them.
async function createSession(options){
 const listeners=[];
 const dir=resolve(options.home,'sessions','fake');mkdirSync(dir,{recursive:true});
 const manager=options.sessionManager??SessionManager.create(options.cwd,dir);
 const user=text=>manager.appendMessage({role:'user',content:[{type:'text',text}],timestamp:Date.now()});
 const assistant=(text,stopReason='stop',errorMessage)=>manager.appendMessage({role:'assistant',content:[{type:'text',text}],api:'fake',provider:'fake',model:'fake',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason,...(errorMessage?{errorMessage}:{}),timestamp:Date.now()});
 return {session:{subscribe:f=>listeners.push(f),model:null,setThinkingLevel(){},setModel(){}},sessionPath:()=>manager.getSessionFile(),totals:null,async dispose(){},
  aborted:false,abort(){this.aborted=true;},
  // "slow:" streams for ~10 s and stops on abort; "fail:" streams part of a reply, then the provider errors
  async run(text,{images}={}){user(text);const emit=delta=>listeners.forEach(f=>f({type:'message_update',assistantMessageEvent:{type:'text_delta',delta}}));
   if(text.startsWith('slow:')||text.startsWith('fail:')){this.aborted=false;listeners.forEach(f=>f({type:'message_start',message:{role:'assistant'}}));let out='';
    for(let i=0;i<(text.startsWith('slow:')?40:4);i++){if(this.aborted){assistant(out,'aborted');return out;}const chunk=`chunk ${i} `;out+=chunk;emit(chunk);await new Promise(r=>setTimeout(r,250));}
    if(text.startsWith('fail:')){const message='529 Overloaded: the provider is busy, try again';assistant(out,'error',message);throw new Error(message);}assistant(out);return out;}
   // first line only, plus what came attached: image count and the size of inlined file context
   const reply='Fake harness reply: '+text.split('\n')[0]+' [in '+options.cwd.split(/[\\/]/).pop()+']'+(images?.length?` [images:${images.length}]`:'')+(text.includes('\n')?` [context:${text.length-text.split('\n')[0].length}]`:'');for(const f of listeners){f({type:'message_start',message:{role:'assistant'}});f({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:reply}});}assistant(reply);return reply;}};
}
serve({createRuntime:async()=>runtime,createSession});
