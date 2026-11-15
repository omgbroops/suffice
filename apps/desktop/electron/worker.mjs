import {createDesktopExtensionUI} from './extension-ui.mjs';
import {createSufficeModelRuntime,modelRuntimeOptions} from '../../../packages/cli/src/model-runtime.mjs';
import {projectContext,rememberProject,threadTitle} from './engine-settings.mjs';
import {invalidateProjectMetadata} from './sidebar-metadata.mjs';
import {createChatChangeTracker} from './chat-changes.mjs';
import {createThreadRouter} from './thread-router.mjs';
import {sessionUsage} from './usage.mjs';
import {mkdir,realpath,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {SessionManager} from '@earendil-works/pi-coding-agent';
import {createThreadStore,threadId} from './threads.mjs';
import {createSufficeSession,parseOptions} from '@suffice/harness';
import {getSupportedThinkingLevels} from '@earendil-works/pi-ai/compat';

process.env.PI_CODING_AGENT_DIR=parseOptions([]).home;
const port=process.parentPort;
const send=value=>port?port.postMessage(value):process.send?.(value);
export function createHarnessHost({send,createRuntime=options=>createSufficeModelRuntime(options,{onRefresh:result=>send({event:'models_changed',catalog:result})}),createSession=createSufficeSession,home=parseOptions([]).home,threadStore}) {
let agent,runtime,workspace,changeTracker,busy=false,abortRequested=false;
const queuedFollowUps=new Set();
const extensionPrompts=new Map();let extensionSequence=0;
const approvals=new Map();let approvalSequence=0,preferencesKey='';
let resumePath=null,viewedUsage=null,viewRevision=0;
const threads=threadStore??createThreadStore(home);
async function receive(message) {
  const {id,action,payload={}}=message;
  let ownsRun=false;
  try {
    if(action==='shutdown'){abortRequested=true;for(const finish of extensionPrompts.values())finish(undefined);for(const answer of approvals.values())answer(false);approvals.clear();agent?.abort();await agent?.session.agent?.waitForIdle?.();await agent?.dispose();agent=null;send({id,ok:true});return;}
    if(action==='extension-answer'){extensionPrompts.get(payload.requestId)?.(payload.value);send({id,ok:true});return;}
    if(action==='agent-action'){
     if(!agent)throw new Error('Send a message in this thread before using session actions');
     let result;
     if(payload.action==='context')result={usage:sessionUsage(agent.session),messages:agent.session.messages};
     else if(payload.action==='tree')result=agent.session.sessionManager.getTree();
     else if(payload.action==='follow-up'){if(!busy)throw new Error('Use the composer to start a new turn; follow-ups can be queued while the agent is working');if(typeof payload.text!=='string'||!payload.text.trim()||payload.text.length>1000000)throw new Error('Enter a follow-up');queuedFollowUps.add(payload.text);await agent.session.followUp(payload.text);result={queued:true};}
     else{if(busy)throw new Error('Wait for this agent to finish before changing its context');if(payload.action==='compact')result=await agent.session.compact(payload.text||undefined);else if(payload.action==='reload')result=await agent.session.reload();else if(payload.action==='branch'){if(typeof payload.targetId!=='string')throw new Error('Choose an entry');result=await agent.session.navigateTree(payload.targetId,{summarize:false});}else throw new Error('Unknown session action');}
     send({id,ok:true,result:result??{done:true}});return;
    }
    if(action==='steer'){if(!busy||!agent)throw new Error('This thread is not running');if(typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000)throw new Error('A valid steering message is required');await agent.session.steer(payload.prompt,payload.images);send({id,ok:true});return;}
    if(action==='approval-answer'){approvals.get(payload.requestId)?.(!!payload.allow);approvals.delete(payload.requestId);send({id,ok:true});return;}
    if(action==='abort'){abortRequested=true;for(const finish of extensionPrompts.values())finish(undefined);for(const resolve of approvals.values())resolve(false);approvals.clear();agent?.abort();send({id,ok:true});return;}
    if(action==='usage'){send({id,ok:true,result:sessionUsage(agent?.session)??viewedUsage});return;}
    if(action==='thread-location'){send({id,ok:true,result:await threads.location(payload.id)});return;}
    if(action==='threads'){send({id,ok:true,result:await threads.list()});return;}
    if(busy)throw new Error('A task is already running. Stop it before changing sessions.');
    if(action==='reset'){viewRevision++;await agent?.dispose();agent=null;resumePath=null;viewedUsage=null;send({event:'usage',usage:null});send({id,ok:true});return;}
    if(action==='models'){
      if(!runtime)throw new Error('Harness is not ready');
      await runtime.refresh?.({allowNetwork:false});
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
      runtime??=await createRuntime(modelRuntimeOptions(options.home));
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
    busy=true;ownsRun=true;abortRequested=false;const nextPreferences=JSON.stringify(payload.desktopSettings||{});if(agent&&preferencesKey!==nextPreferences){resumePath=agent.sessionPath();await agent.dispose();agent=null;}preferencesKey=nextPreferences;
    if(agent&&workspace!==cwd){await agent.dispose();agent=null;}
    if(!agent){
      workspace=cwd;
      const options=parseOptions(['--cwd',cwd]);
      options.effort=payload.effort;
      options.home=home;options.additionalContext=await projectContext(home,cwd,payload.desktopSettings||{});const newlyCreated=!resumePath;options.desktopSettings=payload.desktopSettings||{};if(options.desktopSettings['allow-network']===false){options.browser=false;options.desktop=false;}
      if(selected){options.model=selected.id;options.modelObject=selected;}
      if(resumePath)options.sessionManager=SessionManager.open(resumePath,dirname(resumePath));
      changeTracker=createChatChangeTracker({cwd,home,getId:()=>agent?.sessionPath()?threadId(agent.sessionPath()):null,onChange:diff=>{invalidateProjectMetadata(cwd);send({event:'changes',diff});}});
      options.extensionBindings=(base,session)=>({mode:'rpc',commandContextActions:{waitForIdle:()=>session.agent.waitForIdle(),reload:()=>session.reload(),navigateTree:(id,opts)=>session.navigateTree(id,opts),newSession:async()=>{throw new Error('Use the New session button to create a desktop conversation');},fork:async()=>{throw new Error('Use Fork thread in the conversation menu');},switchSession:async()=>{throw new Error('Choose the conversation from the desktop sidebar');}},onError:error=>send({event:'extension_ui',kind:'notice',message:error.error,type:'error'}),uiContext:createDesktopExtensionUI({base,emit:value=>send({event:'extension_ui',...value}),request:(value,opts)=>new Promise(resolvePrompt=>{const requestId=++extensionSequence;let timer;const finish=value=>{clearTimeout(timer);opts?.signal?.removeEventListener('abort',cancel);extensionPrompts.delete(requestId);send({event:'extension_ui',kind:'dismiss',requestId});resolvePrompt(value);};const cancel=()=>finish(undefined);extensionPrompts.set(requestId,finish);if(opts?.signal?.aborted){finish(undefined);return;}opts?.signal?.addEventListener('abort',cancel,{once:true});if(opts?.timeout)timer=setTimeout(cancel,opts.timeout);send({event:'extension_ui',requestId,...value});})})});
      agent=await createSession(options,runtime,{onTool:name=>send({event:'tool',name}),toolObserver:changeTracker,onApproval:(name,input)=>new Promise(resolve=>{const requestId=++approvalSequence;approvals.set(requestId,resolve);send({event:'approval',requestId,name,input});})});
      if(newlyCreated&&agent.session.setSessionName)agent.session.setSessionName(threadTitle(payload.prompt,options.desktopSettings.naming));
      if(abortRequested){await agent.dispose();agent=null;throw new Error('Cancelled');}
      agent.session.subscribe(event=>{
        if(event.type==='message_start'&&event.message?.role==='user'){const text=typeof event.message.content==='string'?event.message.content:event.message.content.filter(p=>p.type==='text').map(p=>p.text).join('');if(queuedFollowUps.delete(text))send({event:'follow_up',text});}
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
const receive=createThreadRouter({send,createHost:options=>createHarnessHost({...options,threadStore:sharedThreads}),createRuntime:options=>createSufficeModelRuntime(options,{onRefresh:result=>send({event:'models_changed',catalog:result})})});
if(port)port.on('message',event=>void receive(event.data));
else if(process.send)process.on('message',message=>void receive(message));
