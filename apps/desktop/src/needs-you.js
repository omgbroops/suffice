import {getThreadDirectory,getSessionDirectory} from './thread-directory.js';
import {formatThreadTime} from './thread-row.js';
import {preference} from './settings-preferences.js';
import {displayRunError} from '../shared/run-error.mjs';
import {icon} from './ui.js';
import './needs-you.css';

import {collectNeeds,GROUPS} from './needs-collect.js';
const GLYPH={approval:'lock',input:'message',failed:'warning',done:'check'};
const DISMISS_KEY='suffice-needs-dismissed-v1';
const readDismissed=()=>{try{return JSON.parse(localStorage.getItem(DISMISS_KEY)||'{}');}catch{return {};}};
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};

export function connectNeedsYou({api,approvals,toast,retry,markRead}){
 const nav=document.querySelector('.needs-nav'),workspace=document.querySelector('.workspace'),newSession=document.querySelector('.new-session');
 if(!nav||!workspace)return;
 nav.hidden=false;
 const count=nav.querySelector('.needs-count');
 const view=el('section','needs-view');view.hidden=true;view.setAttribute('aria-label','Needs you');
 const head=el('header','needs-head');const title=el('h1','needs-title','Needs you');const total=el('span','needs-total');head.append(title,total);
 const scroll=el('div','needs-scroll');view.append(head,scroll);workspace.append(view);
 let isOpen=false,underlay=[],pending=false;
 const current=()=>collectNeeds({threads:getThreadDirectory().threads,sessions:getSessionDirectory(),dismissed:readDismissed()});
 const requestsFor=id=>approvals.pending().filter(event=>[event.threadId,event.clientId].includes(id));
 const motion=()=>!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;

 function reason(item){
  const {record}=item;
  if(item.group==='failed')return record.error?displayRunError(record.error,record.provider):'The run did not finish';
  if(item.group==='done')return 'Finished while you were away';
  if(record.status==='approval'){const request=requestsFor(record.id)[0];if(request){const input=request.input||{};return typeof input.command==='string'?input.command:request.name;}return 'Waiting for your approval';}
  return 'Waiting for your reply';
 }
 function actions(item){
  const {record}=item,list=[];
  if(item.group==='wait'&&record.status==='approval'&&item.kind==='thread'&&requestsFor(record.id).length)list.push(['approve','Approve',true],['deny','Deny']);
  if(item.group==='failed'&&record.canRetry)list.push(['retry','Retry',true]);
  list.push(['open','Open',!list.length]);
  if(item.group!=='wait')list.push(['dismiss','Dismiss']);
  return list;
 }
 function row(item){
  const {record}=item,li=el('li','needs-row');li.dataset.key=record.id;li.dataset.group=item.group;li.dataset.status=record.status;
  const state=el('span','needs-state');state.innerHTML=icon(GLYPH[record.status==='done'?'done':record.status]||'info');
  const body=el('div','needs-body');body.append(el('div','needs-row-title',record.title||'Untitled'));
  const why=el('div','needs-why',reason(item));if(record.status==='approval')why.classList.add('needs-mono');
  const meta=[record.project,record.agent,formatThreadTime(Math.max(0,Math.floor((Date.now()-record.modified)/1000)))].filter(Boolean).join(' · ');
  body.append(why,el('div','needs-meta',meta));
  const bar=el('div','needs-actions');
  for(const [act,label,primary] of actions(item)){const b=el('button','needs-act',label);b.type='button';b.dataset.act=act;b.dataset.key=record.id;if(primary)b.classList.add('needs-act--primary');b.setAttribute('aria-label',`${label}: ${record.title||'Untitled'}`);bar.append(b);}
  li.append(state,body,bar);return li;
 }
 function render(){
  pending=false;
  const items=current();
  count.textContent=String(items.length);count.hidden=!items.length;
  nav.setAttribute('aria-label',items.length?`Needs you, ${items.length} waiting`:'Needs you');nav.title=nav.getAttribute('aria-label');
  if(!isOpen)return;
  const focus=document.activeElement?.closest?.('.needs-view')?document.activeElement:null,keep=focus&&focus.dataset.act?[focus.dataset.key,focus.dataset.act]:null;
  total.textContent=items.length?String(items.length):'';
  scroll.replaceChildren();
  if(!items.length){const empty=el('div','needs-empty');empty.append(el('div','needs-empty-title','Nothing needs you'));scroll.append(empty);}
  for(const [group,label] of GROUPS){
   const these=items.filter(item=>item.group===group);if(!these.length)continue;
   const section=el('section','needs-group');const h=el('h2','needs-group-label');h.append(el('span','',label),el('span','needs-group-count',String(these.length)));
   const ul=el('ul','needs-list');for(const item of these)ul.append(row(item));section.append(h,ul);scroll.append(section);
  }
  if(keep){const target=[...scroll.querySelectorAll('.needs-act')].find(b=>b.dataset.key===keep[0]&&b.dataset.act===keep[1])||scroll.querySelector('.needs-act');target?.focus({preventScroll:true});}
 }
 const schedule=()=>{if(pending)return;pending=true;queueMicrotask(render);};
 document.addEventListener('suffice-thread-directory',schedule);document.addEventListener('suffice-approvals',schedule);
 setInterval(()=>{if(isOpen)render();},30000);

 function open(){
  if(isOpen){scroll.querySelector('.needs-act')?.focus();return;}
  isOpen=true;
  underlay=[...workspace.querySelectorAll('.home,.thread-transcript,.thread-header')].map(element=>({element,inert:element.inert}));for(const {element} of underlay)element.inert=true;
  view.hidden=false;workspace.classList.add('needs-open');nav.setAttribute('aria-current','page');newSession?.removeAttribute('aria-current');
  render();if(motion())view.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:150,easing:'cubic-bezier(.2,.8,.2,1)'});
  (scroll.querySelector('.needs-act')||view.querySelector('.needs-title')).focus?.({preventScroll:true});
 }
 function close(restoreFocus=true){
  if(!isOpen)return;isOpen=false;
  for(const {element,inert} of underlay)element.inert=inert;underlay=[];
  view.hidden=true;workspace.classList.remove('needs-open');nav.removeAttribute('aria-current');
  if(!workspace.classList.contains('thread-view'))newSession?.setAttribute('aria-current','page');
  if(restoreFocus)nav.focus({preventScroll:true});
 }
 const find=key=>current().find(item=>item.record.id===key);
 view.addEventListener('click',async event=>{
  const button=event.target.closest('.needs-act');if(!button)return;
  const item=find(button.dataset.key);if(!item)return;
  const {record}=item,act=button.dataset.act;
  if(act==='open'){close(false);item.kind==='session'?record.open():getThreadDirectory().open(record.id);return;}
  if(act==='retry'){close(false);if(!await retry(record.id))toast('Open the thread to retry it');return;}
  if(act==='dismiss'){if(item.group==='done')markRead(record.id);else{const map=readDismissed();map[record.id]=record.modified;try{localStorage.setItem(DISMISS_KEY,JSON.stringify(map));}catch{}}render();return;}
  if(act==='approve'||act==='deny'){
   button.disabled=true;
   try{for(const request of requestsFor(record.id))await api.approvalAnswer({threadId:request.threadId||request.clientId,requestId:request.requestId,allow:act==='approve'});}
   catch(error){toast(error.message);button.disabled=false;}
  }
 });
 document.addEventListener('click',event=>{
  if(event.target.closest?.('.needs-nav')){isOpen?close():open();return;}
  if(isOpen&&event.target.closest?.('.thread-row,.new-session,.brand-home,[data-action=settings]'))close(false);
 },true);
 document.addEventListener('keydown',event=>{if(isOpen&&event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('.popover:not([hidden])')){event.preventDefault();close();}});
 new MutationObserver(()=>{if(document.documentElement.classList.contains('settings-open'))close(false);}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 document.addEventListener('suffice-open-needs-you',open);
 render();
}
