import {execFileSync} from 'node:child_process';
import {createThreadRouter} from '../apps/desktop/electron/thread-router.mjs';
import {createNativeRunRegistry} from '../apps/desktop-bridge/live-registry.mjs';
const oldText=execFileSync('git',['show','2a139be:apps/desktop/electron/thread-router.mjs'],{encoding:'utf8'});
const {createThreadRouter:old}=await import('data:text/javascript;base64,'+Buffer.from(oldText).toString('base64'));
for(const [label,f,registry] of [['frozen',old,undefined],['current-native',createThreadRouter,await createNativeRunRegistry()]]){
 let stops=0, hosts=0;const messages=[];
 const route=f({registry,send:m=>messages.push(m),savedCatalog:{request:async()=>({id:'A',messages:[]})},createHost:({send})=>{hosts++;return async({id,action,runGeneration})=>{if(action==='run')send({event:'thread_started',id:'A',...(runGeneration==null?{}:{runGeneration})});if(action==='reset'){send({id,ok:false,error:'temporary dispose failure'});return;}if(action==='shutdown')stops++;send({id,ok:true,result:{id:'A',messages:[]}});}}});
 await route({id:1,action:'run',payload:{clientId:'draft',prompt:'fixture'}});
 await route({id:2,action:'release-thread',payload:{id:'A'}});
 await route({id:3,action:'shutdown'});console.log(JSON.stringify({label,hosts,stops,releaseError:messages.find(m=>m.id===2).error}));
}
