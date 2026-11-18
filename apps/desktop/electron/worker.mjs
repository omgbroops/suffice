import {createDesktopExtensionUI} from './extension-ui.mjs';
import {createSufficeModelRuntime,modelRuntimeOptions} from '../../../packages/cli/src/model-runtime.mjs';
import {projectContext,rememberProject,threadTitle} from './engine-settings.mjs';
import {invalidateProjectMetadata} from './sidebar-metadata.mjs';
import {createChatChangeTracker} from './chat-changes.mjs';
import {createChatGitTracker} from './chat-git.mjs';
import {createThreadRouter} from './thread-router.mjs';
import {sessionUsage} from './usage.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,realpath,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {SessionManager} from '@earendil-works/pi-coding-agent';
import {createThreadStore,threadId} from './threads.mjs';
import {parseFindings} from './review.mjs';
import {createSufficeSession,parseOptions} from '@suffice/harness';
import {getSupportedThinkingLevels} from '@earendil-works/pi-ai/compat';

process.env.PI_CODING_AGENT_DIR=parseOptions([]).home;
const port=process.parentPort;
const send=value=>port?port.postMessage(value):process.send?.(value);
export function createHarnessHost({send,createRuntime=options=>createSufficeModelRuntime(options,{onRefresh:result=>send({event:'models_changed',catalog:result})}),createSession=createSufficeSession,home=parseOptions([]).home,threadStore}) {
let agent,runtime,workspace,changeTracker,busy=false,abortRequested=false;
const extensionPrompts=new Map();let extensionSequence=0;
const approvals=new Map();let approvalSequence=0,preferencesKey='';
let resumePath=null,viewedUsage=null,viewRevision=0;
const threads=threadStore??createThreadStore(home);
async function receive(message) {
  const {id,action,payload={}}=message;
  let ownsRun=false,turnPresentation;
  const finishPresentation=status=>{if(!turnPresentation||turnPresentation.endedAt)return;turnPresentation.endedAt=Date.now();agent?.session.sessionManager?.appendCustomEntry?.('suffice:turn-end',{id:turnPresentation.id,endedAt:turnPresentation.endedAt,status});};
  try {
    if(action==='shutdown'){abortRequested=true;for(const finish of extensionPrompts.values())finish(undefined);for(const answer of approvals.values())answer(false);approvals.clear();agent?.abort();await agent?.session.agent?.waitForIdle?.();await agent?.dispose();agent=null;send({id,ok:true});return;}
    if(action==='extension-answer'){extensionPrompts.get(payload.requestId)?.(payload.value);send({id,ok:true});return;}
    if(action==='steer'){if(!busy||!agent)throw new Error('This thread is not running');if(typeof payload.prompt!=='string'||!payload.prompt.trim()||payload.prompt.length>1000000)throw new Error('A valid steering message is required');agent.session.sessionManager?.appendCustomEntry?.('suffice:user-presentation',{promptHash:createHash('sha256').update(payload.prompt).digest('hex'),displayPrompt:payload.displayPrompt??payload.prompt,attachments:payload.attachmentMetadata||[]});await agent.session.steer(payload.prompt,payload.images);send({id,ok:true});return;}
    if(action==='approval-answer'){approvals.get(payload.requestId)?.(!!payload.allow);approvals.delete(payload.requestId);send({id,ok:true});return;}
    if(action==='abort'){abortRequested=true;for(const finish of extensionPrompts.values())finish(undefined);for(const resolve of approvals.values())resolve(false);approvals.clear();agent?.abort();send({id,ok:true});return;}
    if(action==='usage'){send({id,ok:true,result:sessionUsage(agent?.session)??viewedUsage});return;}
    if(action==='threads'){send({id,ok:true,result:await threads.list()});return;}
    if(action==='thread-location'){send({id,ok:true,result:await threads.location(payload.id)});return;}
    if(busy)throw new Error('A task is already running. Stop it before changing sessions.');
    if(action==='reset'){viewRevision++;await agent?.dispose();agent=null;resumePath=null;viewedUsage=null;send({event:'usage',usage:null});send({id,ok:true});return;}
    if(action==='models'){
      if(!runtime)throw new Error('Harness is not ready');
      await runtime.refresh?.({allowNetwork:false});
      const available=await runtime.getAvailable();const models=payload.all?runtime.getModels():available;
      send({id,ok:true,result:models.map(model=>({id:model.id,name:model.name,provider:model.provider,available:available.some(item=>item.id===model.id&&item.provider===model.provider),efforts:model.reasoning?getSupportedThinkingLevels(model):[]}))});return;
    }
    if(action==='review'){
      if(!runtime)throw new Error('Harness is not ready');
      const selected=(await runtime.getAvailable()).find(model=>model.id===payload.model&&model.provider===payload.provider);if(!selected)throw new Error('Model unavailable. Connect this provider in Settings.');
      const cwd=await realpath(payload.cwd),options=parseOptions(['--cwd',cwd]);Object.assign(options,{home,access:'read',browser:false,desktop:false,effort:['off','minimal','low','medium','high','xhigh','max'].includes(payload.effort)?payload.effort:'low',model:selected.id,modelObject:selected,sessionManager:SessionManager.inMemory(cwd),desktopSettings:{}});
      busy=true;let reviewer;try{reviewer=await createSession(options,runtime,{});send({id,ok:true,result:{findings:parseFindings(await reviewer.run(payload.prompt),payload.paths)}});}finally{busy=false;await reviewer?.dispose();}return;
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
      options.home=home;options.additionalContext=await projectContext(home,cwd,payload.desktopSettings||{});const newlyCreated=!resumePath;options.desktopSettings=payload.desktopSettings||{};options.onTitleChanged=()=>send({event:'history_changed'});if(options.desktopSettings['allow-network']===false){options.browser=false;options.desktop=false;}
      if(selected){options.model=selected.id;options.modelObject=selected;}
      if(resumePath)options.sessionManager=SessionManager.open(resumePath,dirname(resumePath));
      changeTracker=createChatChangeTracker({cwd,home,getId:()=>agent?.sessionPath()?threadId(agent.sessionPath()):null,onChange:(diff,turnDiff)=>{invalidateProjectMetadata(cwd);send({event:'changes',diff,turnDiff});}});
      options.extensionBindings=(base,session)=>({mode:'rpc',commandContextActions:{waitForIdle:()=>session.agent.waitForIdle(),reload:()=>session.reload(),navigateTree:(id,opts)=>session.navigateTree(id,opts),newSession:async()=>{throw new Error('Use the New session button to create a desktop conversation');},fork:async()=>{throw new Error('Use Fork thread in the conversation menu');},switchSession:async()=>{throw new Error('Choose the conversation from the desktop sidebar');}},onError:error=>send({event:'extension_ui',kind:'notice',message:error.error,type:'error'}),uiContext:createDesktopExtensionUI({base,emit:value=>send({event:'extension_ui',...value}),request:(value,opts)=>new Promise(resolvePrompt=>{const requestId=++extensionSequence;let timer;const finish=value=>{clearTimeout(timer);opts?.signal?.removeEventListener('abort',cancel);extensionPrompts.delete(requestId);send({event:'extension_ui',kind:'dismiss',requestId});resolvePrompt(value);};const cancel=()=>finish(undefined);extensionPrompts.set(requestId,finish);if(opts?.signal?.aborted){finish(undefined);return;}opts?.signal?.addEventListener('abort',cancel,{once:true});if(opts?.timeout)timer=setTimeout(cancel,opts.timeout);send({event:'extension_ui',requestId,...value});})})});
      const gitTracker=createChatGitTracker({cwd,home,getId:()=>agent?.sessionPath()?threadId(agent.sessionPath()):null,onChange:()=>send({event:'history_changed'})});
      const toolObserver={before:(...args)=>changeTracker.before(...args),after:async(token,result)=>{await changeTracker.after(token);await gitTracker.after(token,result);}};
      agent=await createSession(options,runtime,{onTool:name=>send({event:'tool',name}),toolObserver,onApproval:(name,input)=>new Promise(resolve=>{const requestId=++approvalSequence;approvals.set(requestId,allow=>{send({event:'approval_resolved',requestId});resolve(allow);});send({event:'approval',requestId,name,input});})});
      await gitTracker.initialize(newlyCreated);
      if(newlyCreated&&agent.session.setSessionName)agent.session.setSessionName(threadTitle(payload.prompt,options.desktopSettings.naming));
      if(abortRequested){await agent.dispose();agent=null;throw new Error('Cancelled');}
      agent.session.subscribe(event=>{
        if(event.type==='compaction_start')send({event:'compaction_start',reason:event.reason});
        if(event.type==='compaction_end'){
          if(event.result){const entry=agent.session.sessionManager?.getEntries().findLast(entry=>entry.type==='compaction');agent.session.sessionManager?.appendCustomEntry('suffice:compaction',{entryId:entry?.id,reason:event.reason});}
          send({event:'compaction_end',reason:event.reason,completed:!!event.result,aborted:event.aborted,errorMessage:event.errorMessage});
        }
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
    turnPresentation={id:randomUUID(),startedAt:payload.turnStartedAt||Date.now(),provider:agent.session.model?.provider||payload.provider,model:agent.session.model?.id||payload.model,modelName:agent.session.model?.name,effort:agent.session.thinkingLevel||payload.effort};
    agent.session.sessionManager?.appendCustomEntry?.('suffice:turn-start',{...turnPresentation,promptHash:createHash('sha256').update(payload.prompt).digest('hex'),displayPrompt:payload.displayPrompt??payload.prompt,attachments:payload.attachmentMetadata||[]});send({event:'turn_started',presentation:turnPresentation});
    await changeTracker?.beginTurn();
    const text=await agent.run(payload.prompt,{images:payload.images});finishPresentation('completed');
    await changeTracker?.flush().catch(()=>{});if(payload.desktopSettings?.['remember-context'])await rememberProject(home,cwd,text);
    send({id,ok:true,result:{text,presentation:turnPresentation,sessionPath:agent.sessionPath(),threadId:agent.sessionPath()?threadId(agent.sessionPath()):null,usage:agent.totals}});
  } catch(error){finishPresentation(abortRequested?'interrupted':'failed');if(ownsRun)await changeTracker?.flush().catch(()=>{});if(ownsRun&&abortRequested){agent?.session.sessionManager?.appendCustomEntry('suffice:interrupted');send({id,ok:true,result:{interrupted:true,presentation:turnPresentation,threadId:agent?.sessionPath()?threadId(agent.sessionPath()):null}});}else send({id,ok:false,error:error.message});}
  finally {if(ownsRun)busy=false;}
}
return receive;
}
const sharedThreads=createThreadStore(parseOptions([]).home);
const receive=createThreadRouter({send,createHost:options=>createHarnessHost({...options,threadStore:sharedThreads}),createRuntime:options=>createSufficeModelRuntime(options,{onRefresh:result=>send({event:'models_changed',catalog:result})})});
if(port)port.on('message',event=>void receive(event.data));
else if(process.send)process.on('message',message=>void receive(message));
