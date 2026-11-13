import {sessionUsage} from './usage.mjs';
import {mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {ModelRuntime,SessionManager} from '@earendil-works/pi-coding-agent';
import {createThreadStore,threadId} from './threads.mjs';
import {createSufficeSession,parseOptions} from '@suffice/harness';
import {getSupportedThinkingLevels} from '@earendil-works/pi-ai/compat';

const port=process.parentPort;
const send=value=>port?port.postMessage(value):process.send?.(value);
export function createHarnessHost({send,createRuntime=options=>ModelRuntime.create(options),createSession=createSufficeSession,home=parseOptions([]).home}) {
let agent,runtime,workspace,busy=false;
let resumePath=null,viewedUsage=null,login=null;
const threads=createThreadStore(home);
async function receive(message) {
  const {id,action,payload={}}=message;
  let ownsRun=false;
  try {
    if(action==='abort'){agent?.abort();send({id,ok:true});return;}
    if(action==='usage'){send({id,ok:true,result:sessionUsage(agent?.session)??viewedUsage});return;}
    if(action==='threads'){send({id,ok:true,result:await threads.list()});return;}
    if(action==='login-input'){login?.answer?.(String(payload.text??''));send({id,ok:true});return;}
    if(action==='login-cancel'){login?.controller.abort();send({id,ok:true});return;}
    if(action==='logout'){
      if(!runtime)throw new Error('Harness is not ready');
      await runtime.logout('openai');send({id,ok:true,result:{authenticated:runtime.isUsingSubscription('openai')}});return;
    }
    if(action==='login'){
      // Same OpenAI OAuth sign-in as `suffice login`; the browser URL and any paste request go to the window as events.
      if(!runtime)throw new Error('Harness is not ready');
      if(login)throw new Error('Sign-in is already in progress');
      const identity=resolve(home,'host-id');let deviceId;
      try{deviceId=(await readFile(identity,'utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;deviceId=randomUUID();await mkdir(home,{recursive:true,mode:0o700});await writeFile(identity,deviceId,{mode:0o600});}
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15*60_000);login={controller};
      try{
        await runtime.login('openai','oauth',{signal:controller.signal,
          notify(event){if(event.type==='auth_url')send({event:'login_url',url:event.url});else if(event.type==='progress')send({event:'login_progress',message:event.message});},
          prompt(request){send({event:'login_prompt',message:request?.message??'Paste the login response'});return new Promise((resolve,reject)=>{login.answer=resolve;controller.signal.addEventListener('abort',()=>reject(new Error('Sign-in cancelled')),{once:true});});}
        },{getDeviceId:()=>deviceId,agentName:'Suffice'});
      }finally{clearTimeout(timer);login=null;}
      send({id,ok:true,result:{authenticated:runtime.isUsingSubscription('openai')}});return;
    }
    if(busy)throw new Error('A task is already running. Stop it before changing sessions.');
    if(action==='reset'){await agent?.dispose();agent=null;resumePath=null;viewedUsage=null;send({event:'usage',usage:null});send({id,ok:true});return;}
    if(action==='models'){
      if(!runtime)throw new Error('Harness is not ready');
      const models=await runtime.getAvailable();
      send({id,ok:true,result:models.map(model=>({id:model.id,name:model.name,provider:model.provider,efforts:model.reasoning?getSupportedThinkingLevels(model):[]}))});return;
    }
    if(action==='thread'){
      const thread=await threads.open(payload.id,(provider,model)=>runtime?.getModel?.(provider,model));
      await agent?.dispose();agent=null;resumePath=thread.path;workspace=thread.cwd;viewedUsage=thread.usage;
      send({event:'usage',usage:viewedUsage});
      const {path,...view}=thread;send({id,ok:true,result:view});return;
    }
    if(action==='status'){
      const options=parseOptions([]);
      options.home=home;
      await mkdir(options.home,{recursive:true});
      runtime??=await createRuntime({authPath:resolve(options.home,'auth.json'),modelsPath:null,modelsStorePath:resolve(options.home,'catalog.json'),allowModelNetwork:false});
      send({id,ok:true,result:{authenticated:runtime.isUsingSubscription('openai'),node:process.versions.node}});return;
    }
    if(action!=='run')throw new Error('Unknown harness action');
    if(typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000)throw new Error('A valid prompt is required');
    if(!['off','minimal','low','medium','high','xhigh','max'].includes(payload.effort))throw new Error('Invalid effort');
    if(!runtime)throw new Error('Harness is not ready');
    if(!payload.model&&!runtime.isUsingSubscription('openai'))throw new Error('Sign in to start a session');
    let selected;
    if(payload.model){selected=(await runtime.getAvailable()).find(model=>model.id===payload.model&&model.provider===payload.provider);if(!selected)throw new Error('Model unavailable. Sign in with the Suffice CLI for this provider.');if(!(selected.reasoning?getSupportedThinkingLevels(selected):['off']).includes(payload.effort))throw new Error('Unsupported effort for this model');}
    const cwd=await realpath(payload.cwd).catch(()=>{throw new Error(`This thread's project folder is missing (${payload.cwd}). It was moved or deleted.`);});
    if(!(await stat(cwd)).isDirectory())throw new Error('Choose a project directory');
    busy=true;ownsRun=true;
    if(agent&&workspace!==cwd){await agent.dispose();agent=null;}
    if(!agent){
      workspace=cwd;
      const options=parseOptions(['--cwd',cwd]);
      options.effort=payload.effort;
      options.home=home;
      if(selected){options.model=selected.id;options.modelObject=selected;}
      if(resumePath)options.sessionManager=SessionManager.open(resumePath,dirname(resumePath));
      agent=await createSession(options,runtime,{onTool:name=>send({event:'tool',name})});
      agent.session.subscribe(event=>{
        if(['message_end','tool_execution_end','agent_end'].includes(event.type))send({event:'usage',usage:sessionUsage(agent.session)});
        if(event.type==='message_update'&&event.assistantMessageEvent?.type==='text_delta')send({event:'text',text:event.assistantMessageEvent.delta});
        if(event.type==='message_start'&&event.message?.role==='assistant')send({event:'assistant_start'});
        if(event.type==='message_update'&&event.assistantMessageEvent?.type==='thinking_delta')send({event:'reasoning',text:event.assistantMessageEvent.delta});
        if(event.type==='tool_execution_start')send({event:'tool_start',id:event.toolCallId,name:event.toolName,input:event.args});
        if(event.type==='tool_execution_update')send({event:'tool_output',id:event.toolCallId,result:event.partialResult});
        if(event.type==='tool_execution_end')send({event:'tool_end',id:event.toolCallId,result:event.result,isError:event.isError});
      });
    } else {if(selected&&(agent.session.model?.id!==selected.id||agent.session.model?.provider!==selected.provider))await agent.session.setModel(selected);agent.session.setThinkingLevel(payload.effort);}
    const sessionPath=agent.sessionPath();if(sessionPath)send({event:'thread_started',id:threadId(sessionPath)});
    const text=await agent.run(payload.prompt,{images:payload.images});
    send({id,ok:true,result:{text,sessionPath:agent.sessionPath(),threadId:agent.sessionPath()?threadId(agent.sessionPath()):null,usage:agent.totals}});
  } catch(error){send({id,ok:false,error:error.message});}
  finally {if(ownsRun)busy=false;}
}
return receive;
}
export function serve(options={}){
  const receive=createHarnessHost({send,...options});
  if(port)port.on('message',event=>void receive(event.data));
  else if(process.send)process.on('message',message=>void receive(message));
}
