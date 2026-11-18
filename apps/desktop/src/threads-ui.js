import {syncActivityGroup} from './activity-groups.js';
import {connectMessageActions} from './message-actions.js';
import {displayRunError} from '../shared/run-error.mjs';
import {connectApprovals} from './approvals.js';
import {transcriptDivider,isInterruption} from './transcript-divider.js';
import {connectExtensionUI} from './extension-ui.js';
import {connectThreadFork} from './thread-fork.js';
import {preference} from './settings-preferences.js';
import {connectThreadContextMenu} from './thread-context-menu.js';
import {connectProjectManagement,projectPathKey} from './project-management.js';
import {updateThreadDirectory} from './thread-directory.js';
import {setProjectGroupExpanded} from './project-group-motion.js';
import {sidebarPreferences} from './sidebar-preferences.js';
import {connectOverlayScrollbar} from './overlay-scrollbar.js';
import {icon} from './ui.js';
import {populateThreadRow,tickThreadTimes,connectThreadHover,projectBadge} from './thread-row.js';
import {threadViewState as viewState} from './thread-view-state.js';
import {renderMessageMarkdown} from './message-markdown.js';
import {addCodeCopyButtons} from './code-copy.js';
import {createThreadTransition} from './thread-transition.js';
import {groupActions,actionTitle} from './action-display.js';
import {connectDisclosureMotion} from './disclosure-motion.js';
import {createToolWidget,toolOutput} from './tool-widget.js';
import {nextTranscriptFollowing} from './transcript-scroll.js';
import {connectSessions} from './sessions-ui.js';
import {connectNeedsYou} from './needs-you.js';

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
 const header=document.createElement('header');header.className='thread-header';header.hidden=true;workspace.append(header);const messageActions=connectMessageActions(workspace,transcript);
 let busy=false,opening=false,activeId=null,refreshVersion=0,openRevision=0,previousMotion;
 const savedHistories=new Map();let selectionReady=Promise.resolve();
 const jobs=new Map(),recovering=new Map();
 const visibleJob=()=>jobs.get(activeId);
 function dismissStaleToast(){const t=document.querySelector('.toast');if(t?.matches(':popover-open')&&/Connect a provider|Enable a model/.test(t.textContent))t.querySelector('.toast-dismiss')?.click();}
 new MutationObserver(()=>{if(document.querySelector('.model-button')?.textContent.trim()!=='Connect a provider')dismissStaleToast();}).observe(document.querySelector('.model-button'),{childList:true,subtree:true});
 function syncRunning(){busy=!!visibleJob()?.running;form.setRunning(busy);send.disabled=!busy&&!prompt.value.trim();}
 const historyObserver=new ResizeObserver(()=>{bottom();messageActions.reposition();});
 function showHistory(node){messageActions.hide();historyObserver.disconnect();history=node;transcript.replaceChildren(history);historyObserver.observe(history);}
 let following=true,lastScrollTop=0,scrollFrame=0;
 const bottom=(force=false)=>{if(force)following=true;if(!following)return;transcript.scrollTop=transcript.scrollHeight;lastScrollTop=transcript.scrollTop;if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(following){transcript.scrollTop=transcript.scrollHeight;lastScrollTop=transcript.scrollTop;}});};
 transcript.addEventListener('wheel',event=>{if(event.deltaY<0)following=false;},{passive:true});
 transcript.addEventListener('scroll',()=>{following=nextTranscriptFollowing({following,lastScrollTop,scrollTop:transcript.scrollTop,scrollHeight:transcript.scrollHeight,clientHeight:transcript.clientHeight});lastScrollTop=transcript.scrollTop;},{passive:true});
 transcript.addEventListener('click',event=>{if(event.target.closest('summary'))following=false;});
 transcript.addEventListener('keydown',event=>{if(['PageUp','Home','ArrowUp'].includes(event.key))following=false;});
 let draftTimer,viewScrollTimer;
 // Reading position is saved as (message index, offset): scrollTop alone is wrong once lazy blocks change height.
 function readAnchor(){const r=transcript.getBoundingClientRect(),i=[...history.children].findIndex(c=>c.getBoundingClientRect().bottom>r.top+r.height/2);return i<0?null:{i,y:history.children[i].getBoundingClientRect().top-r.top};}
 let inputs=0;for(const type of ['wheel','keydown','pointerdown'])transcript.addEventListener(type,()=>{inputs++;},{passive:true,capture:true});
 function saveView(){clearTimeout(draftTimer);clearTimeout(viewScrollTimer);viewState.update({anchor:readAnchor(),...(prompt.value!==viewState.state.draft?{draft:prompt.value}:{}),scrollTop:transcript.scrollTop,following,...(form.modelSelection?{model:form.modelSelection}:{})});}
 function restoreView(){const state=viewState.state;prompt.value=state.draft;send.disabled=!prompt.value.trim();following=state.following;requestAnimationFrame(()=>{if(following)bottom(true);else{const id=viewState.id,seen=inputs,pin=()=>{const a=state.anchor,c=a&&history.children[a.i];transcript.scrollTop=c?transcript.scrollTop+c.getBoundingClientRect().top-transcript.getBoundingClientRect().top-a.y:state.scrollTop;lastScrollTop=transcript.scrollTop;};pin();for(const ms of [100,300,700,1500])setTimeout(()=>{if(!following&&id===viewState.id&&seen===inputs)pin();},ms);}});}
 prompt.value=viewState.state.draft;send.disabled=!prompt.value.trim();
 prompt.addEventListener('input',()=>{clearTimeout(draftTimer);draftTimer=setTimeout(saveView,180);});
 transcript.addEventListener('scroll',()=>{clearTimeout(viewScrollTimer);const id=viewState.id;viewScrollTimer=setTimeout(()=>{if(id===viewState.id&&id)viewState.update({scrollTop:transcript.scrollTop,anchor:readAnchor(),following});},150);},{passive:true});
 window.addEventListener('beforeunload',saveView);
 historyObserver.observe(history);
 new ResizeObserver(()=>{transcript.style.setProperty('--transcript-bottom-space',`${form.getBoundingClientRect().height+48}px`);bottom();}).observe(form);
 let sessions;
 function threadView(title,animate=false){sessions?.leave();const change=()=>{if(!workspace.classList.contains('thread-view')){const canvas=document.querySelector('.atmosphere');previousMotion=canvas.dataset.motion;canvas.dataset.motion='paused';canvas.dispatchEvent(new Event('motion-change'));}workspace.classList.add('thread-view');newSession.removeAttribute('aria-current');header.textContent=title;header.hidden=false;};if(animate)transition.enter(change);else change();}
 function clear(){
  sessions?.leave();
  const wasThread=workspace.classList.contains('thread-view');
  const change=()=>{
   if(workspace.classList.contains('thread-view')){const canvas=document.querySelector('.atmosphere');if(previousMotion===undefined)delete canvas.dataset.motion;else canvas.dataset.motion=previousMotion;canvas.dispatchEvent(new Event('motion-change'));}
   sessionStorage.removeItem('suffice-active-thread');workspace.classList.remove('thread-view');newSession.setAttribute('aria-current','page');header.hidden=true;showHistory(document.createElement('div'));history.className='thread-messages';activeId=null;viewState.select(null);restoreView();syncRunning();
   list.querySelectorAll('.thread-row').forEach(row=>row.setAttribute('aria-pressed','false'));
  };
  if(wasThread)transition.leave(change);else{transition.cancel();change();}
 }

 const codeTimers=new WeakMap();
 function markdown(element,text){renderMessageMarkdown(element,text);addCodeCopyButtons(element);
  clearTimeout(codeTimers.get(element));
  if(element.querySelector('pre code'))codeTimers.set(element,setTimeout(()=>{if(element.isConnected){void import('./mermaid-diagrams.js').then(({renderDiagrams})=>renderDiagrams(element));void import('./code-highlight.js').then(({colorCode})=>Promise.all([...element.querySelectorAll('pre code')].map(code=>colorCode(code,'snippet.'+(code.className.match(/language-([\w+-]+)/)?.[1]||'text'))))).catch(()=>{});}},120));
 }
 sessions=connectSessions({toast,form,workspace,header,hooks:{showHistory,threadView,markdown,bottom,clear}});
 function plainReasoning(text){const node=document.createElement('div');markdown(node,text);return node.textContent.replace(/[*_`~]/g,'').replace(/^#{1,6}\s*/gm,'').split('\n').map(line=>line.trim()).filter(Boolean).at(-1)||'Working';}
 function message(role,text){const element=document.createElement('article');element.className=`thread-message thread-${role}`;if(role==='assistant')markdown(element,text);else element.textContent=text;history.append(element);bottom();return element;}
 function renderMessages(messages){
  history.replaceChildren();
  let activity=null,activityLog=null,renderedTurn=null;const turns=new Map();
  function detail(label,text){
   if(!text?.trim())return;
   if(!activity){
    activity=document.createElement('details');activity.className='thread-activity';activity.open=!preference('collapse-work',true);
    const summary=document.createElement('summary');summary.textContent='Reasoning';
    activityLog=document.createElement('div');activityLog.className='thread-activity-log';activity.append(summary,activityLog);history.append(activity);if(renderedTurn)messageActions.work(activity,renderedTurn);
   }
   if(label!=='Reasoning')activity.querySelector('summary').textContent='Work';
   const item=document.createElement('details');item.className='thread-detail';
   const summary=document.createElement('summary');summary.textContent=label;
   const pre=document.createElement('pre');pre.textContent=text;item.append(summary,pre);activityLog.append(item);return item;
  }
  for(const entry of groupActions(messages)){
   if(entry.role==='status'){activity=activityLog=null;const divider=transcriptDivider(entry.kind);divider.update(entry.kind,entry.automatic);history.append(divider);continue;}
   if(entry.role==='user')activity=null;
   if(entry.turn?.id){if(!turns.has(entry.turn.id))turns.set(entry.turn.id,messageActions.turn(entry.turn));renderedTurn=turns.get(entry.turn.id);}else if(entry.role==='user'||!renderedTurn)renderedTurn=messageActions.turn({provider:entry.provider,model:entry.model});
   const text=entry.displayText??entry.content.filter(part=>part.type==='text'&&part.text?.trim()).map(part=>part.text).join('\n\n');
   for(const part of entry.content){
    if(part.type==='action'){
     detail('Work',part.output||part.text||'No output')?.remove();activityLog.append(createToolWidget(part).element);syncActivityGroup(activity);continue;
    }
    // Reasoning is a live status, not a permanent transcript entry.
    if(part.type==='thinking'||(entry.role==='user'&&part.type==='image'))continue;
    if(part.type==='text'&&['user','assistant'].includes(entry.role))continue;
    const label=part.type==='thinking'?'Reasoning':part.type==='toolCall'?`Ran ${part.name}`:entry.toolName?`${entry.toolName} result`:entry.role==='toolResult'?'Tool result':entry.role==='system'?'Session context':part.type;
    detail(label,part.text);
   }
   if((text||entry.content.some(part=>part.type==='image'))&&['user','assistant'].includes(entry.role)){const element=message(entry.role,text);if(entry.role==='user')messageActions.user(element,{text,timestamp:entry.timestamp,attachments:entry.attachments,images:entry.content.filter(part=>part.type==='image')});else messageActions.assistant(element,renderedTurn,text);activity=null;}
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
 viewState.subscribe(event=>{if(event.type==='update'&&event.changed?.some(key=>['draft','sidebar'].includes(key)))drawThreads();});
 const metadata=id=>viewState.read(id).sidebar||{};
 const updateMetadata=(id,patch)=>viewState.updateFor(id,{sidebar:{...metadata(id),...patch}});
 // The caption stays the same node so window chrome can move it between layouts.
 header.contentEditable='plaintext-only';header.tabIndex=0;header.setAttribute('role','textbox');header.setAttribute('aria-label','Chat title');header.setAttribute('aria-multiline','false');header.spellcheck=false;
 let titleEdit=null;
 const inSession=()=>String(viewState.id).startsWith('session-');
 header.addEventListener('focus',()=>{if(!inSession())titleEdit={id:activeId,title:header.textContent};});
 header.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();header.blur();}else if(event.key==='Escape'){event.preventDefault();if(titleEdit)header.textContent=titleEdit.title;titleEdit=null;header.blur();}});
 header.addEventListener('blur',()=>{const edit=titleEdit;titleEdit=null;if(!edit)return;const title=header.textContent.replace(/\s+/g,' ').trim().slice(0,200);if(!title){header.textContent=edit.title;return;}header.textContent=title;if(edit.id&&edit.id===activeId&&title!==edit.title)updateMetadata(edit.id,{title});});
 const isViewing=id=>activeId===id&&document.hasFocus()&&document.visibilityState==='visible'&&!document.documentElement.classList.contains('settings-open');
 const markViewed=()=>{if(activeId&&isViewing(activeId)&&metadata(activeId).unread)updateMetadata(activeId,{unread:false});};
 const sameProject=(a,b)=>projectPathKey(a)===projectPathKey(b);
 const projectManagement=connectProjectManagement(list,{api,toast,archiveProject:async folder=>{for(const thread of [...savedThreads,...optimisticThreads.values()])if(sameProject(thread.cwd,folder)&&!jobs.get(thread.id)?.running){updateMetadata(thread.id,{archived:true});if(activeId===thread.id)clear();}},removedProject:async folder=>{if(sameProject(savedThreads.find(t=>t.id===activeId)?.cwd,folder))clear();await refresh();},movedThread:async id=>{if(activeId===id)clear();jobs.delete(id);savedHistories.delete(id);await refresh();}});
 document.addEventListener('suffice-projects-updated',()=>void refresh().catch(error=>toast(error.message)));
 window.addEventListener('focus',markViewed);document.addEventListener('visibilitychange',markViewed);new MutationObserver(markViewed).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 connectThreadContextMenu(list,{projectManagement,isGrouped:()=>sidebarPreferences.get().group==='project',getThread:id=>{const thread=[...optimisticThreads.values(),...savedThreads].find(t=>t.id===id);return thread?{...thread,title:metadata(id).title||thread.title,running:!!jobs.get(id)?.running}:null;},metadata,update:updateMetadata,onArchive:id=>{if(activeId===id)clear();},onDelete:async id=>{await api.deleteThread(id);if(activeId===id)clear();savedThreads=savedThreads.filter(thread=>thread.id!==id);optimisticThreads.delete(id);savedHistories.delete(id);jobs.delete(id);viewState.remove(id);drawThreads();document.dispatchEvent(new Event('suffice-thread-deleted'));},toast});
 function addOptimistic(id,title,project=document.querySelector('.project-picker')?.textContent.trim()||'Project'){
  optimisticThreads.set(id,{id,title:title.slice(0,90),project,modified:Date.now()});drawThreads();
 }
 function adoptOptimistic(previous,id){const thread=optimisticThreads.get(previous);if(thread){optimisticThreads.delete(previous);optimisticThreads.set(id,{...thread,id});}}
 async function refresh(){
  const version=++refreshVersion,threads=await api.threads();if(version!==refreshVersion)return;
  const previous=new Map(savedThreads.map(t=>[t.id,t]));for(const thread of threads)if(thread.status==='done'&&previous.has(thread.id)&&thread.modified>previous.get(thread.id).modified&&!jobs.has(thread.id))updateMetadata(thread.id,{unread:!isViewing(thread.id)});
  savedThreads=threads;const selected=threads.find(thread=>thread.id===activeId);if(selected&&!header.hidden&&!inSession()&&document.activeElement!==header)header.textContent=metadata(selected.id).title||selected.title;for(const thread of threads)optimisticThreads.delete(thread.id);drawThreads();
 }
 api.askBar?.onThread(async id=>{await refresh();const thread=savedThreads.find(thread=>thread.id===id);if(thread)await openSavedThread(thread);});
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
  threadView(metadata(thread.id).title||thread.title,entering);restoreView();syncRunning();updateMetadata(thread.id,{unread:false});
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
  const all=[...optimisticThreads.values(),...savedThreads.filter(thread=>!optimisticThreads.has(thread.id))].map(thread=>({...thread,title:metadata(thread.id).title||thread.title}));
  if(activeId&&!header.hidden&&!inSession()&&document.activeElement!==header){const active=all.find(t=>t.id===activeId);if(active)header.textContent=active.title;}
  const unread=thread=>!!metadata(thread.id).unread;
  const status=thread=>{const job=jobs.get(thread.id);return job?(job.running?(job.approvalRequests.size?'approval':'working'):job.failed?'failed':'done'):thread.status;};
  updateThreadDirectory(all.map(thread=>{const job=jobs.get(thread.id);return {...thread,status:status(thread),unread:unread(thread),archived:!!metadata(thread.id).archived,canRetry:!!job?.text&&!job.running,...(job?{provider:job.provider||thread.provider,startedAt:job.startedAt,turnDiff:job.turnDiff,...(job.diff?{diff:job.diff}:{})}: {})};}),openSavedThread);
  const threads=all.filter(thread=>prefs.filter==='archived'?metadata(thread.id).archived:!metadata(thread.id).archived&&(prefs.filter==='all'||prefs.filter==='working'&&status(thread)==='working'||prefs.filter==='attention'&&['approval','input','failed'].includes(status(thread))||prefs.filter==='unread'&&unread(thread)||prefs.filter==='draft'&&!!viewState.read(thread.id).draft)).sort((a,b)=>Number(!!b.projectPinned)-Number(!!a.projectPinned)||Number(!!metadata(b.id).pinned)-Number(!!metadata(a.id).pinned)||(prefs.sort==='name'?a.title.localeCompare(b.title):b.modified-a.modified));
  sectionLabel.textContent=prefs.group==='project'?'Threads':prefs.filter==='all'?'Threads':({working:'Running',attention:'Needs attention',unread:'Unread',draft:'Drafts',archived:'Archived'})[prefs.filter];
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
     const label=document.createElement('button');label.type='button';label.className='thread-group-toggle';label.dataset.projectPath=thread.cwd||'';label.setAttribute('aria-expanded',String(!collapsedProjects.has(key)));label.innerHTML=icon('chevron');
     const name=document.createElement('span');name.className='thread-group-name';name.textContent=thread.project||'No project';const count=document.createElement('span');count.className='thread-group-count';count.textContent=String(threads.filter(t=>(t.cwd||t.project||'__none')===key).length);label.append(projectBadge(thread),name);if(thread.projectPinned){const pin=document.createElement('span');pin.className='project-pin';pin.setAttribute('aria-label','Pinned project');pin.innerHTML=icon('pin');label.append(pin);}
     if(thread.projectDiff&&(thread.projectDiff.added||thread.projectDiff.removed)){const diff=document.createElement('span');diff.className='thread-project-diff';diff.setAttribute('aria-label',thread.projectDiff.scope==='branch'?'Project branch changes, including uncommitted edits':'Project uncommitted changes');const added=document.createElement('span'),removed=document.createElement('span');added.className='thread-added';removed.className='thread-removed';added.textContent='+'+thread.projectDiff.added;removed.textContent='\u2212'+thread.projectDiff.removed;diff.append(added,removed);label.append(diff);}label.append(count);
     const body=document.createElement('div');body.className='thread-group-rows';body.hidden=collapsedProjects.has(key);body.inert=body.hidden;label.addEventListener('click',()=>{if(collapsedProjects.has(key))collapsedProjects.delete(key);else collapsedProjects.add(key);try{localStorage.setItem('suffice-sidebar-collapsed-v1',JSON.stringify([...collapsedProjects]));}catch{}const expanded=!collapsedProjects.has(key);label.setAttribute('aria-expanded',String(expanded));setProjectGroupExpanded(body,expanded);});group.append(label,body);list.append(group);groups.set(key,body);
    }target=groups.get(key);
   }
   const row=document.createElement('button');row.type='button';row.className='thread-row session-row session-row--sidebar';row.dataset.thread=thread.id;row.dataset.project=thread.project;row.setAttribute('aria-pressed',String(thread.id===activeId));row.title=`${thread.title} · ${thread.project}`;
   const job=jobs.get(thread.id);const details={...thread,...(job?{status:status(thread),error:job.failed?job.error:undefined,startedAt:job.startedAt,provider:job.provider||thread.provider,model:job.model||thread.model,terminalCount:job.terminalCount,...(job.diff?{diff:job.diff}:{})}: {})};populateThreadRow(row,details,{draft:!!viewState.read(thread.id).draft,unread:unread(thread),pinned:!!metadata(thread.id).pinned});
   row.addEventListener('click',()=>void openSavedThread(thread));target.append(row);
  }
  if(!threads.length){const empty=document.createElement('div');empty.className='sidebar-empty';empty.textContent=all.length?'No matching threads':'No threads yet';list.append(empty);}
  tickThreadTimes(list);list.scrollTop=scroll;
 }
 function createJob(id,title,node){
  const job={id,title,history:node,running:true,approvalRequests:new Set(),startedAt:Date.now(),provider:form.modelSelection?.provider,model:form.modelSelection?.model,terminalCount:0};jobs.set(id,job);job.turn=messageActions.turn({...form.modelSelection,startedAt:job.startedAt},true);
  let current=null,streamed='',reasoning='',group=null,log=null,compaction=null;const tools=new Map();
  const statusLine=document.createElement('div');statusLine.className='thread-status';statusLine.setAttribute('role','status');statusLine.textContent='Working';node.append(statusLine);
  const status=text=>{statusLine.textContent=text;statusLine.hidden=false;};
  const response=()=>{if(!current){current=document.createElement('article');current.className='thread-message thread-assistant';node.insertBefore(current,statusLine);messageActions.assistant(current,job.turn,'');}return current;};
  // The status is the live insertion point, not a footer below queued messages.
  job.addSteering=(text,attachments=[],timestamp=Date.now(),images=[])=>{const bubble=document.createElement('article');bubble.className='thread-message thread-user';bubble.textContent=text;node.insertBefore(bubble,statusLine);messageActions.user(bubble,{text,timestamp,attachments,images});group=log=null;return bubble;};
  job.event=event=>{
   if(event.sequence&&event.sequence<=(job.lastSequence||0))return;if(event.sequence)job.lastSequence=event.sequence;
   if(event.event==='steering'){job.addSteering(event.text,event.attachments,event.timestamp,event.images);current=null;streamed='';return;}
   if(event.event==='turn_started')Object.assign(job.turn.meta,event.presentation);
   if(event.event==='compaction_start'){group=log=null;statusLine.hidden=true;if(!compaction){compaction=transcriptDivider('compacting');node.insertBefore(compaction,statusLine);}if(node===history)bottom();return;}
   if(event.event==='compaction_end'){if(compaction){if(event.completed)compaction.update('compacted',event.reason!=='manual');else compaction.remove();compaction=null;}if(event.errorMessage)status(event.errorMessage);if(node===history)bottom();return;}
   if(event.event==='approval'){job.approvalRequests.add(event.requestId);status('Waiting for approval');drawThreads();}
   if(event.event==='approval_resolved'){job.approvalRequests.delete(event.requestId);status(job.approvalRequests.size?'Waiting for approval':'Working');drawThreads();}
   if(event.event==='changes'){job.diff=event.diff;job.turnDiff=event.turnDiff;drawThreads();}
   if(event.event==='assistant_start'){reasoning='';if(streamed){current=null;streamed='';}status('Working');}
   if(event.event==='text'){streamed+=event.text;if(preference('stream-markdown',true))markdown(response(),streamed);else response().textContent=streamed;messageActions.assistant(response(),job.turn,streamed);statusLine.hidden=true;}
   if(event.event==='reasoning'){reasoning+=event.text||'';if(preference('show-reasoning',true))status(plainReasoning(reasoning));}
   if(event.event==='tool')status(`Running ${event.name}`);
   if(event.event==='tool_start'){
    if(/bash|shell|terminal/.test(event.name)){job.terminalCount++;drawThreads();}
    current=null;streamed='';if(!group){group=document.createElement('details');group.className='thread-activity';const summary=document.createElement('summary');summary.textContent='Work';log=document.createElement('div');log.className='thread-activity-log';group.append(summary,log);node.insertBefore(group,statusLine);messageActions.work(group,job.turn);}
    const widget=createToolWidget({name:event.name,text:JSON.stringify(event.input||{},null,2),done:false});if(!preference('collapse-work',true))group.open=true;tools.set(event.id,widget);log.append(widget.element);syncActivityGroup(group);status(`Running ${event.name}`);reasoning='';
   }
   if(event.event==='tool_output'||event.event==='tool_end'){tools.get(event.id)?.update(toolOutput(event.result),event.isError,event.event!=='tool_end');if(event.event==='tool_end'){status('Working');if(job.terminalCount){job.terminalCount--;drawThreads();}}}
   if(event.event==='text')group=log=null;
   if(node===history)bottom();
  };
  job.finish=(result,error)=>{if(!job.running)return;const interrupted=result?.interrupted||isInterruption(error);if(compaction){compaction.remove();compaction=null;}if(interrupted){node.insertBefore(transcriptDivider('interrupted'),statusLine);error=null;}else if(error){current=null;streamed='';node.querySelectorAll('.thread-run-error').forEach(e=>e.remove());const box=document.createElement('div');box.className='thread-run-error';box.setAttribute('role','alert');const msg=document.createElement('span');msg.textContent=displayRunError(error.message,job.provider);const retry=document.createElement('button');retry.type='button';retry.className='text-button';retry.textContent='Retry';retry.onclick=()=>{const draft=prompt.value.trim();if(busy||(draft&&draft!==(job.text||'').trim()))return;prompt.value=job.text||'';prompt.dispatchEvent(new Event('input'));form.requestSubmit();};box.append(msg,retry);node.insertBefore(box,statusLine);}else if(result?.text){markdown(response(),result.text);messageActions.assistant(response(),job.turn,result.text);}messageActions.complete(job.turn,{...result?.presentation,endedAt:result?.presentation?.endedAt||Date.now()});statusLine.remove();if(preference('collapse-work',true))node.querySelectorAll('.thread-activity').forEach(group=>group.open=false);approvals.clear(job.id);job.approvalRequests.clear();job.running=false;job.failed=!!error;job.error=error?displayRunError(error.message,job.provider):undefined;job.terminalCount=0;if(!error)updateMetadata(job.id,{unread:!isViewing(job.id)});if(node===history&&isViewing(job.id))localStorage.setItem('suffice-thread-seen:'+job.id,String(Date.now()));drawThreads();if(node===history){syncRunning();saveView();bottom();document.dispatchEvent(new Event('suffice:usage-change'));}document.dispatchEvent(new Event('suffice:thread-updated'));void refresh().catch(()=>{});document.dispatchEvent(new CustomEvent('suffice-run-finished',{detail:{id:job.id,completed:!error&&!interrupted}}));};
  return job;
 }
 form.steerQueuedMessage=async(item,id)=>{const target=jobs.get(id);if(!target?.running)throw new Error('This chat is no longer running');await api.steer({threadId:id,prompt:item.prompt,attachments:item.attachments});target.addSteering(item.prompt,item.attachments);if(activeId===id)bottom(true);};
 form.runQueuedMessage=(item,id)=>{const previous=jobs.get(id);if(!previous||previous.running)throw new Error('Chat is not ready for a queued message');const node=previous.history;node.querySelectorAll('.thread-run-error').forEach(e=>e.remove());const user=document.createElement('article');user.className='thread-message thread-user';user.textContent=item.prompt;node.append(user);messageActions.user(user,{text:item.prompt,timestamp:Date.now(),attachments:item.attachments});const job=createJob(id,previous.title,node);job.provider=item.selection?.provider;job.model=item.selection?.model;job.turn=messageActions.turn({...item.selection,startedAt:job.startedAt},true);if(activeId===id){syncRunning();bottom(true);}drawThreads();void api.run({prompt:item.prompt,...item.selection,effort:item.selection?.effort||'low',approvalMode:item.approvalMode,attachments:item.attachments,threadId:id,clientId:id}).then(result=>{adoptJob(job,result.threadId);job.finish(result);}).catch(error=>job.finish(null,error));};
 function adoptJob(job,id){if(!id||id===job.id)return;const previous=job.id;jobs.delete(previous);jobs.set(id,job);job.id=id;adoptOptimistic(previous,id);if(activeId!==previous&&viewState.read(previous).approvalMode)viewState.updateFor(id,{approvalMode:viewState.read(previous).approvalMode});if(activeId===previous){activeId=id;viewState.adopt(id);sessionStorage.setItem('suffice-active-thread',id);}drawThreads();}
 async function retryThread(id){const thread=savedThreads.find(t=>t.id===id),job=jobs.get(id);if(!thread||!job?.text||job.running)return false;await openSavedThread(thread);const draft=prompt.value.trim();if(busy||(draft&&draft!==job.text.trim()))return false;prompt.value=job.text;prompt.dispatchEvent(new Event('input'));form.requestSubmit();return true;}
 connectNeedsYou({api,approvals,toast,retry:retryThread,markRead:id=>updateMetadata(id,{unread:false})});
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
  if(!prompt.value.trim()&&sessions?.stop()){return;}
  if(busy&&!prompt.value.trim()&&!form.attachments?.count){if(event.submitter===send)await api.abort(activeId).catch(error=>toast(error.message));return;}
  if(opening)return;
  if(sessions?.isActive()){const t=prompt.value.trim();if(t){sessions.send(t);prompt.value='';send.disabled=true;saveView();}return;}
  if(form.modelSelection?.provider==='cli'){const t=prompt.value.trim();if(!t)return;prompt.value='';form.attachments?.clear();send.disabled=true;saveView();form.resizePrompt?.();if(!await sessions.start(form.modelSelection.model,t)){prompt.value=t;send.disabled=false;}return;}
  const text=prompt.value.trim()||(form.attachments?.count?'Please review the attached files.':'');if(!text)return;
  if(form.modelsDisabled){toast('Enable a model in Settings → Models first');return;}if(form.dataset.requireProject==='true'){toast('Choose a project above the composer first');return;}const inBackground=form.backgroundSubmit||form.backgroundIntent;if(!busy&&inBackground&&!preference('background-agents',true)){toast('Background agents are disabled in settings');return;}form.backgroundSubmit=false;
  let attachments;opening=true;try{attachments=await form.attachments?.payload();}catch(error){toast(error.message);return;}finally{opening=false;}
  if(busy){
   const textToSteer=text;if(form.workingSendMode==='Queue'){form.queueMessage({prompt:textToSteer,attachments,selection:{...form.modelSelection},approvalMode:form.approvalMode});prompt.value='';form.attachments?.clear();saveView();form.resizePrompt?.();syncRunning();return;}
   const target=visibleJob(),origin=activeId;
   prompt.value='';form.attachments?.clear();saveView();form.resizePrompt?.();syncRunning();
   try{await api.steer({threadId:origin,prompt:textToSteer,attachments});const bubble=target.addSteering(textToSteer,attachments);if(activeId===origin){transition.reveal(bubble,'user',0);bottom(true);}}catch(error){toast(error.message);if(activeId===origin&&!prompt.value){prompt.value=textToSteer;prompt.dispatchEvent(new Event('input'));}}return;
  }
  const entering=!workspace.classList.contains('thread-view'),origin=viewState.id;
  const id=inBackground||entering?'pending:'+crypto.randomUUID():activeId;
  const approvalMode=form.approvalMode||preference('approval-mode','Never ask');void form.recordAccessModeUsed?.(approvalMode);
  const selection=form.modelSelection||{effort:'low'};saveView();viewState.updateFor(id,{approvalMode});
  const node=inBackground?document.createElement('div'):history;node.className='thread-messages';node.querySelectorAll('.thread-run-error').forEach(e=>e.remove());
  const user=document.createElement('article');user.className='thread-message thread-user';user.textContent=text;node.append(user);messageActions.user(user,{text,timestamp:Date.now(),attachments});
  const job=createJob(id,header.hidden?text.slice(0,90):header.textContent,node);job.text=text;dismissStaleToast();
  if(entering||inBackground)addOptimistic(id,text);if(entering)viewState.updateFor(origin,{draft:''});
  if(!inBackground){if(entering){transition.cancel();viewState.select(id);viewState.update({model:selection});activeId=id;}threadView(job.title,entering);transition.reveal(user,'user',entering?undefined:0);}
  prompt.value='';form.attachments?.clear();viewState.update({draft:''});form.resizePrompt?.();syncRunning();bottom(true);
  const payload={prompt:text,...selection,approvalMode,attachments,clientId:id,...(!id.startsWith('pending:')?{threadId:id}:{})};
  void selectionReady.catch(()=>{}).then(()=>form.projectSelection).then(()=>(inBackground?api.runBackground(payload):api.run(payload))).then(result=>{adoptJob(job,result.threadId);job.finish(result);}).catch(error=>{
   if(job.id.startsWith('pending:')){optimisticThreads.delete(job.id);drawThreads();}job.finish(null,error);
   if(!isInterruption(error)&&inBackground)toast(displayRunError(error.message,job.provider));
  });
 },true);
 prompt.addEventListener('input',()=>{if(busy)send.disabled=false;});
}
