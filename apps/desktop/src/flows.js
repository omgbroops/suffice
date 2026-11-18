import {icon} from './ui.js';
import {preference} from './settings-preferences.js';
import './flows.css';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
const btn=(cls,text,aria)=>{const b=el('button',cls,text);b.type='button';if(aria)b.setAttribute('aria-label',aria);return b;};
const STATE={running:'Running',approval:'Needs approval',ended:'Done',failed:'Failed',cancelled:'Cancelled',interrupted:'Interrupted'};
const LIVE=new Set(['running','approval']),RESUMABLE=new Set(['failed','cancelled','interrupted']);
const tok=n=>n>=1e6?+(n/1e6).toFixed(1)+'M':n>=1e3?+(n/1e3).toFixed(1)+'k':String(n);
const ago=ts=>{const s=Math.max(0,(Date.now()-ts)/1000);return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d';};

// Workflows: run list, approval prompts and the per-run token budget, all from the backend flow engine (window.suffice.flow).
export function connectFlows({api,toast}){
 const nav=document.querySelector('.flows-nav'),workspace=document.querySelector('.workspace'),newSession=document.querySelector('.new-session');
 if(!nav||!workspace||!api.flow)return;
 const count=nav.querySelector('.flows-count'),view=el('section','flows-view');view.hidden=true;view.setAttribute('aria-label','Workflows');
 workspace.append(view);
 let isOpen_=false,underlay=[],runs=[],limit=0,flows=[],picked='',openId=null,detail=null,composing=false,draft={task:'',test:'',cwd:'',topic:''},busy=false;
 const motion=()=>!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const say=error=>toast(String(error?.message||error).replace(/^Error invoking remote method '[^']+': (Error: )?/,''));
 const guarded=p=>Promise.resolve(p).catch(say);
 const paint=()=>{const n=runs.filter(r=>r.state==='approval').length;count.textContent=String(n);count.hidden=!n;const label=n?`Workflows, ${n} need approval`:'Workflows';nav.setAttribute('aria-label',label);nav.title=label;};
 async function load(){
  try{const r=await api.flow.list();runs=r.runs;limit=r.limit;if(!flows.length){flows=(await api.flow.workflows()).flows;picked=picked||flows[0]?.id||'';}
   if(openId&&runs.some(x=>x.runId===openId))detail=await api.flow.detail(openId);}catch(e){say(e);}
  paint();if(isOpen_)render();
 }
 api.flow.onChange(()=>void load());

 function approvalCard(r){
  const a=r.approval,card=el('section','flow-approval');card.dataset.id=a.id;card.setAttribute('role','group');card.setAttribute('aria-label','Approval needed: '+a.name);
  card.append(el('div','flow-approval-title','Approval needed'),el('div','flow-approval-sub',`${a.name} in ${r.title}`));
  const d=a.details||{};if(d.plan){const pre=el('pre','flow-approval-body',String(d.plan));pre.tabIndex=0;pre.setAttribute('aria-label','Plan to approve');card.append(pre);}
  const row=el('div','flow-approval-actions'),yes=btn('issues-act issues-act--primary','Approve'),no=btn('issues-act','Deny');yes.dataset.act='approve';no.dataset.act='deny';
  for(const [b,ok] of [[yes,true],[no,false]])b.addEventListener('click',()=>{yes.disabled=no.disabled=true;void guarded(api.flow.approve(a.id,ok)).then(load);});
  row.append(yes,no);card.append(row);return card;
 }
 function bar(r){
  const wrap=el('span','flow-budget');wrap.title=`Tokens used this run, of ${tok(r.limit)} allowed`;
  const track=el('span','flow-budget-track'),fill=el('span','flow-budget-fill');const pct=r.limit?Math.min(100,r.tokens/r.limit*100):100;fill.style.width=pct+'%';fill.dataset.level=pct>=90?'high':'';track.append(fill);
  wrap.append(track,el('span','flow-budget-text',`${tok(r.tokens)} / ${tok(r.limit)}`));return wrap;
 }
 function row(r){
  const li=el('li','flow-item'),main=btn('flow-row');main.dataset.id=r.runId;main.dataset.state=r.state;main.setAttribute('aria-expanded',String(openId===r.runId));
  main.setAttribute('aria-label',`${r.title}, ${STATE[r.state]}`);
  const dot=el('span','flow-state');dot.dataset.state=r.state;
  main.append(dot,el('span','flow-title',r.title),el('span','flow-kind',flows.find(f=>f.id===r.workflow)?.name||r.workflow||''),el('span','flow-status',STATE[r.state]),bar(r),el('span','flow-age',ago(r.last)));
  main.addEventListener('click',()=>{openId=openId===r.runId?null:r.runId;detail=null;render();if(openId)void load();});
  const acts=el('span','flow-acts');
  if(LIVE.has(r.state)){const c=btn('issues-act','Cancel');c.dataset.act='cancel';c.setAttribute('aria-label','Cancel '+r.title);c.addEventListener('click',()=>void guarded(api.flow.cancel(r.runId)).then(load));acts.append(c);}
  if(RESUMABLE.has(r.state)){const c=btn('issues-act','Resume');c.dataset.act='resume';c.setAttribute('aria-label','Resume '+r.title);c.addEventListener('click',()=>void guarded(api.flow.resume(r.runId)).then(load));acts.append(c);}
  const head=el('div','flow-head-row');head.append(main,acts);li.append(head);
  if(r.reason){const e=el('div','flow-reason',r.reason);e.dataset.run=r.runId;li.append(e);}
  if(openId===r.runId){const t=el('ol','flow-timeline');t.setAttribute('aria-label','Steps');for(const s of detail?.timeline||[]){const l=el('li','flow-step');l.dataset.kind=s.kind;l.append(el('span','flow-step-mark'),el('span','',s.text));t.append(l);}if(!(detail?.timeline||[]).length)t.append(el('li','flow-step flow-step--none','No steps yet'));li.append(t);}
  return li;
 }
 function form(){
  const f=el('form','flow-form');f.setAttribute('aria-label','New workflow run');
  const kinds=el('div','flow-kinds');kinds.setAttribute('role','radiogroup');kinds.setAttribute('aria-label','Workflow');
  for(const w of flows){const b=btn('flow-kind-btn',w.name);b.setAttribute('role','radio');b.setAttribute('aria-checked',String(picked===w.id));b.dataset.id=w.id;b.title=w.note;b.addEventListener('click',()=>{picked=w.id;render();});kinds.append(b);}
  const cur=flows.find(w=>w.id===picked)||flows[0];f.append(kinds,el('div','flow-note',cur?.note||''));
  const field=(key,label,ph,area)=>{const w=el('label','flow-field');w.append(el('span','flow-label',label));const i=el(area?'textarea':'input','issue-input flow-input');if(area)i.rows=3;i.value=draft[key];i.placeholder=ph;i.dataset.field=key;i.addEventListener('input',()=>{draft[key]=i.value;});w.append(i);return w;};
  for(const k of cur?.fields||[]){if(k==='topic')f.append(field('topic','Topic','What to research',true));if(k==='task')f.append(field('task','Task','What to build',true));if(k==='test')f.append(field('test','Test command','npm test'));if(k==='cwd')f.append(field('cwd','Folder','Absolute path, optional'));}
  const row=el('div','flow-form-actions'),go=btn('issues-act issues-act--primary','Start run'),cancel=btn('issues-act','Cancel');go.type='submit';go.dataset.act='start';cancel.dataset.act='close-form';go.disabled=busy;
  cancel.addEventListener('click',()=>{composing=false;render();});row.append(go,cancel);f.append(row);
  f.addEventListener('submit',e=>{e.preventDefault();busy=true;go.disabled=true;void api.flow.start({workflow:picked,...draft}).then(r=>{composing=false;draft={task:'',test:'',cwd:'',topic:''};openId=r.runId;detail=null;return load();}).catch(say).finally(()=>{busy=false;render();});});
  return f;
 }
 function render(){
  const keep=document.activeElement?.dataset?.field,pos=view.querySelector('.issues-scroll')?.scrollTop||0;
  const head=el('header','issues-head'),t=el('h1','issues-title','Workflows');head.append(t,el('span','issues-sub',limit?`Budget ${tok(limit)} tokens per run`:'No token budget'));
  const bb=el('div','issues-bar'),n=el('span','flow-count-label',`${runs.length} ${runs.length===1?'run':'runs'}`),add=btn('issues-act issues-act--primary','New run');add.dataset.act='new';add.disabled=!flows.length;add.addEventListener('click',()=>{composing=!composing;render();view.querySelector('.flow-input')?.focus();});bb.append(n,add);
  const scroll=el('div','issues-scroll');
  if(composing)scroll.append(form());
  const asks=runs.filter(r=>r.approval);for(const r of asks)scroll.append(approvalCard(r));
  if(!runs.length&&!composing){const e=el('div','issues-empty');e.append(el('div','issues-empty-title','No runs yet'),el('div','issues-empty-note','Start a multi-step workflow with a test gate, approvals and a token budget.'));scroll.append(e);}
  else if(runs.length){const ul=el('ul','flow-list');for(const r of runs)ul.append(row(r));scroll.append(ul);}
  view.replaceChildren(head,bb,scroll);scroll.scrollTop=pos;
  if(keep)view.querySelector(`[data-field=${keep}]`)?.focus({preventScroll:true});
 }
 function open(){
  if(isOpen_){view.querySelector('.flow-row,.issues-act')?.focus();return;}
  if(workspace.classList.contains('issues-open'))document.querySelector('.issues-nav')?.click();
  if(workspace.classList.contains('needs-open'))document.querySelector('.needs-nav')?.click();
  isOpen_=true;
  underlay=[...workspace.querySelectorAll('.home,.thread-transcript,.thread-header')].map(element=>({element,inert:element.inert}));for(const {element} of underlay)element.inert=true;
  view.hidden=false;workspace.classList.add('flows-open');nav.setAttribute('aria-current','page');newSession?.removeAttribute('aria-current');
  render();void load();
  if(motion())view.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:150,easing:'cubic-bezier(.2,.8,.2,1)'});
  (view.querySelector('.issues-act')||view.querySelector('.issues-title')).focus?.({preventScroll:true});
 }
 function close(restoreFocus=true){
  if(!isOpen_)return;isOpen_=false;for(const {element,inert} of underlay)element.inert=inert;underlay=[];
  view.hidden=true;workspace.classList.remove('flows-open');nav.removeAttribute('aria-current');
  if(!workspace.classList.contains('thread-view'))newSession?.setAttribute('aria-current','page');
  if(restoreFocus)nav.focus({preventScroll:true});
 }
 document.addEventListener('click',event=>{
  if(event.target.closest?.('.flows-nav')){isOpen_?close():open();return;}
  if(isOpen_&&event.target.closest?.('.thread-row,.new-session,.brand-home,[data-action=settings],.needs-nav,.issues-nav'))close(false);
 },true);
 document.addEventListener('keydown',event=>{if(!isOpen_||event.key!=='Escape'||event.defaultPrevented||document.querySelector('.popover:not([hidden])'))return;event.preventDefault();if(composing){composing=false;render();}else close();});
 new MutationObserver(()=>{if(document.documentElement.classList.contains('settings-open'))close(false);}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 document.addEventListener('suffice-open-flows',open);
 void load();
}
