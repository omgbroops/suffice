// Test-only harness: the real host protocol (worker.mjs) over a fake runtime, so walks never reach a provider.
// Sign-in emits an .invalid auth URL and accepts the paste "fake-code"; a run echoes the prompt.
import {parseOptions} from '../../../packages/cli/src/options.mjs';
process.env.PI_CODING_AGENT_DIR=parseOptions([]).home;
const {serve}=await import('../electron/worker.mjs');
let signedIn=process.env.SUFFICE_FAKE_SIGNED_IN==='1';
const runtime={
 isUsingSubscription:()=>signedIn,async logout(){signedIn=false;},getAvailable:async()=>[],getModel:()=>undefined,
 async login(provider,type,{notify,prompt}){
  notify({type:'auth_url',url:'https://auth.example.invalid/oauth/authorize?fake=1'});
  if(await prompt({message:'Paste the login response'})!=='fake-code')throw new Error('Login response not recognized');
  signedIn=true;
 },
};
async function createSession(){
 const listeners=[];
 return {session:{subscribe:f=>listeners.push(f),model:null,setThinkingLevel(){},setModel(){}},sessionPath:()=>null,totals:null,async dispose(){},
  async run(text){const reply='Fake harness reply: '+text;for(const f of listeners){f({type:'message_start',message:{role:'assistant'}});f({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:reply}});}return reply;}};
}
serve({createRuntime:async()=>runtime,createSession});
