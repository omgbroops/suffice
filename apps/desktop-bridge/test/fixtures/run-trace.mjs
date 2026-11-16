import {setImmediate as settle} from 'node:timers/promises';

// No prompts leave this fixture. Discrete gates and a fixed desktop clock
// reproduce the same interleaving with the checkpoint and both registries.
export async function runTrace(createThreadRouter,registry){
 const trace=[],hosts=[],gates=new Map(),send=value=>trace.push(['out',structuredClone(value)]);
 const view=id=>({id,title:'History '+id,cwd:'fixture',messages:[{role:'user',content:'saved'}]});
 const catalog={async request(action,payload={}){
  trace.push(['catalog',action,payload.id]);
  return action==='thread'?view(payload.id):action==='threads'?['A','B'].map(view):'location';
 }};
 const route=createThreadRouter({send,savedCatalog:catalog,registry,createRuntime:async()=>({}),createHost({send}){
  const index=hosts.length;hosts.push(send);trace.push(['host',index]);
  return async({id,action,payload={},runGeneration})=>{
   trace.push(['call',index,id,action,structuredClone(payload)]);
   const reply=result=>send({id,ok:true,result});
   if(action==='thread'){
    if(payload.id==='bad'){send({id,ok:false,error:'View unavailable'});return;}
    reply(view(payload.id));
   }else if(action==='run'){
    const gate=Promise.withResolvers();gates.set(payload.prompt,{gate,index});
    if(payload.prompt==='bad-resume'){send({id,ok:false,error:'Resume unavailable'});return;}
    const event={event:'thread_started',id:payload.threadId??'canonical-D'};
    send(runGeneration==null?event:{...event,runGeneration});
    send({event:'turn_started',presentation:{id:payload.prompt}});
    send({event:'approval',requestId:1,name:'tool',input:{fixture:true}});
    send({event:'extension_ui',requestId:1,kind:'choose'});
    send({event:'assistant_start'});send({event:'text',text:'one'});send({event:'text',text:' two'});
    send({event:'reasoning',text:'fixture reasoning'});send({event:'tool_start',id:'tool',name:'fixture',input:{}});
    send({event:'tool_output',id:'tool',result:{content:[]}});send({event:'tool_end',id:'tool',result:{content:[]},isError:false});
    send({event:'compaction_start',reason:'threshold'});send({event:'compaction_end',reason:'threshold',completed:true});
    send({event:'usage',usage:{cost:null,totalTokens:5,windowPercent:null}});
    await gate.promise;reply({threadId:event.id,text:'done',usage:{costUnknown:true}});
   }else if(action==='approval-answer'){
    send({event:'approval_resolved',requestId:payload.requestId});reply(true);
   }else if(action==='abort'){
    for(const {gate,index:target} of gates.values())if(index===target)gate.resolve();
    reply(true);
   }else if(action==='shutdown'){
    for(const {gate,index:target} of gates.values())if(index===target)gate.resolve();
    reply(null);
   }else reply(null);
  };
 }});
 let n=0;
 const request=(action,payload)=>route({id:++n,action,payload});
 const run=(prompt,threadId,clientId)=>request('run',{prompt,threadId,clientId,cwd:'fixture'});
 const clock=Date.now;Date.now=()=>12345;
 try{
  await request('thread',{id:'A'});
  const a=run('first','A','pending:A'),duplicate=run('duplicate','A'),b=run('parallel','B');
  await settle();await duplicate;
  await request('threads');await request('thread',{id:'A'});await request('delete-thread',{id:'A'});
  await request('approval-answer',{threadId:'B',requestId:1,allow:false});
  await request('approval-answer',{threadId:'pending:A',requestId:1,allow:true});
  await request('extension-answer',{threadId:'A',requestId:1,value:'choice'});
  await request('steer',{threadId:'A',prompt:'Steer'});await request('thread',{id:'A'});
  await request('abort',{threadId:'B'});await b;
  gates.get('first').gate.resolve();await a;
  const queued=run('queued','A','A');await settle();gates.get('queued').gate.resolve();await queued;
  await request('reset');const draft=run('draft',undefined,'pending:D');await settle();
  await request('thread',{id:'canonical-D'});await request('usage',{threadId:'pending:D'});
  gates.get('draft').gate.resolve();await draft;
  await request('release-thread',{id:'canonical-D'});await request('abort',{threadId:'pending:D'});
  await run('bad-view','bad');await run('bad-resume','C','pending:C');
  const retry=run('retry','C','pending:C');await settle();gates.get('retry').gate.resolve();await retry;
  const draining=run('draining','A');await settle();await request('shutdown');await draining;await request('threads');
  return trace;
 }finally{Date.now=clock;for(const {gate} of gates.values())gate.resolve();}
}
