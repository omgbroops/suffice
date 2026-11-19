import {preference} from './settings-preferences.js';
import './computer.css';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
const btn=(cls,text,aria)=>{const b=el('button',cls,text);b.type='button';if(aria)b.setAttribute('aria-label',aria);return b;};
const STATE={running:'Running',approval:'Needs approval',done:'Done',failed:'Failed',cancelled:'Cancelled',interrupted:'Interrupted'};
const LIVE=new Set(['running','approval']);
const STOP={max_steps:'Stopped after too many steps',max_time:'Stopped: out of time',max_failures:'Stopped after repeated failures',loop:'Stopped: the agent was repeating itself',stopped:'Stopped',aborted:'Cancelled',open_failed:'Could not open the page',journal_failed:'Could not record the steps',error:'The run failed'};
const TAG={credential:'Credential',payment:'Payment',destructive:'Destructive',send:'Sends something',download:'Download','navigation-external':'Leaves the site',system:'System','injection-suspect':'Page looks like instructions'};
const VERB={click:'Click',type:'Type',press:'Press',navigate:'Open',scroll:'Scroll',wait:'Wait',key:'Key'};
const ago=ts=>{const s=Math.max(0,(Date.now()-ts)/1000);return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d';};
const host=u=>{try{return new URL(u).host;}catch{return u;}};
const tags=list=>{const w=el('span','cu-tags');for(const t of list||[]){const c=el('span','cu-tag',TAG[t]||t);c.dataset.tag=t;w.append(c);}return w;};

// Computer use: session list, replay strip of every action, and the approval prompt for risky ones, from the backend agent (window.sufficeDesktop.computer).
export function connectComputer({api,toast}){
 const nav=document.querySelector('.computer-nav'),workspace=document.querySelector('.workspace'),newSession=document.querySelector('.new-session');
 const bridge=api.computer;
 if(!nav||!workspace||!bridge)return;
 const count=nav.querySelector('.computer-count'),view=el('section','computer-view');view.hidden=true;view.setAttribute('aria-label','Computer use');
 workspace.append(view);
 let isOpen_=false,underlay=[],runs=[],openId=null,detail=null,composing=false,draft={goal:'',url:''},formError='',busy=false;
 const enabled=()=>!!preference('computer-use',false);
 const motion=()=>!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const clean=error=>String(error?.message||error).replace(/^Error invoking remote method '[^']+': (Error: )?/,'');
 const say=error=>{formError=clean(error);toast(formError);};
 const guarded=p=>Promise.resolve(p).catch(say);
 const paint=()=>{nav.hidden=!enabled()&&!isOpen_;const n=runs.filter(r=>r.state==='approval').length;count.textContent=String(n);count.hidden=!n;nav.setAttribute('aria-label',n?`Computer use, ${n} need approval`:'Computer use');};
 async function load(){
  try{runs=(await bridge.list()).runs;if(openId&&runs.some(x=>x.runId===openId))detail=await bridge.detail(openId);}catch(e){say(e);}
  paint();if(isOpen_)render();
 }
 bridge.onChange(()=>void load());
 document.addEventListener('suffice-preference',e=>{if(e.detail?.id==='computer-use'){paint();if(isOpen_)render();}});

 function approvalCard(r){
  const a=r.approval,card=el('section','cu-approval');card.dataset.id=a.id;card.setAttribute('role','group');card.setAttribute('aria-label','Approval needed: '+a.action);
  card.append(el('div','cu-approval-title','Approval needed'),el('div','cu-approval-sub',`${VERB[a.action]||a.action}${a.target?' "'+a.target+'"':''} on ${host(r.start)}`));
  if(a.tags.length)card.append(tags(a.tags));
  if(a.reason)card.append(el('div','cu-approval-reason',a.reason==='injection-suspect'?'This page contains text that looks like instructions to the agent.':a.reason));
  card.append(el('div','cu-approval-goal','Goal: '+r.goal));
  const row=el('div','cu-approval-actions'),yes=btn('issues-act issues-act--primary','Allow'),no=btn('issues-act','Deny');yes.dataset.act='allow';no.dataset.act='deny';
  for(const [b,ok] of [[yes,true],[no,false]])b.addEventListener('click',()=>{yes.disabled=no.disabled=true;void guarded(bridge.approve(a.id,ok)).then(load);});
  row.append(yes,no);card.append(row);return card;
 }
 function strip(steps){
  const ol=el('ol','cu-strip');ol.setAttribute('aria-label','Replay of actions');ol.tabIndex=0;
  for(const s of steps){
   const li=el('li','cu-step');li.dataset.state=!s.approved?'denied':s.ok?'ok':'bad';
   li.setAttribute('aria-label',`Step ${s.step}: ${VERB[s.action]||s.action} ${s.targetName||''}, ${!s.approved?'denied':s.ok?'done':'failed'}`);
   const head=el('div','cu-step-head');head.append(el('span','cu-step-n',String(s.step)),el('span','cu-step-mark'));
   li.append(head,el('div','cu-step-action',(VERB[s.action]||String(s.action))+(s.ref?' '+s.ref:'')),el('div','cu-step-target',s.targetName||s.reason||''));
   if(s.snap){const pre=el('pre','cu-step-snap',s.snap);pre.tabIndex=0;pre.setAttribute('aria-label','Snapshot for step '+s.step);li.append(pre);}
   if(s.riskTags?.length)li.append(tags(s.riskTags));
   if(!s.approved)li.append(el('div','cu-step-note','Denied'));else if(!s.ok&&s.reason)li.append(el('div','cu-step-note',s.reason));
   ol.append(li);
  }
  return ol;
 }
 function row(r){
  const li=el('li','cu-item'),main=btn('cu-row');main.dataset.id=r.runId;main.dataset.state=r.state;main.setAttribute('aria-expanded',String(openId===r.runId));
  main.setAttribute('aria-label',`${r.goal}, ${STATE[r.state]}`);
  const dot=el('span','cu-state');dot.dataset.state=r.state;
  main.append(dot,el('span','cu-title',r.goal),el('span','cu-host',host(r.start)),el('span','cu-status',STATE[r.state]),el('span','cu-steps-count',`${r.stepCount} ${r.stepCount===1?'step':'steps'}`),el('span','cu-age',ago(r.last)));
  main.addEventListener('click',()=>{openId=openId===r.runId?null:r.runId;detail=null;render();if(openId)void load();});
  const head=el('div','cu-head-row');head.append(main);
  if(LIVE.has(r.state)){const c=btn('issues-act','Cancel');c.dataset.act='cancel';c.setAttribute('aria-label','Cancel '+r.goal);c.addEventListener('click',()=>void guarded(bridge.cancel(r.runId)).then(load));head.append(c);}
  li.append(head);
  const why=r.state==='failed'?(r.error||STOP[r.stopReason]||'The run failed'):r.state==='interrupted'?(r.awaiting?'The app closed before you answered. The action was not taken.':'The app closed while this was running'):r.state==='cancelled'?null:null;
  if(why)li.append(el('div','cu-reason',why));
  if(openId===r.runId){
   const box=el('div','cu-detail');
   if(detail?.replayed)box.append(el('div','cu-replayed','Replayed from a saved run: no model calls'));
   box.append(detail?.steps?.length?strip(detail.steps):el('div','cu-none',LIVE.has(r.state)?'Waiting for the first action':'No actions were taken'));
   if(detail?.answer)box.append(el('div','cu-answer',detail.answer));
   li.append(box);
  }
  return li;
 }
 function form(){
  const f=el('form','cu-form');f.setAttribute('aria-label','New computer use session');
  const field=(key,label,ph,area)=>{const w=el('label','cu-field');w.append(el('span','cu-label',label));const i=el(area?'textarea':'input','issue-input cu-input');if(area)i.rows=3;else i.type='text';i.value=draft[key];i.placeholder=ph;i.dataset.field=key;i.addEventListener('input',()=>{draft[key]=i.value;});w.append(i);return w;};
  f.append(field('goal','Goal','What should the agent do',true),field('url','Start page','https://example.com'));
  if(formError){const er=el('div','cu-error',formError);er.setAttribute('role','alert');f.append(er);}
  const row=el('div','cu-form-actions'),go=btn('issues-act issues-act--primary','Start'),cancel=btn('issues-act','Cancel');go.type='submit';go.dataset.act='start';cancel.dataset.act='close-form';
  cancel.addEventListener('click',()=>{composing=false;render();});row.append(go,cancel);f.append(row);
  f.addEventListener('submit',e=>{e.preventDefault();formError='';busy=true;go.disabled=true;void bridge.start({...draft}).then(r=>{composing=false;draft={goal:'',url:''};openId=r.runId;detail=null;},e=>{formError=clean(e);}).finally(()=>{busy=false;void load();});});
  return f;
 }
 function render(){
  const keep=document.activeElement?.dataset?.field,pos=view.querySelector('.issues-scroll')?.scrollTop||0;
  const head=el('header','issues-head'),t=el('h1','issues-title','Computer use');head.append(t,el('span','issues-sub','An agent drives a web page. Risky steps wait for you.'));
  const bb=el('div','issues-bar'),n=el('span','cu-count-label',`${runs.length} ${runs.length===1?'session':'sessions'}`),add=btn('issues-act issues-act--primary','New session');add.dataset.act='new';add.disabled=composing||busy||!enabled();
  add.addEventListener('click',()=>{composing=true;formError='';render();view.querySelector('[data-field=goal]')?.focus();});bb.append(n,add);
  const scroll=el('div','issues-scroll');
  if(!enabled()){const e=el('div','issues-empty');e.append(el('div','issues-empty-title','Computer use is off'),el('div','issues-empty-note','Turn it on in Settings, Agent behavior, to start sessions.'));const go=btn('issues-act issues-act--primary','Open settings');go.dataset.act='settings';go.addEventListener('click',()=>document.querySelector('[data-action=settings]')?.click());e.append(go);scroll.append(e);}
  else{
   if(composing)scroll.append(form());
   for(const r of runs.filter(x=>x.approval))scroll.append(approvalCard(detail?.runId===r.runId?{...r,...detail}:r));
   if(!runs.length&&!composing){const e=el('div','issues-empty');scroll.append(e);e.append(el('div','issues-empty-title','No sessions yet'),el('div','issues-empty-note','Give the agent a goal and a start page. Every action shows up here as it happens.'));}
   else if(runs.length){const ul=el('ul','cu-list');for(const r of runs)ul.append(row(r));scroll.append(ul);}
  }
  view.replaceChildren(head,bb,scroll);scroll.scrollTop=pos;
  if(keep)view.querySelector(`[data-field=${keep}]`)?.focus({preventScroll:true});
 }
 function open(){
  if(isOpen_){view.querySelector('.cu-row,.issues-act')?.focus();return;}
  if(document.documentElement.classList.contains('settings-open'))document.querySelector('[data-action=settings]')?.click();
  for(const n of ['issues-open','needs-open','flows-open'])if(workspace.classList.contains(n))document.querySelector('.'+n.replace('-open','-nav'))?.click();
  isOpen_=true;
  underlay=[...workspace.querySelectorAll('.home,.thread-transcript,.thread-header')].map(element=>({element,inert:element.inert}));for(const {element} of underlay)element.inert=true;
  view.hidden=false;nav.hidden=false;workspace.classList.add('computer-open');nav.setAttribute('aria-current','page');newSession?.removeAttribute('aria-current');
  render();void load();
  if(motion())view.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:150,easing:'cubic-bezier(.2,.8,.2,1)'});
  (view.querySelector('.issues-act')||view.querySelector('.issues-title')).focus?.({preventScroll:true});
 }
 function close(restoreFocus=true){
  if(!isOpen_)return;isOpen_=false;for(const {element,inert} of underlay)element.inert=inert;underlay=[];
  view.hidden=true;workspace.classList.remove('computer-open');nav.removeAttribute('aria-current');paint();
  if(!workspace.classList.contains('thread-view'))newSession?.setAttribute('aria-current','page');
  if(restoreFocus&&!nav.hidden)nav.focus({preventScroll:true});
 }
 document.addEventListener('click',event=>{
  if(event.target.closest?.('.computer-nav')){isOpen_?close():open();return;}
  if(isOpen_&&event.target.closest?.('.thread-row,.new-session,.brand-home,[data-action=settings],.needs-nav,.issues-nav,.flows-nav'))close(false);
 },true);
 document.addEventListener('keydown',event=>{if(!isOpen_||event.key!=='Escape'||event.defaultPrevented||document.querySelector('.popover:not([hidden])'))return;event.preventDefault();if(composing){composing=false;render();}else close();});
 new MutationObserver(()=>{if(document.documentElement.classList.contains('settings-open'))close(false);}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 document.addEventListener('suffice-open-computer',()=>{if(enabled())open();else toast('Turn on Computer use in Settings first');});
 paint();void load();
}
