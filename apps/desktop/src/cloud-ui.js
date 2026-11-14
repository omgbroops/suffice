// Cloud thread panels (Preview, Tests, Timeline) and the collapsed activity rows between messages.
import {icon} from './ui.js';
import {cloudProvider,clock,chips,previewHtml} from './cloud-data.js';
import {createToolWidget} from './tool-widget.js';

export const cloudTabs={preview:{label:'Preview',icon:'globe'},tests:{label:'Tests',icon:'check'},timeline:{label:'Timeline',icon:'history'}};
export const isCloudTab=type=>type in cloudTabs;
const el=(tag,cls='',text='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;};
const action=(label,onClick,cls='button button--subtle cloud-action')=>{const b=el('button',cls,label);b.type='button';b.addEventListener('click',onClick);return b;};
const seconds=ms=>`${(ms/1000).toFixed(1)} s`;
let pendingRewind=null; // set by "Rewind to <time>" on a test run, consumed by the Timeline tab

function preview(body,provider){
 const app=provider.app(),bar=el('div','panel-content-bar cloud-bar');
 const url=el('div','cloud-url');url.innerHTML=icon('globe');url.append(el('span','',app.address));url.title=`https://${app.address}`;
 const reload=action('',()=>{frame.srcdoc='';frame.srcdoc=previewHtml;},'button button--ghost');reload.innerHTML=icon('refresh');reload.setAttribute('aria-label','Reload preview');reload.title='Reload preview';
 bar.append(url,reload);
 const frame=el('iframe','cloud-frame');frame.title=`${app.name} preview`;frame.setAttribute('sandbox','');frame.srcdoc=previewHtml;
 body.append(bar,frame);
}

function runCard(run,provider,open){
 const card=el('article','cloud-card');card.dataset.status=run.passed?'passed':'failed';
 const head=el('header','cloud-card-head');
 const mark=el('span','cloud-mark');mark.innerHTML=icon(run.passed?'check':'close');mark.setAttribute('role','img');mark.setAttribute('aria-label',run.passed?'Passed':'Failed');
 const title=el('div','cloud-card-title');title.append(el('strong','',run.name),el('span','cloud-meta',`${run.passed?`${run.steps.length} of ${run.steps.length} passed`:'Failed'} · ${clock(run.created)}`));
 head.append(mark,title);card.append(head);
 const steps=el('ol','cloud-steps');
 for(const s of run.steps){const li=el('li','cloud-step');li.dataset.ok=String(s.ok);li.append(el('span','cloud-step-n',String(s.index+1)),el('span','cloud-step-text',s.action),el('span','cloud-step-ms',s.ok===null?'skipped':`${s.ms} ms`));steps.append(li);}
 card.append(steps);
 if(run.failing_step)card.append(el('p','cloud-reason',`Step ${run.failing_step.index+1} failed. ${run.failing_step.reason}`));
 const links=el('div','cloud-links');
 if(run.rewind_to){const e=provider.timeline().find(x=>x.id===run.rewind_to);links.append(action(`Rewind to ${clock(e.created)}`,()=>{pendingRewind=run.rewind_to;open('timeline');}));}
 const replay=el('ol','cloud-steps cloud-replay');replay.hidden=true;replay.setAttribute('aria-label',`Replay ${run.replay_id}`);
 for(const s of run.steps){const li=el('li','cloud-step');li.dataset.ok=String(s.ok);li.append(el('span','cloud-step-n',String(s.index+1)),el('span','cloud-step-text',s.action),el('span','cloud-step-ms',s.ok===null?'not run':s.ok?'ok':'failed'));replay.append(li);}
 const watch=action('Watch replay',()=>{replay.hidden=!replay.hidden;watch.textContent=replay.hidden?'Watch replay':'Hide replay';watch.setAttribute('aria-expanded',String(!replay.hidden));});watch.setAttribute('aria-expanded','false');
 const copy=action('Copy for your agent',async()=>{try{await navigator.clipboard.writeText(provider.agentPrompt(run));copy.textContent='Copied';}catch{copy.textContent='Copy failed';}setTimeout(()=>{copy.textContent='Copy for your agent';},1600);});
 links.append(watch,copy);card.append(links,replay);
 return card;
}
function tests(body,provider,open){
 const pane=el('div','cloud-pane');pane.setAttribute('aria-label','Agent test runs');
 for(const run of provider.runs())pane.append(runCard(run,provider,open));
 body.append(pane);
}

function timeline(body,provider){
 const pane=el('div','cloud-pane'),status=el('p','cloud-note');status.setAttribute('role','status');
 const list=el('ol','cloud-timeline');pane.append(status,list);body.append(pane);
 const triggerName={deploy:'Deploy',agent_edit:'Agent edit',save:'Saved'};
 function draw(openId=null,focusId=null){
  list.replaceChildren();
  for(const entry of provider.timeline()){
   const li=el('li','cloud-entry');li.dataset.id=entry.id;
   const row=el('div','cloud-entry-row');
   const info=el('div','cloud-entry-info');info.append(el('strong','',entry.label),el('span','cloud-chips',chips(entry).split(' · ').map(c=>c.replace(/ /g,'\u00a0')).join(' · ')));
   const when=el('div','cloud-entry-when');when.append(el('time','',clock(entry.created)),el('span','cloud-meta',entry.pinned?`${triggerName[entry.trigger]}\npinned`:triggerName[entry.trigger]));
   const trigger=action('Rewind here',()=>toggle(true),'button button--subtle cloud-action');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label',`Rewind to ${clock(entry.created)}`);trigger.textContent='Rewind here';
   row.append(info,when,trigger);li.append(row);
   const confirm=el('div','cloud-confirm');confirm.hidden=true;confirm.setAttribute('role','group');confirm.setAttribute('aria-label',`Confirm rewind to ${clock(entry.created)}`);
   confirm.append(el('p','',`Go back to ${clock(entry.created)}? Code, database and memory return to this state. The current state is saved first.`));
   const yes=action('Rewind',()=>{try{provider.rewind(entry.id,'inplace');status.textContent=`Rewound to ${clock(entry.created)}.`;pendingRewind=null;draw(null,entry.id);}catch(error){status.textContent=error.message;}},'button button--primary cloud-action');
   const no=action('Cancel',()=>toggle(false),'button button--ghost cloud-action');
   confirm.append(el('div','cloud-confirm-actions'));confirm.lastChild.append(yes,no);li.append(confirm);
   function toggle(show){confirm.hidden=!show;trigger.setAttribute('aria-expanded',String(show));li.dataset.confirming=String(show);if(show)yes.focus();else trigger.focus();}
   li.addEventListener('keydown',event=>{if(event.key==='Escape'&&!confirm.hidden){event.preventDefault();event.stopPropagation();toggle(false);}});
   list.append(li);
   if(entry.id===openId)toggle(true);
   if(entry.id===focusId)trigger.focus();
  }
 }
 draw(pendingRewind);
}

export function renderCloudTab(body,type,{threadId,open}){
 body.replaceChildren();const provider=cloudProvider(threadId);
 ({preview:()=>preview(body,provider),tests:()=>tests(body,provider,open),timeline:()=>timeline(body,provider)})[type]();
}

// Collapsed rows built from the tool row: a click opens the matching tab instead of expanding.
export function cloudActivity(threadId,open,index=0,last=true){
 const group=el('div','thread-cloud-rows');
 for(const item of cloudProvider(threadId).activity().filter(i=>last?i.after>=index:i.after===index)){
  const {element}=createToolWidget({type:'action',name:'cloud',text:'',output:'',done:true,isError:item.status==='error'});
  const summary=element.querySelector('summary');summary.textContent=item.text;summary.setAttribute('role','link');summary.dataset.tab=item.tab;summary.title=`Open ${cloudTabs[item.tab].label}`;
  element.dataset.status=item.status||'completed';element.classList.add('cloud-row');
  const go=event=>{event.preventDefault();open(item.tab);};
  summary.addEventListener('click',go);summary.addEventListener('keydown',event=>{if(event.key===' '||event.key==='Enter')go(event);});
  group.append(element);
 }
 return group;
}
