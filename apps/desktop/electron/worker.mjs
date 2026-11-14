import {projectContext,rememberProject,threadTitle} from './engine-settings.mjs';
import {invalidateProjectMetadata} from './sidebar-metadata.mjs';
import {createChatChangeTracker} from './chat-changes.mjs';
import {createThreadRouter} from './thread-router.mjs';
import {sessionUsage} from './usage.mjs';
import {mkdir,realpath,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {ModelRuntime,SessionManager} from '@earendil-works/pi-coding-agent';
import {createThreadStore,threadId} from './threads.mjs';
import {createSufficeSession,parseOptions} from '@suffice/harness';
import {getSupportedThinkingLevels} from '@earendil-works/pi-ai/compat';

const port=process.parentPort;
const send=value=>port?port.postMessage(value):process.send?.(value);
export function createHarnessHost({send,createRuntime=options=>ModelRuntime.create(options),createSession=createSufficeSession,home=parseOptions([]).home,threadStore}) {
let agent,runtime,workspace,changeTracker,busy=false;
const approvals=new Map();let approvalSequence=0,preferencesKey='';
let resumePath=null,viewedUsage=null,viewRevision=0;
const threads=threadStore??createThreadStore(home);
async function receive(message) {
  const {id,action,payload={}}=message;
  let ownsRun=false;
  try {
    if(action==='steer'){if(!busy||!agent)throw new Error('This thread is not running');if(typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000)throw new Error('A valid steering message is required');await agent.session.steer(payload.prompt,payload.images);send({id,ok:true});return;}
    if(action==='approval-answer'){approvals.get(payload.requestId)?.(!!payload.allow);approvals.delete(payload.requestId);send({id,ok:true});return;}
    if(action==='abort'){for(const resolve of approvals.values())resolve(false);approvals.clear();agent?.abort();send({id,ok:true});return;}
    if(action==='usage'){send({id,ok:true,result:sessionUsage(agent?.session)??viewedUsage});return;}
    if(action==='threads'){send({id,ok:true,result:await threads.list()});return;}
    if(busy)throw new Error('A task is already running. Stop it before changing sessions.');
    if(action==='reset'){viewRevision++;await agent?.dispose();agent=null;resumePath=null;viewedUsage=null;send({event:'usage',usage:null});send({id,ok:true});return;}
    if(action==='models'){
      if(!runtime)throw new Error('Harness is not ready');
      runtime=await createRuntime({authPath:resolve(home,'auth.json'),modelsPath:null,modelsStorePath:resolve(home,'catalog.json'),allowModelNetwork:false});
      const available=await runtime.getAvailable();const models=payload.all?runtime.getModels():available;
      send({id,ok:true,result:models.map(model=>({id:model.id,name:model.name,provider:model.provider,available:available.some(item=>item.id===model.id&&item.provider===model.provider),efforts:model.reasoning?getSupportedThinkingLevels(model):[]}))});return;
    }
    if(action==='thread'){
      const revision=++viewRevision,thread=await threads.open(payload.id,(provider,model)=>runtime?.getModel?.(provider,model));
      if(revision===viewRevision){await agent?.dispose();agent=null;resumePath=thread.path;workspace=thread.cwd;viewedUsage=thread.usage;send({event:'usage',usage:viewedUsage});}
      const {path,...view}=thread;send({id,ok:true,result:view});return;
    }
    if(action==='status'){
      const options=parseOptions([]);
      options.home=home;
      await mkdir(options.home,{recursive:true});
      runtime??=await createRuntime({authPath:resolve(options.home,'auth.json'),modelsPath:null,modelsStorePath:resolve(options.home,'catalog.json'),allowModelNetwork:false});
      send({id,ok:true,result:{authenticated:runtime.isUsingSubscription('openai')||(await runtime.getAvailable?.()||[]).length>0,node:process.versions.node}});return;
    }
    if(action!=='run')throw new Error('Unknown harness action');
    if(typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000)throw new Error('A valid prompt is required');
    if(!['off','minimal','low','medium','high','xhigh','max'].includes(payload.effort))throw new Error('Invalid effort');
    if(!runtime)throw new Error('Harness is not ready');
    if(!payload.model&&!runtime.isUsingSubscription('openai'))throw new Error('Connect a provider in Settings first');
    let selected;
    if(payload.model){selected=(await runtime.getAvailable()).find(model=>model.id===payload.model&&model.provider===payload.provider);if(!selected)throw new Error('Model unavailable. Connect this provider in Settings.');if(!(selected.reasoning?getSupportedThinkingLevels(selected):['off']).includes(payload.effort))throw new Error('Unsupported effort for this model');}
    const cwd=await realpath(payload.cwd);
    if(!(await stat(cwd)).isDirectory())throw new Error('Choose a project directory');
    busy=true;ownsRun=true;const nextPreferences=JSON.stringify(payload.desktopSettings||{});if(agent&&preferencesKey!==nextPreferences){resumePath=agent.sessionPath();await agent.dispose();agent=null;}preferencesKey=nextPreferences;
    if(agent&&workspace!==cwd){await agent.dispose();agent=null;}
    if(!agent){
      workspace=cwd;
      const options=parseOptions(['--cwd',cwd]);
      options.effort=payload.effort;
      options.home=home;options.additionalContext=await projectContext(home,cwd,payload.desktopSettings||{});const newlyCreated=!resumePath;options.desktopSettings=payload.desktopSettings||{};if(options.desktopSettings['allow-network']===false){options.browser=false;options.desktop=false;}
      if(selected){options.model=selected.id;options.modelObject=selected;}
      if(resumePath)options.sessionManager=SessionManager.open(resumePath,dirname(resumePath));
      changeTracker=createChatChangeTracker({cwd,home,getId:()=>agent?.sessionPath()?threadId(agent.sessionPath()):null,onChange:diff=>{invalidateProjectMetadata(cwd);send({event:'changes',diff});}});
      agent=await createSession(options,runtime,{onTool:name=>send({event:'tool',name}),toolObserver:changeTracker,onApproval:(name,input)=>new Promise(resolve=>{const requestId=++approvalSequence;approvals.set(requestId,resolve);send({event:'approval',requestId,name,input});})});
      if(newlyCreated&&agent.session.setSessionName)agent.session.setSessionName(threadTitle(payload.prompt,options.desktopSettings.naming));
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
    await changeTracker?.flush().catch(()=>{});if(payload.desktopSettings?.['remember-context'])await rememberProject(home,cwd,text);
    send({id,ok:true,result:{text,sessionPath:agent.sessionPath(),threadId:agent.sessionPath()?threadId(agent.sessionPath()):null,usage:agent.totals}});
  } catch(error){if(ownsRun)await changeTracker?.flush().catch(()=>{});send({id,ok:false,error:error.message});}
  finally {if(ownsRun)busy=false;}
}
return receive;
}
const sharedThreads=createThreadStore(parseOptions([]).home);
const receive=createThreadRouter({send,createHost:options=>createHarnessHost({...options,threadStore:sharedThreads}),createRuntime:options=>ModelRuntime.create(options)});
if(port)port.on('message',event=>void receive(event.data));
else if(process.send)process.on('message',message=>void receive(message));
