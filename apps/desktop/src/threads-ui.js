import {displayRunError} from '../shared/run-error.mjs';
import {connectApprovals} from './approvals.js';
import {transcriptDivider,isInterruption} from './transcript-divider.js';
import {connectExtensionUI} from './extension-ui.js';
import {connectThreadFork} from './thread-fork.js';
import {preference} from './settings-preferences.js';
import {updateThreadDirectory} from './thread-directory.js';
import {setProjectGroupExpanded} from './project-group-motion.js';
import {sidebarPreferences} from './sidebar-preferences.js';
import {connectOverlayScrollbar} from './overlay-scrollbar.js';
import {icon} from './ui.js';
import {populateThreadRow,tickThreadTimes,connectThreadHover,projectBadge} from './thread-row.js';
import {threadViewState as viewState} from './thread-view-state.js';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {createThreadTransition} from './thread-transition.js';
import {groupActions,actionTitle} from './action-display.js';
import {connectDisclosureMotion} from './disclosure-motion.js';
import {createToolWidget,toolOutput} from './tool-widget.js';
import {nextTranscriptFollowing} from './transcript-scroll.js';

export function connectThreads({api,prompt,send,toast}){
 connectExtensionUI(api,toast);const approvals=connectApprovals(api,toast);
 const workspace=document.querySelector('.workspace'),form=document.querySelector('.composer');
 const transition=createThreadTransition(workspace,form);
 if(preference('new-project','Last used project')==='Ask each time')form.dataset.requireProject='true';
 const newSession=document.querySelector('.new-session');newSession.setAttribute('aria-current','page');
 const list=document.querySelector('.sidebar-sessions');list.replaceChildren();
 const sectionLabel=document.querySelector('#sidebar-section-label');sectionLabel.textContent='Threads';
 const options=document.createElement('button');options.type='button';options.className='icon-button sidebar-options';options.dataset.action='sidebar-menu';options.setAttribute('aria-label','Sidebar options');options.innerHTML=icon('more');sectionLabel.parentElement.append(options);
 connectOverlayScrollbar(list);
 const transcript=document.createElement('section');transcript.className='thread-transcript';transcript.setAttribute('aria-label','Thread transcript');
 let history=document.createElement('div');history.className='thread-messages';transcript.append(history);workspace.append(transcript);
 connectDisclosureMotion(transcript);
 const header=document.createElement('header');header.className='thread-header';header.hidden=true;workspace.append(header);
 let busy=false,opening=false,activeId=null,refreshVersion=0,openRevision=0,previousMotion;
 const savedHistories=new Map();let selectionReady=Promise.resolve();
 const jobs=new Map(),recovering=new Map();
 const visibleJob=()=>jobs.get(activeId);
 function syncRunning(){busy=!!visibleJob()?.running;form.setRunning(busy);send.disabled=!busy&&!prompt.value.trim();}
 const historyObserver=new ResizeObserver(()=>bottom());
 function showHistory(node){historyObserver.disconnect();history=node;transcript.replaceChildren(history);historyObserver.observe(history);}
 let following=true,lastScrollTop=0,scrollFrame=0;
 const bottom=(force=false)=>{if(force)following=true;if(!following)return;transcript.scrollTop=transcript.scrollHeight;lastScrollTop=transcript.scrollTop;if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(following){transcript.scrollTop=transcript.scrollHeight;lastScrollTop=transcript.scrollTop;}});};
 transcript.addEventListener('wheel',event=>{if(event.deltaY<0)following=false;},{passive:true});
 transcript.addEventListener('scroll',()=>{following=nextTranscriptFollowing({following,lastScrollTop,scrollTop:transcript.scrollTop,scrollHeight:transcript.scrollHeight,clientHeight:transcript.clientHeight});lastScrollTop=transcript.scrollTop;},{passive:true});
 transcript.addEventListener('click',event=>{if(event.target.closest('summary'))following=false;});
 transcript.addEventListener('keydown',event=>{if(['PageUp','Home','ArrowUp'].includes(event.key))following=false;});
 let draftTimer,viewScrollTimer;
 function saveView(){clearTimeout(draftTimer);clearTimeout(viewScrollTimer);viewState.update({...(prompt.value!==viewState.state.draft?{draft:prompt.value}:{}),scrollTop:transcript.scrollTop,following,...(form.modelSelection?{model:form.modelSelection}:{})});}
 function restoreView(){const state=viewState.state;prompt.value=state.draft;send.disabled=!prompt.value.trim();following=state.following;requestAnimationFrame(()=>{if(following)bottom(true);else{transcript.scrollTop=state.scrollTop;lastScrollTop=transcript.scrollTop;}});}
 prompt.value=viewState.state.draft;send.disabled=!prompt.value.trim();
 prompt.addEventListener('input',()=>{clearTimeout(draftTimer);draftTimer=setTimeout(saveView,180);});
 transcript.addEventListener('scroll',()=>{clearTimeout(viewScrollTimer);const id=viewState.id;viewScrollTimer=setTimeout(()=>{if(id===viewState.id&&id)viewState.update({scrollTop:transcript.scrollTop,following});},150);},{passive:true});
 window.addEventListener('beforeunload',saveView);
 historyObserver.observe(history);
 new ResizeObserver(()=>{transcript.style.setProperty('--transcript-bottom-space',`${form.getBoundingClientRect().height+48}px`);bottom();}).observe(form);
 function threadView(title,animate=false){const change=()=>{if(!workspace.classList.contains('thread-view')){const canvas=workspace.querySelector('.atmosphere');previousMotion=canvas.dataset.motion;canvas.dataset.motion='paused';canvas.dispatchEvent(new Event('motion-change'));}workspace.classList.add('thread-view');newSession.removeAttribute('aria-current');header.textContent=title;header.hidden=false;};if(animate)transition.enter(change);else change();}
 function clear(){
  const wasThread=workspace.classList.contains('thread-view');
  const change=()=>{
   if(workspace.classList.contains('thread-view')){const canvas=workspace.querySelector('.atmosphere');if(previousMotion===undefined)delete canvas.dataset.motion;else canvas.dataset.motion=previousMotion;canvas.dispatchEvent(new Event('motion-change'));}
   sessionStorage.removeItem('suffice-active-thread');workspace.classList.remove('thread-view');newSession.setAttribute('aria-current','page');header.hidden=true;showHistory(document.createElement('div'));history.className='thread-messages';activeId=null;viewState.select(null);restoreView();syncRunning();
   list.querySelectorAll('.thread-row').forEach(row=>row.setAttribute('aria-pressed','false'));
  };
  if(wasThread)transition.leave(change);else{transition.cancel();change();}
 }

 const codeTimers=new WeakMap();
 function markdown(element,text){element.innerHTML=DOMPurify.sanitize(marked.parse(text),{USE_PROFILES:{html:true},ALLOW_DATA_ATTR:false,FORBID_TAGS:['img','video','audio','iframe','form','input','button','style'],FORBID_ATTR:['style','id','name']});
  clearTimeout(codeTimers.get(element));
  if(element.querySelector('pre code'))codeTimers.set(element,setTimeout(()=>{if(element.isConnected){void import('./mermaid-diagrams.js').then(({renderDiagrams})=>renderDiagrams(element));void import('./code-highlight.js').then(({colorCode})=>Promise.all([...element.querySelectorAll('pre code')].map(code=>colorCode(code,'snippet.'+(code.className.match(/language-([\w+-]+)/)?.[1]||'text'))))).catch(()=>{});}},120));
 }
 function plainReasoning(text){const node=document.createElement('div');markdown(node,text);return node.textContent.replace(/[*_`~]/g,'').replace(/^#{1,6}\s*/gm,'').split('\n').map(line=>line.trim()).filter(Boolean).at(-1)||'Working';}
 function message(role,text){const element=document.createElement('article');element.className=`thread-message thread-${role}`;if(role==='assistant')markdown(element,text);else element.textContent=text;history.append(element);bottom();return element;}
 function renderMessages(messages){
  history.replaceChildren();
  let activity=null,activityLog=null;
  function detail(label,text){
   if(!text?.trim())return;
   if(!activity){
    activity=document.createElement('details');activity.className='thread-activity';activity.open=!preference('collapse-work',true);
    const summary=document.createElement('summary');summary.textContent='Reasoning';
    activityLog=document.createElement('div');activityLog.className='thread-activity-log';activity.append(summary,activityLog);history.append(activity);
   }
   if(label!=='Reasoning')activity.querySelector('summary').textContent='Work';
   const item=document.createElement('details');item.className='thread-detail';
   const summary=document.createElement('summary');summary.textContent=label;
   const pre=document.createElement('pre');pre.textContent=text;item.append(summary,pre);activityLog.append(item);return item;
  }
  for(const entry of groupActions(messages)){
   if(entry.role==='status'){activity=activityLog=null;const divider=transcriptDivider(entry.kind);divider.update(entry.kind,entry.automatic);history.append(divider);continue;}
   if(entry.role==='user')activity=null;
   const text=entry.content.filter(part=>part.type==='text'&&part.text?.trim()).map(part=>part.text).join('\n\n');
   for(const part of entry.content){
    if(part.type==='action'){
     detail('Work',part.output||part.text||'No output')?.remove();activityLog.append(createToolWidget(part).element);continue;
    }
    // Reasoning is a live status, not a permanent transcript entry.
    if(part.type==='thinking'||(entry.role==='user'&&part.type==='image'))continue;
    if(part.type==='text'&&['user','assistant'].includes(entry.role))continue;
    const label=part.type==='thinking'?'Reasoning':part.type==='toolCall'?`Ran ${part.name}`:entry.toolName?`${entry.toolName} result`:entry.role==='toolResult'?'Tool result':entry.role==='system'?'Session context':part.type;
    detail(label,part.text);
   }
   if(text&&['user','assistant'].includes(entry.role)){message(entry.role,text);activity=null;}
  }
  for(const group of history.querySelectorAll('.thread-activity')){
   if(group.querySelector('summary').textContent!=='Reasoning')continue;
   const prose=document.createElement('div');prose.className='thread-reasoning';
   markdown(prose,Array.from(group.querySelectorAll('pre'),el=>el.textContent).join('\n\n'));
   group.querySelector('.thread-activity-log').replaceChildren(prose);
  }
 }
 let savedThreads=[];
 const optimisticThreads=new Map();
 const collapsedProjects=new Set();
 try{for(const key of JSON.parse(localStorage.getItem('suffice-sidebar-collapsed-v1')||'[]'))collapsedProjects.add(key);}catch{}
 sidebarPreferences.subscribe(drawThreads);
 connectThreadHover(list);
 setInterval(()=>tickThreadTimes(list),1000);
 viewState.subscribe(event=>{if(event.type==='update'&&event.changed?.includes('draft'))drawThreads();});
 function addOptimistic(id,title,project=document.querySelector('.project-picker')?.textContent.trim()||'Project'){
  optimisticThreads.set(id,{id,title:title.slice(0,90),project,modified:Date.now()});drawThreads();
 }
 function adoptOptimistic(previous,id){const thread=optimisticThreads.get(previous);if(thread){optimisticThreads.delete(previous);optimisticThreads.set(id,{...thread,id});}}
 async function refresh(){
  const version=++refreshVersion,threads=await api.threads();if(version!==refreshVersion)return;
  savedThreads=threads;for(const thread of threads)optimisticThreads.delete(thread.id);drawThreads();
 }
 connectThreadFork(list,{api,toast,onFork:async fork=>{await refresh();const thread=savedThreads.find(thread=>thread.id===fork.id);if(thread)await openSavedThread(thread);}});
 async function openSavedThread(thread){
  if(!thread)return;const version=++openRevision;saveView();sessionStorage.setItem('suffice-active-thread',thread.id);if(!jobs.has(thread.id))recovering.set(thread.id,[]);
  const entering=!workspace.classList.contains('thread-view');
  const selection=api.openThread(thread.id);selectionReady=selection;selection.catch(()=>{});
  transition.cancel();
  activeId=thread.id;viewState.select(thread.id);following=false;
  const job=jobs.get(thread.id),cached=savedHistories.get(thread.id);
  const reusable=job?.history||(cached?.modified===thread.modified?cached.node:null);
  showHistory(reusable||document.createElement('div'));history.className='thread-messages';
  transcript.setAttribute('aria-busy',String(!reusable));
  threadView(thread.title,entering);restoreView();syncRunning();
  localStorage.setItem('suffice-thread-seen:'+thread.id,String(Date.now()));
  for(const row of list.querySelectorAll('.thread-row')){row.setAttribute('aria-pressed',String(row.dataset.thread===activeId));if(row.dataset.thread===activeId)row.dataset.unread='false';}
  try{
   const selected=await selection;if(version!==openRevision||activeId!==thread.id)return;
   document.dispatchEvent(new Event('suffice:usage-change'));
   if(!reusable){saveView();renderMessages(selected.messages);savedHistories.delete(thread.id);if(JSON.stringify(selected.messages).length<4*1024*1024)savedHistories.set(thread.id,{modified:thread.modified,node:history});while(savedHistories.size>10)savedHistories.delete(savedHistories.keys().next().value);restoreView();}
   if(selected.running&&!jobs.get(thread.id)?.running){
    const runtime=selected.runtime||{},restored=createJob(thread.id,selected.title,history);restored.startedAt=runtime.startedAt||Date.now();restored.provider=runtime.provider;restored.model=runtime.model;
    for(const event of runtime.events||[])restored.event(event);
    restored.lastSequence=runtime.sequence||restored.lastSequence||0;approvals.restore(thread.id,runtime.approvals||[]);
    for(const event of recovering.get(thread.id)||[])if(!event.sequence||event.sequence>restored.lastSequence){approvals.receive(event);if(event.event==='run_completed')restored.finish(event.result,event.error?new Error(event.error):null);else restored.event(event);}
    syncRunning();drawThreads();
   }
  }catch(error){if(version===openRevision){toast(error.message);if(!reusable){const message=document.createElement('p');message.className='thread-status';message.textContent='Could not load transcript';history.append(message);}}}
  finally{recovering.delete(thread.id);if(version===openRevision)transcript.setAttribute('aria-busy','false');}
 }
 function drawThreads(){
  const scroll=list.scrollTop;
  const prefs=sidebarPreferences.get();
  const all=[...optimisticThreads.values(),...savedThreads.filter(thread=>!optimisticThreads.has(thread.id))];
  updateThreadDirectory(all,openSavedThread);
  const unread=thread=>thread.id!==activeId&&thread.modified>Number(localStorage.getItem('suffice-thread-seen:'+thread.id)||0);
  const status=thread=>{const job=jobs.get(thread.id);return job?(job.running?(job.approvalRequests.size?'approval':'working'):job.failed?'failed':'done'):thread.status;};
  const threads=all.filter(thread=>prefs.filter==='all'||prefs.filter==='working'&&status(thread)==='working'||prefs.filter==='attention'&&['approval','input','failed'].includes(status(thread))||prefs.filter==='unread'&&unread(thread)||prefs.filter==='draft'&&!!viewState.read(thread.id).draft).sort((a,b)=>prefs.sort==='name'?a.title.localeCompare(b.title):b.modified-a.modified);
  sectionLabel.textContent=prefs.group==='project'?'Threads':prefs.filter==='all'?'Threads':({working:'Running',attention:'Needs attention',unread:'Unread',draft:'Drafts'})[prefs.filter];
  list.dataset.compact=String(prefs.compact);list.dataset.group=prefs.group;
  for(const field of ['branch','provider','diff'])list.dataset[field]=String(prefs[field]);
  list.replaceChildren();
  const groups=new Map();
  for(const thread of threads){
   let target=list;
   if(prefs.group==='project'){
    const key=thread.cwd||thread.project||'__none';
    if(!groups.has(key)){
     const group=document.createElement('section');group.className='thread-project-group';
     const label=document.createElement('button');label.type='button';label.className='thread-group-toggle';label.setAttribute('aria-expanded',String(!collapsedProjects.has(key)));label.innerHTML=icon('chevron');
     const name=document.createElement('span');name.className='thread-group-name';name.textContent=thread.project||'No project';const count=document.createElement('span');count.className='thread-group-count';count.textContent=String(threads.filter(t=>(t.cwd||t.project||'__none')===key).length);label.append(projectBadge(thread),name);
     if(thread.projectDiff&&(thread.projectDiff.added||thread.projectDiff.removed)){const diff=document.createElement('span');diff.className='thread-project-diff';diff.setAttribute('aria-label',thread.projectDiff.scope==='branch'?'Project branch changes, including uncommitted edits':'Project uncommitted changes');const added=document.createElement('span'),removed=document.createElement('span');added.className='thread-added';removed.className='thread-removed';added.textContent='+'+thread.projectDiff.added;removed.textContent='\u2212'+thread.projectDiff.removed;diff.append(added,removed);label.append(diff);}label.append(count);
     const body=document.createElement('div');body.className='thread-group-rows';body.hidden=collapsedProjects.has(key);body.inert=body.hidden;label.addEventListener('click',()=>{if(collapsedProjects.has(key))collapsedProjects.delete(key);else collapsedProjects.add(key);try{localStorage.setItem('suffice-sidebar-collapsed-v1',JSON.stringify([...collapsedProjects]));}catch{}const expanded=!collapsedProjects.has(key);label.setAttribute('aria-expanded',String(expanded));setProjectGroupExpanded(body,expanded);});group.append(label,body);list.append(group);groups.set(key,body);
    }target=groups.get(key);
   }
   const row=document.createElement('button');row.type='button';row.className='thread-row session-row session-row--sidebar';row.dataset.thread=thread.id;row.dataset.project=thread.project;row.setAttribute('aria-pressed',String(thread.id===activeId));row.title=`${thread.title} · ${thread.project}`;
   const job=jobs.get(thread.id);const details={...thread,...(job?{status:status(thread),error:job.failed?job.error:undefined,startedAt:job.startedAt,provider:job.provider||thread.provider,model:job.model||thread.model,terminalCount:job.terminalCount,...(job.diff?{diff:job.diff}:{})}: {})};populateThreadRow(row,details,{draft:!!viewState.read(thread.id).draft,unread:thread.id!==activeId&&thread.modified>Number(localStorage.getItem('suffice-thread-seen:'+thread.id)||0)});
   row.addEventListener('click',()=>void openSavedThread(thread));target.append(row);
  }
  if(!threads.length){const empty=document.createElement('div');empty.className='sidebar-empty';empty.textContent=all.length?'No matching threads':'No threads yet';list.append(empty);}
  tickThreadTimes(list);list.scrollTop=scroll;
 }
 function createJob(id,title,node){
  const job={id,title,history:node,running:true,approvalRequests:new Set(),startedAt:Date.now(),provider:form.modelSelection?.provider,model:form.modelSelection?.model,terminalCount:0};jobs.set(id,job);
  let current=null,streamed='',reasoning='',group=null,log=null,compaction=null;const tools=new Map();
  const statusLine=document.createElement('div');statusLine.className='thread-status';statusLine.setAttribute('role','status');statusLine.textContent='Working';node.append(statusLine);
  const status=text=>{statusLine.textContent=text;statusLine.hidden=false;};
  const response=()=>{if(!current){current=document.createElement('article');current.className='thread-message thread-assistant';node.insertBefore(current,statusLine);}return current;};
  // The status is the live insertion point, not a footer below queued messages.
  job.addSteering=text=>{const bubble=document.createElement('article');bubble.className='thread-message thread-user';bubble.textContent=text;node.insertBefore(bubble,statusLine);group=log=null;return bubble;};
  job.event=event=>{
   if(event.sequence&&event.sequence<=(job.lastSequence||0))return;if(event.sequence)job.lastSequence=event.sequence;
   if(event.event==='steering'){job.addSteering(event.text);current=null;streamed='';return;}
   if(event.event==='compaction_start'){group=log=null;statusLine.hidden=true;if(!compaction){compaction=transcriptDivider('compacting');node.insertBefore(compaction,statusLine);}if(node===history)bottom();return;}
   if(event.event==='compaction_end'){if(compaction){if(event.completed)compaction.update('compacted',event.reason!=='manual');else compaction.remove();compaction=null;}if(event.errorMessage)status(event.errorMessage);if(node===history)bottom();return;}
   if(event.event==='approval'){job.approvalRequests.add(event.requestId);status('Waiting for approval');drawThreads();}
   if(event.event==='approval_resolved'){job.approvalRequests.delete(event.requestId);status(job.approvalRequests.size?'Waiting for approval':'Working');drawThreads();}
   if(event.event==='changes'){job.diff=event.diff;drawThreads();}
   if(event.event==='assistant_start'){reasoning='';if(streamed){current=null;streamed='';}status('Working');}
   if(event.event==='text'){streamed+=event.text;if(preference('stream-markdown',true))markdown(response(),streamed);else response().textContent=streamed;statusLine.hidden=true;}
   if(event.event==='reasoning'){reasoning+=event.text||'';if(preference('show-reasoning',true))status(plainReasoning(reasoning));}
   if(event.event==='tool')status(`Running ${event.name}`);
   if(event.event==='tool_start'){
    if(/bash|shell|terminal/.test(event.name)){job.terminalCount++;drawThreads();}
    current=null;streamed='';if(!group){group=document.createElement('details');group.className='thread-activity';const summary=document.createElement('summary');summary.textContent='Work';log=document.createElement('div');log.className='thread-activity-log';group.append(summary,log);node.insertBefore(group,statusLine);}
    const widget=createToolWidget({name:event.name,text:JSON.stringify(event.input||{},null,2),done:false});if(!preference('collapse-work',true))group.open=true;tools.set(event.id,widget);log.append(widget.element);status(`Running ${event.name}`);reasoning='';
   }
   if(event.event==='tool_output'||event.event==='tool_end'){tools.get(event.id)?.update(toolOutput(event.result),event.isError,event.event!=='tool_end');if(event.event==='tool_end'){status('Working');if(job.terminalCount){job.terminalCount--;drawThreads();}}}
   if(event.event==='text')group=log=null;
   if(node===history)bottom();
  };
  job.finish=(result,error)=>{if(!job.running)return;const interrupted=result?.interrupted||isInterruption(error);if(compaction){compaction.remove();compaction=null;}if(interrupted){node.insertBefore(transcriptDivider('interrupted'),statusLine);error=null;}else if(error){current=null;streamed='';response().textContent=displayRunError(error.message,job.provider);}else if(result?.text)markdown(response(),result.text);statusLine.remove();if(preference('collapse-work',true))node.querySelectorAll('.thread-activity').forEach(group=>group.open=false);approvals.clear(job.id);job.approvalRequests.clear();job.running=false;job.failed=!!error;job.error=error?displayRunError(error.message,job.provider):undefined;job.terminalCount=0;if(node===history)localStorage.setItem('suffice-thread-seen:'+job.id,String(Date.now()));drawThreads();if(node===history){syncRunning();saveView();bottom();document.dispatchEvent(new Event('suffice:usage-change'));}document.dispatchEvent(new Event('suffice:thread-updated'));void refresh().catch(()=>{});};
  return job;
 }
 function adoptJob(job,id){if(!id||id===job.id)return;const previous=job.id;jobs.delete(previous);jobs.set(id,job);job.id=id;adoptOptimistic(previous,id);if(activeId===previous){activeId=id;viewState.adopt(id);sessionStorage.setItem('suffice-active-thread',id);}drawThreads();}
 api.onClearCache?.(()=>{savedHistories.clear();});
 document.addEventListener('suffice-preference',event=>{if(event.detail.id==='collapse-work')document.querySelectorAll('.thread-activity').forEach(group=>group.open=!event.detail.value);if(event.detail.id==='new-project'&&!activeId)form.dataset.requireProject=String(event.detail.value==='Ask each time');});
 document.addEventListener('suffice-project-selected',()=>{delete form.dataset.requireProject;});
 api.onEvent(event=>{
  if(event.event==='history_changed'){void refresh().catch(()=>{});return;}
  const job=jobs.get(event.threadId)||jobs.get(event.clientId)||(!event.threadId&&!event.clientId?visibleJob():null);
  if(event.event==='background_started'){adoptOptimistic(event.clientId,event.threadId);void refresh().catch(()=>{});return;}
  if(event.event==='background_completed'){void refresh().catch(()=>{});return;}
  if(!job?.running){recovering.get(event.threadId)?.push(event);if(event.event==='run_completed')void refresh().catch(()=>{});return;}
  if(event.event==='run_completed'){job.finish(event.result,event.error?new Error(event.error):null);return;}
  if(event.event==='thread_started'){adoptJob(job,event.id);void refresh().catch(()=>{});return;}
  job.event(event);
 });
 api.status().then(async status=>{await refresh();const previous=sessionStorage.getItem('suffice-active-thread');if(previous){const thread=savedThreads.find(thread=>thread.id===previous);if(thread)await openSavedThread(thread);}if(!status.authenticated)toast('Connect a provider in Settings to start a session.');}).catch(error=>toast(error.message));
 document.addEventListener('click',async event=>{
  const control=event.target.closest('[data-action]');if(!control)return;
  if(control.dataset.action==='repo-menu'){
   event.preventDefault();event.stopImmediatePropagation();
   try{const project=await api.chooseProject();if(project){clear();control.title=project.path;control.setAttribute('aria-label',`Project: ${project.name}`);toast(project.name);await refresh();}}catch(error){toast(error.message);}return;
  }
  if(control.dataset.action==='new'){
   event.preventDefault();event.stopImmediatePropagation();
   try{openRevision++;selectionReady=Promise.resolve();saveView();void api.reset().catch(error=>toast(error.message));document.dispatchEvent(new Event('suffice:usage-change'));clear();if(preference('new-project','Last used project')==='Ask each time'){form.dataset.requireProject='true';queueMicrotask(()=>document.querySelector('.project-picker').click());}void refresh().catch(()=>{});}catch(error){toast(error.message);}return;
  }
 },true);
 form.addEventListener('submit',async event=>{
  event.preventDefault();event.stopImmediatePropagation();
  if(busy&&!prompt.value.trim()&&!form.attachments?.count){await api.abort(activeId).catch(error=>toast(error.message));return;}
  if(opening)return;
  const text=prompt.value.trim()||(form.attachments?.count?'Please review the attached files.':'');if(!text)return;
  if(form.modelsDisabled){toast('Enable a model in Settings → Models first');return;}if(form.dataset.requireProject==='true'){toast('Choose a project above the composer first');return;}const inBackground=form.backgroundSubmit||form.backgroundIntent;if(inBackground&&!preference('background-agents',true)){toast('Background agents are disabled in settings');return;}form.backgroundSubmit=false;
  let attachments;opening=true;try{attachments=await form.attachments?.payload();}catch(error){toast(error.message);return;}finally{opening=false;}
  if(busy){
   const textToSteer=prompt.value.trim();if(!textToSteer)return;
   const target=visibleJob(),origin=activeId;
   prompt.value='';form.attachments?.clear();saveView();form.resizePrompt?.();syncRunning();
   try{await api.steer({threadId:origin,prompt:textToSteer,attachments});const bubble=target.addSteering(textToSteer);if(activeId===origin){transition.reveal(bubble,'user',0);bottom(true);}}catch(error){toast(error.message);if(activeId===origin&&!prompt.value){prompt.value=textToSteer;prompt.dispatchEvent(new Event('input'));}}return;
  }
  const entering=!workspace.classList.contains('thread-view'),origin=viewState.id;
  const id=inBackground||entering?'pending:'+crypto.randomUUID():activeId;
  const selection=form.modelSelection||{effort:'low'};saveView();
  const node=inBackground?document.createElement('div'):history;node.className='thread-messages';
  const user=document.createElement('article');user.className='thread-message thread-user';user.textContent=text;node.append(user);
  const job=createJob(id,header.hidden?text.slice(0,90):header.textContent,node);
  if(entering||inBackground)addOptimistic(id,text);
  if(!inBackground){if(entering){transition.cancel();viewState.select(id);viewState.update({model:selection});activeId=id;}threadView(job.title,entering);transition.reveal(user,'user',entering?undefined:0);}
  prompt.value='';form.attachments?.clear();viewState.update({draft:''});form.resizePrompt?.();syncRunning();bottom(true);
  const payload={prompt:text,...selection,attachments,clientId:id,...(!id.startsWith('pending:')?{threadId:id}:{})};
  void selectionReady.catch(()=>{}).then(()=>form.projectSelection).then(()=>(inBackground?api.runBackground(payload):api.run(payload))).then(result=>{adoptJob(job,result.threadId);job.finish(result);}).catch(error=>{
   if(job.id.startsWith('pending:')){optimisticThreads.delete(job.id);drawThreads();}job.finish(null,error);
   if(inBackground&&!isInterruption(error)){toast(error.message);if(viewState.id===origin&&!prompt.value){prompt.value=text;prompt.dispatchEvent(new Event('input'));}}
  });
 },true);
 prompt.addEventListener('input',()=>{if(busy)send.disabled=false;});
}
