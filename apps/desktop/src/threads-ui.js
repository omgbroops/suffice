import {threadViewState as viewState} from './thread-view-state.js';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {createThreadTransition} from './thread-transition.js';
import {groupActions,actionTitle} from './action-display.js';
import {connectDisclosureMotion} from './disclosure-motion.js';
import {createToolWidget,toolOutput} from './tool-widget.js';

const relativeTime=new Intl.RelativeTimeFormat(undefined,{numeric:'auto'});
function threadTime(timestamp){
 const seconds=Math.max(0,(Date.now()-timestamp)/1000);
 if(seconds<60)return 'just now';
 for(const [unit,size] of [['year',31536000],['month',2592000],['week',604800],['day',86400],['hour',3600],['minute',60]]){
  if(seconds>=size)return relativeTime.format(-Math.floor(seconds/size),unit);
 }
}

export function connectThreads({api,prompt,send,toast,ensureProject,ensureSignedIn}){
 const workspace=document.querySelector('.workspace'),form=document.querySelector('.composer');
 const transition=createThreadTransition(workspace,form);
 const newSession=document.querySelector('.new-session');newSession.setAttribute('aria-current','page');
 const list=document.querySelector('.sidebar-sessions');list.replaceChildren();
 document.querySelector('#sidebar-section-label').textContent='Recent';
 const transcript=document.createElement('section');transcript.className='thread-transcript';transcript.setAttribute('aria-label','Thread transcript');
 const history=document.createElement('div');history.className='thread-messages';transcript.append(history);workspace.append(transcript);
 connectDisclosureMotion(history);
 const header=document.createElement('header');header.className='thread-header';header.hidden=true;workspace.append(header);
 let busy=false,opening=false,current=null,streamed='',activeId=null,refreshVersion=0,previousMotion;
 let statusLine=null,reasoning='',renderFrame=0;const liveTools=new Map();let liveGroup=null,liveLog=null;
 let following=true,lastScrollTop=0,scrollFrame=0;
 const nearBottom=()=>transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<8;
 const bottom=(force=false)=>{if(force)following=true;if(!following)return;transcript.scrollTop=transcript.scrollHeight;if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(following){transcript.scrollTop=transcript.scrollHeight;lastScrollTop=transcript.scrollTop;}});};
 transcript.addEventListener('wheel',event=>{if(event.deltaY<0)following=false;},{passive:true});
 transcript.addEventListener('scroll',()=>{if(nearBottom())following=true;else if(transcript.scrollTop<lastScrollTop-1)following=false;lastScrollTop=transcript.scrollTop;},{passive:true});
 transcript.addEventListener('keydown',event=>{if(['PageUp','Home','ArrowUp'].includes(event.key))following=false;});
 let draftTimer,viewScrollTimer;
 function saveView(){clearTimeout(draftTimer);clearTimeout(viewScrollTimer);viewState.update({draft:prompt.value,scrollTop:transcript.scrollTop,following,...(form.modelSelection?{model:form.modelSelection}:{})});}
 function restoreView(){const state=viewState.state;prompt.value=state.draft;send.disabled=!prompt.value.trim();following=state.following;requestAnimationFrame(()=>{if(following)bottom(true);else{transcript.scrollTop=state.scrollTop;lastScrollTop=transcript.scrollTop;}});}
 prompt.value=viewState.state.draft;send.disabled=!prompt.value.trim();
 prompt.addEventListener('input',()=>{clearTimeout(draftTimer);draftTimer=setTimeout(saveView,180);});
 transcript.addEventListener('scroll',()=>{clearTimeout(viewScrollTimer);const id=viewState.id;viewScrollTimer=setTimeout(()=>{if(id===viewState.id&&id)viewState.update({scrollTop:transcript.scrollTop,following});},150);},{passive:true});
 window.addEventListener('beforeunload',saveView);
 new ResizeObserver(()=>bottom()).observe(history);
 new ResizeObserver(()=>{transcript.style.setProperty('--transcript-bottom-space',`${form.getBoundingClientRect().height+48}px`);bottom();}).observe(form);
 function threadView(title,animate=false){const change=()=>{if(!workspace.classList.contains('thread-view')){const canvas=workspace.querySelector('.atmosphere');previousMotion=canvas.dataset.motion;canvas.dataset.motion='paused';canvas.dispatchEvent(new Event('motion-change'));}workspace.classList.add('thread-view');newSession.removeAttribute('aria-current');header.textContent=title;header.hidden=false;};if(animate)transition.enter(change);else change();}
 function clear(){
  const wasThread=workspace.classList.contains('thread-view');
  const change=()=>{
   if(workspace.classList.contains('thread-view')){const canvas=workspace.querySelector('.atmosphere');if(previousMotion===undefined)delete canvas.dataset.motion;else canvas.dataset.motion=previousMotion;canvas.dispatchEvent(new Event('motion-change'));}
   workspace.classList.remove('thread-view');newSession.setAttribute('aria-current','page');header.hidden=true;history.replaceChildren();activeId=null;viewState.select(null);restoreView();
   list.querySelectorAll('.thread-row').forEach(row=>row.setAttribute('aria-pressed','false'));
  };
  if(wasThread)transition.leave(change);else{transition.cancel();change();}
 }

 const codeTimers=new WeakMap();
 function markdown(element,text){element.innerHTML=DOMPurify.sanitize(marked.parse(text),{USE_PROFILES:{html:true},ALLOW_DATA_ATTR:false,FORBID_TAGS:['img','video','audio','iframe','form','input','button','style'],FORBID_ATTR:['style','id','name']});
  clearTimeout(codeTimers.get(element));
  if(element.querySelector('pre code'))codeTimers.set(element,setTimeout(()=>{if(element.isConnected)void import('./code-highlight.js').then(({colorCode})=>Promise.all([...element.querySelectorAll('pre code')].map(code=>colorCode(code,'snippet.'+(code.className.match(/language-([\w+-]+)/)?.[1]||'text'))))).catch(()=>{});},120));
 }
 function plainReasoning(text){const node=document.createElement('div');markdown(node,text);return node.textContent.replace(/[*_`~]/g,'').replace(/^#{1,6}\s*/gm,'').split('\n').map(line=>line.trim()).filter(Boolean).at(-1)||'Working';}
 function status(text){if(statusLine){statusLine.textContent=text;statusLine.hidden=false;}}
 function flushMarkdown(){if(renderFrame){cancelAnimationFrame(renderFrame);renderFrame=0;}if(current)markdown(current,streamed);}
 function message(role,text){const element=document.createElement('article');element.className=`thread-message thread-${role}`;if(role==='assistant')markdown(element,text);else element.textContent=text;history.append(element);bottom();return element;}
 function renderMessages(messages){
  history.replaceChildren();
  let activity=null,activityLog=null;
  function detail(label,text){
   if(!text?.trim())return;
   if(!activity){
    activity=document.createElement('details');activity.className='thread-activity';
    const summary=document.createElement('summary');summary.textContent='Reasoning';
    activityLog=document.createElement('div');activityLog.className='thread-activity-log';activity.append(summary,activityLog);history.append(activity);
   }
   if(label!=='Reasoning')activity.querySelector('summary').textContent='Work';
   const item=document.createElement('details');item.className='thread-detail';
   const summary=document.createElement('summary');summary.textContent=label;
   const pre=document.createElement('pre');pre.textContent=text;item.append(summary,pre);activityLog.append(item);return item;
  }
  for(const entry of groupActions(messages)){
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
 function addOptimistic(id,title,project=document.querySelector('.project-picker')?.textContent.trim()||'Project'){
  optimisticThreads.set(id,{id,title:title.slice(0,90),project,modified:Date.now()});drawThreads();
 }
 function adoptOptimistic(previous,id){const thread=optimisticThreads.get(previous);if(thread){optimisticThreads.delete(previous);optimisticThreads.set(id,{...thread,id});}}
 async function refresh(){
  const version=++refreshVersion,threads=await api.threads();if(version!==refreshVersion)return;
  savedThreads=threads;for(const thread of threads)optimisticThreads.delete(thread.id);drawThreads();
 }
 function drawThreads(){
  const threads=[...optimisticThreads.values(),...savedThreads.filter(thread=>!optimisticThreads.has(thread.id))].sort((a,b)=>b.modified-a.modified);
  list.replaceChildren();
  for(const thread of threads){
   const row=document.createElement('button');row.type='button';row.className='thread-row session-row session-row--sidebar';row.dataset.thread=thread.id;row.dataset.project=thread.project;row.setAttribute('aria-pressed',String(thread.id===activeId));row.title=`${thread.title} · ${thread.project}`;
   const dot=document.createElement('span');dot.className='list-dot';dot.textContent='·';dot.setAttribute('aria-hidden','true');
   const content=document.createElement('span');content.className='row-content';
   const name=document.createElement('span');name.className='row-title';name.textContent=thread.title;
   const time=document.createElement('time');time.className='row-meta';time.dateTime=new Date(thread.modified).toISOString();time.textContent=threadTime(thread.modified);time.title=new Date(thread.modified).toLocaleString();content.append(name,time);row.append(dot,content);
   row.addEventListener('click',async()=>{
    if(busy){toast('Stop the current task before switching threads.');return;}
    if(opening)return;opening=true;saveView();
    try{
     const selected=await api.openThread(thread.id);saveView();document.dispatchEvent(new Event('suffice:usage-change'));activeId=thread.id;viewState.select(thread.id);following=false;threadView(selected.title,!workspace.classList.contains('thread-view'));renderMessages(selected.messages);
     restoreView();list.querySelectorAll('.thread-row').forEach(el=>el.setAttribute('aria-pressed',String(el===row)));
    }catch(error){toast(error.message);}finally{opening=false;}
   });list.append(row);
  }
 }
 api.onEvent(event=>{
  if(event.event==='background_started'){adoptOptimistic(event.clientId,event.threadId);if(!optimisticThreads.has(event.threadId))addOptimistic(event.threadId,event.title||'New session',event.project);drawThreads();void refresh().catch(()=>{});return;}
  if(event.event==='background_completed'){void refresh().catch(()=>{});return;}
  if(!busy)return;
  if(event.event==='thread_started'){adoptOptimistic(activeId,event.id);activeId=event.id;viewState.adopt(event.id);drawThreads();void refresh().catch(()=>{});}
  const pinned=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<100;
  if(event.event==='assistant_start'){reasoning='';if(streamed){flushMarkdown();current=null;streamed='';}status('Working');}
  if(event.event==='text'){if(!current){current=message('assistant','');history.insertBefore(current,statusLine);liveGroup=null;liveLog=null;}streamed+=event.text;statusLine.hidden=true;if(!renderFrame)renderFrame=requestAnimationFrame(()=>{renderFrame=0;if(current)markdown(current,streamed);if(pinned)bottom();});}
  if(event.event==='reasoning'){reasoning+=event.text||'';status(plainReasoning(reasoning));}
  if(event.event==='tool')status(`Running ${event.name}`);
  if(event.event==='tool_start'){flushMarkdown();if(current&&!streamed)current.remove();current=null;streamed='';if(!liveGroup){liveGroup=document.createElement('details');liveGroup.className='thread-activity';const summary=document.createElement('summary');summary.textContent='Work';liveLog=document.createElement('div');liveLog.className='thread-activity-log';liveGroup.append(summary,liveLog);history.insertBefore(liveGroup,statusLine);}const widget=createToolWidget({name:event.name,text:JSON.stringify(event.input||{},null,2),done:false});liveTools.set(event.id,widget);liveLog.append(widget.element);status(`Running ${event.name}`);reasoning='';if(pinned)bottom();}
  if(event.event==='tool_output'||event.event==='tool_end'){liveTools.get(event.id)?.update(toolOutput(event.result),event.isError,event.event!=='tool_end');if(pinned)bottom();if(event.event==='tool_end')status('Working');}
 });
 api.status().then(()=>refresh()).catch(error=>toast(error.message));
 document.addEventListener('click',async event=>{
  const control=event.target.closest('[data-action]');if(!control)return;
  if(control.dataset.action==='repo-menu'){
   event.preventDefault();event.stopImmediatePropagation();
   try{const project=await api.chooseProject();if(project){clear();control.title=project.path;control.setAttribute('aria-label',`Project: ${project.name}`);toast(project.name);await refresh();}}catch(error){toast(error.message);}return;
  }
  if(control.dataset.action==='new'){
   event.preventDefault();event.stopImmediatePropagation();
   try{if(busy){await api.abort();return;}saveView();await api.reset();document.dispatchEvent(new Event('suffice:usage-change'));clear();await refresh();}catch(error){toast(error.message);}return;
  }
  if(control.dataset.action==='done'){event.preventDefault();event.stopImmediatePropagation();toast('Thread archive is not connected yet.');}
 },true);
 form.addEventListener('submit',async event=>{
  event.preventDefault();event.stopImmediatePropagation();
  if(busy){await api.abort().catch(error=>toast(error.message));return;}
  if(opening)return;
  if(!workspace.classList.contains('thread-view')||!form.modelSelection){
   // no project or (with no chosen model) no sign-in yet: ask for it in place, then send the same draft
   opening=true;let ready=true;try{if(ensureProject&&!workspace.classList.contains('thread-view'))ready=await ensureProject();if(ready&&ensureSignedIn&&!form.modelSelection)ready=await ensureSignedIn();}finally{opening=false;}if(!ready){prompt.focus();return;}
  }
  const text=prompt.value.trim()||(form.attachments?.count?'Please review the attached files.':'');if(!text)return;
  const inBackground=form.backgroundSubmit||form.backgroundIntent;form.backgroundSubmit=false;
  let attachments;opening=true;try{attachments=await form.attachments?.payload();}catch(error){toast(error.message);return;}finally{opening=false;}
  if(inBackground){
   const selection=form.modelSelection||{effort:'low'},origin=viewState.id;
   const clientId='pending:'+crypto.randomUUID();addOptimistic(clientId,text);
   prompt.value='';form.attachments?.clear();saveView();send.disabled=true;
   void api.runBackground({prompt:text,...selection,attachments,clientId}).then(result=>{if(result.threadId)adoptOptimistic(clientId,result.threadId);return refresh().catch(()=>{});}).catch(error=>{optimisticThreads.delete(clientId);drawThreads();toast(error.message);if(viewState.id===origin&&!prompt.value){prompt.value=text;prompt.dispatchEvent(new Event('input'));}});
   return;
  }
  busy=true;form.setRunning(true);form.attachments?.clear();
  const entering=!workspace.classList.contains('thread-view');saveView();viewState.update({draft:''});if(entering){const model=form.modelSelection;viewState.select('pending:'+crypto.randomUUID());if(model)viewState.update({model});activeId=viewState.id;addOptimistic(activeId,text);}busy=true;threadView(header.hidden?text.slice(0,90):header.textContent,entering);const userMessage=message('user',text);current=message('assistant','');statusLine=document.createElement('div');statusLine.className='thread-status';statusLine.setAttribute('role','status');statusLine.textContent='Working';history.append(statusLine);liveTools.clear();liveGroup=null;liveLog=null;reasoning='';transition.reveal(userMessage,'user',entering?undefined:0);if(entering)transition.reveal(statusLine,'assistant');bottom(true);streamed='';prompt.value='';form.resizePrompt?.();
  send.disabled=false;
  const selection=form.modelSelection||{effort:'low'};
  try{const result=await api.run({prompt:text,...selection,attachments});if(!current){current=message('assistant','');history.insertBefore(current,statusLine);}flushMarkdown();markdown(current,result.text);if(result.threadId){adoptOptimistic(activeId,result.threadId);activeId=result.threadId;viewState.adopt(result.threadId);}}
  catch(error){if(activeId?.startsWith('pending:')){optimisticThreads.delete(activeId);drawThreads();}if(renderFrame){cancelAnimationFrame(renderFrame);renderFrame=0;}if(!current){current=message('assistant','');history.insertBefore(current,statusLine);}current.textContent=error.message;}
  finally{
   statusLine?.remove();statusLine=null;busy=false;current=null;form.setRunning(false);send.disabled=!prompt.value.trim();
   saveView();document.dispatchEvent(new Event('suffice:usage-change'));document.dispatchEvent(new Event('suffice:thread-updated'));await refresh().catch(error=>toast(error.message));bottom();
  }
 },true);
 prompt.addEventListener('input',()=>{if(busy)send.disabled=false;});
}
