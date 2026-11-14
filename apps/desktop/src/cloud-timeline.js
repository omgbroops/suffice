// Timeline panel: saves of the app over time, select one, confirm, rewind code and database to it.
import {initial,reduce,codeText,dbText,testText,impact,migrations,canRewind} from './timeline-model.js';
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
const pad=n=>String(n).padStart(2,'0');
const clock=ms=>{const d=new Date(ms);return `${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const day=(ms,now=Date.now())=>new Date(ms).toDateString()===new Date(now).toDateString()?'Today':new Date(ms).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const plural=(n,w)=>`${n.toLocaleString('en-US')} ${w}${n===1?'':'s'}`;

// Real facade when a base URL is set (window.SUFFICE_API, localStorage suffice-api, ?api=), else the fake provider.
export function apiClient(provider){
 let base='';try{base=window.SUFFICE_API||localStorage.getItem('suffice-api')||new URLSearchParams(location.search).get('api')||'';}catch{}
 if(!base){
  const app=provider.app().vm_id,shape=()=>({app_id:app,head:null,saves:provider.timeline().map(e=>({save_id:e.id,name:e.label,created_at:new Date(e.created).toISOString(),code_bytes:100000,db_bytes:e.state.db_rows*200,memory_bytes:e.state.memory_mb*1e6}))});
  return {timeline:async()=>shape(),rewind:async id=>{provider.rewind(id,'inplace');return {...shape(),head:id};}};
 }
 const call=async(path,init)=>{const r=await fetch(base.replace(/\/$/,'')+path,init);let j=null;try{j=await r.json();}catch{}
  if(!r.ok)throw new Error(j?.error?.message||`The server answered ${r.status}.`);return j;};
 const app=encodeURIComponent(provider.app().vm_id);
 return {timeline:()=>call(`/v1/apps/${app}/timeline`),rewind:id=>call(`/v1/apps/${app}/rewind`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({save_id:id})})};
}

export function renderTimeline(body,provider,pending=null){
 const api=apiClient(provider);let st=initial();
 const pane=el('div','cloud-pane cloud-tl');pane.setAttribute('aria-busy','true');
 const status=el('p','cloud-tl-status');status.setAttribute('role','status');
 const list=el('ul','cloud-tl-list');list.setAttribute('role','listbox');list.setAttribute('aria-label','Saves, newest first');
 const dock=el('div','cloud-tl-dock');
 pane.append(status,list,dock);body.append(pane);
 const rows=new Map();
 const skeleton=()=>{list.replaceChildren();for(let i=0;i<5;i++){const li=el('li','cloud-tl-row cloud-tl-skel');li.append(el('span','cloud-tl-bar'),el('span','cloud-tl-bar cloud-tl-bar--short'));list.append(li);}};
 const message=(title,sub,retry)=>{list.replaceChildren();const box=el('li','cloud-tl-empty');box.append(el('strong','',title),el('span','',sub));if(retry){const b=el('button','button button--subtle cloud-action','Try again');b.type='button';b.addEventListener('click',load);box.append(b);}list.append(box);};

 function build(){
  rows.clear();list.replaceChildren();
  st.saves.forEach(s=>{
   const li=el('li','cloud-tl-row');li.id='tl-'+s.id;li.dataset.id=s.id;li.setAttribute('role','option');
   const when=el('div','cloud-tl-when');when.append(el('time','',clock(s.at)),el('span','',day(s.at)));
   const main=el('div','cloud-tl-main'),name=el('strong','cloud-tl-name',s.name);name.title=s.name;
   const facts=el('div','cloud-tl-facts');facts.append(el('span','',codeText(s)),el('span','',dbText(s)));
   const test=el('span','cloud-tl-test',testText(s));if(s.tests)test.dataset.status=s.tests.status;facts.append(test);
   main.append(name,facts);li.append(when,main);
   if(s.destructive){const w=el('span','cloud-tl-flag','Destructive migration');li.querySelector('.cloud-tl-main').append(w);}
   if(s.id===st.head)li.append(el('span','cloud-tl-head','Current'));
   li.addEventListener('click',()=>send({type:'select',id:s.id}));
   li.addEventListener('dblclick',()=>send({type:'ask'}));
   rows.set(s.id,li);list.append(li);
  });
 }
 function paint(){
  for(const [id,li]of rows){const on=id===st.selected;li.setAttribute('aria-selected',String(on));li.tabIndex=on?0:-1;li.dataset.confirming=String(on&&st.phase!=='idle');}
  if(st.selected)list.setAttribute('aria-activedescendant','tl-'+st.selected);
  dock.replaceChildren();status.textContent='';delete status.dataset.kind;
  const s=st.saves.find(x=>x.id===st.selected);
  if(st.phase==='done'){status.textContent=`Rewound to ${clock(st.saves.find(x=>x.id===st.head)?.at??Date.now())}. Code and database match that save. The state before is kept as a save.`;status.dataset.kind='done';}
  if(!s||st.phase==='idle'||st.phase==='done'){ if(s&&st.phase==='idle'&&canRewind(st))dock.append(bar(s));return;}
  dock.append(confirm(s));
 }
 function bar(s){
  const b=el('div','cloud-tl-bar-actions');
  const go=el('button','button button--subtle cloud-action',`Rewind to ${clock(s.at)}`);go.type='button';go.setAttribute('aria-haspopup','dialog');go.addEventListener('click',()=>send({type:'ask'}));b.append(go);return b;
 }
 function confirm(s){
  const im=impact(st.saves,s.id),box=el('div','cloud-tl-confirm');box.setAttribute('role','group');box.setAttribute('aria-label',`Confirm rewind to ${clock(s.at)}`);
  const busy=st.phase==='rewinding';
  box.append(el('strong','',`Rewind to ${clock(s.at)}, ${s.name}?`));
  const ul=el('ul','cloud-tl-changes');
  if(!im.gone)ul.append(el('li','','This is the current state. Nothing changes.'));
  else{
   ul.append(el('li','',`Code: ${im.files?`${plural(im.files,'file')} change back, +${im.added} −${im.removed} undone`:'code returns to this save'}.`));
   ul.append(el('li','',`Database: ${im.rows?`${plural(im.rows,'row')} written since then are removed`:'data returns to this save'}.`));
   ul.append(el('li','',`${plural(im.gone,'newer save')} stay on the timeline; the current state is saved first.`));
  }
  for(const t of migrations(st.saves,s.id,clock))ul.append(el('li','cloud-tl-warn',t));
  box.append(ul);
  if(st.phase==='failed')box.append(el('p','cloud-tl-error',`Rewind did not finish. ${String(st.error||'').replace(/[.\s]*$/,'')}${st.error?'. ':''}Nothing was changed.`));
  const act=el('div','cloud-confirm-actions');
  const yes=el('button','button button--primary cloud-action',busy?'Rewinding…':st.phase==='failed'?'Try again':'Rewind');yes.type='button';yes.disabled=busy||!im.gone;
  const no=el('button','button button--ghost cloud-action','Cancel');no.type='button';no.disabled=busy;
  yes.addEventListener('click',run);no.addEventListener('click',()=>{send({type:'cancel'});focusRow();});
  act.append(yes,no);box.append(act);
  if(busy){box.setAttribute('aria-busy','true');}
  queueMicrotask(()=>{if(!busy&&!box.contains(document.activeElement)&&(!im.gone?no:yes).isConnected)(!im.gone?no:yes).focus();});
  return box;
 }
 function focusRow(){rows.get(st.selected)?.focus({preventScroll:false});}
 function send(e){const was=st.selected;st=reduce(st,e);if(e.type==='load'){pane.removeAttribute('aria-busy');if(!st.saves.length){message('No saves yet','Saves appear here as your app changes.');dock.replaceChildren();return;}build();}
  if(e.type==='ok')build();paint();if(e.type==='move'||e.type==='select'){const r=rows.get(st.selected);if(e.type==='move')r?.focus();r?.scrollIntoView({block:'nearest'});}}
 async function run(){
  const id=st.selected;send({type:'start'});if(st.phase!=='rewinding')return;
  try{const res=await api.rewind(id);send({type:'ok',res});focusRow();}catch(error){send({type:'fail',message:error.message||'Unknown error.'});}
 }
 async function load(){skeleton();try{send({type:'load',res:await api.timeline()});if(pending&&st.saves.some(x=>x.id===pending)){send({type:'select',id:pending});send({type:'ask'});}}catch(error){pane.removeAttribute('aria-busy');message('Could not load saves',error.message||'The timeline did not answer.',true);}}
 list.addEventListener('keydown',event=>{
  const k=event.key;
  if(k==='ArrowDown'||k==='ArrowUp'){event.preventDefault();send({type:'move',delta:k==='ArrowDown'?1:-1});}
  else if(k==='Home'||k==='End'){event.preventDefault();send({type:'move',delta:k==='Home'?-1e9:1e9});}
  else if(k==='Enter'||k===' '){if(st.selected){event.preventDefault();send({type:'ask'});}}
 });
 pane.addEventListener('keydown',event=>{if(event.key==='Escape'&&st.phase!=='idle'&&st.phase!=='rewinding'){event.preventDefault();event.stopPropagation();send({type:'cancel'});focusRow();}});
 load();
 return {get state(){return st;}};
}
