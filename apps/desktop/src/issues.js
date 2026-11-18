import {getThreadDirectory} from './thread-directory.js';
import {icon} from './ui.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {preference} from './settings-preferences.js';
import {STATUSES,PRIORITIES,label,isOpen,code,groupIssues,ago,threadPrompt} from './issues-model.js';
import './issues.css';

const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
const btn=(cls,text,aria)=>{const b=el('button',cls,text);b.type='button';if(aria)b.setAttribute('aria-label',aria);return b;};
const svg=(body,size=14)=>`<svg class="issue-glyph" width="${size}" height="${size}" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${body}</svg>`;
const STATUS_SVG={
 backlog:svg('<circle cx="7" cy="7" r="5.25" stroke-dasharray="2 2"/>'),
 todo:svg('<circle cx="7" cy="7" r="5.25"/>'),
 progress:svg('<circle cx="7" cy="7" r="5.25"/><path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" stroke="none"/>'),
 review:svg('<circle cx="7" cy="7" r="5.25"/><path d="M7 7V3.5a3.5 3.5 0 1 1-3.5 3.5z" fill="currentColor" stroke="none"/>'),
 done:svg('<circle cx="7" cy="7" r="6.3" fill="currentColor" stroke="none"/><path d="m4.4 7.2 1.8 1.8 3.4-3.6" stroke="var(--issue-on-fill)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
 canceled:svg('<circle cx="7" cy="7" r="5.25"/><path d="m5 5 4 4m0-4-4 4" stroke-linecap="round"/>')
};
const bars=level=>svg([4,7.5,11].map((h,i)=>`<rect x="${1.5+i*4}" y="${12.5-h}" width="3" height="${h}" rx="1" fill="currentColor" stroke="none" opacity="${i<level?1:.25}"/>`).join(''));
const PRIORITY_SVG={none:bars(0),low:bars(1),medium:bars(2),high:bars(3),urgent:svg('<rect x="1.5" y="1.5" width="11" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M7 4v3.6" stroke="var(--issue-on-fill)" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="9.7" r=".9" fill="var(--issue-on-fill)" stroke="none"/>')};
const FALLBACK_AGENTS=[{id:'claude',label:'Claude'},{id:'codex',label:'Codex'}];
const THREAD_GLYPH={approval:'lock',input:'message',failed:'warning',done:'check'};

export function connectIssues({api,toast}){
 const nav=document.querySelector('.issues-nav'),workspace=document.querySelector('.workspace'),newSession=document.querySelector('.new-session'),form=document.querySelector('.composer'),prompt=document.querySelector('#prompt');
 if(!nav||!workspace||!api.issues)return;
 const count=nav.querySelector('.issues-count');
 const view=el('section','issues-view');view.hidden=true;view.setAttribute('aria-label','Issues');
 const listPage=el('div','issues-page issues-list-page'),detailPage=el('div','issues-page issues-detail-page');detailPage.hidden=true;
 view.append(listPage,detailPage);workspace.append(view);
 const menu=el('div','popover issues-menu');menu.hidden=true;menu.setAttribute('role','menu');document.body.append(menu);
 let isOpen_=false,underlay=[],issues=[],projectId='',tab='open',openId=null,agents=FALLBACK_AGENTS,queue=Promise.resolve(),started=null,loaded=false;
 const collapsed=new Set(['done','canceled']);
 const motion=()=>!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const projectName=()=>document.querySelector('.project-picker .project-name')?.textContent||'';
 const agentName=id=>agents.find(a=>a.id===id)?.label||id;
 const byId=id=>issues.find(i=>i.id===id);
 void api.sessions?.available?.().then(a=>{const list=(a?.agents||[]).filter(x=>!x.missing).map(x=>({id:x.id,label:x.label||x.id}));if(list.length)agents=list;}).catch(()=>{});

 // Every write goes through one queue so a blur-save and a click cannot overtake each other.
 const save=(id,patch)=>queue=queue.catch(()=>{}).then(async()=>{const next=await api.issues.update({id,patch});const at=issues.findIndex(i=>i.id===id);if(at>=0)issues[at]=next;paintCount();return next;});
 const say=error=>toast(String(error?.message||error).replace(/^Error invoking remote method '[^']+': (Error: )?/,''));
 const guarded=promise=>promise.catch(say);
 const paintCount=()=>{const n=issues.filter(isOpen).length;count.textContent=String(n);count.hidden=!n;nav.setAttribute('aria-label',n?`Issues, ${n} open`:'Issues');nav.title=nav.getAttribute('aria-label');};
 async function load(){
  projectId=document.documentElement.dataset.projectId||'';
  if(!projectId){issues=[];loaded=true;paintCount();if(isOpen_)render();return;}
  const wanted=projectId;
  try{const next=await api.issues.list(wanted);if(wanted===projectId){issues=next;loaded=true;}}catch(error){say(error);}
  paintCount();if(isOpen_)render();
 }

 // ---- menus
 const closeMenu=()=>{if(!menu.hidden)hidePopover(menu);};
 function pick(anchor,options,current,onPick,title){
  menu.replaceChildren();if(title)menu.append(el('div','popover-heading',title));
  for(const o of options){const item=btn('menu-item',null);item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(o.value===current));if(o.glyph){const g=el('span','issue-menu-glyph');g.dataset.status=o.value;g.innerHTML=o.glyph;item.append(g);}item.append(el('span','',o.label));item.insertAdjacentHTML('beforeend',icon('check','menu-check'+(o.value===current?'':' menu-check--empty')));item.addEventListener('click',()=>{closeMenu();anchor.focus({preventScroll:true});onPick(o.value);});menu.append(item);}
  const rect=anchor.getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(rect.left-4,innerWidth-250))}px`;menu.style.top=`${Math.min(rect.bottom+4,innerHeight-Math.min(360,options.length*34+50))}px`;menu.style.setProperty('--popover-origin','top left');
  showPopover(menu);(menu.querySelector('[aria-checked=true]')||menu.querySelector('.menu-item'))?.focus({preventScroll:true});
 }
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target))closeMenu();},true);
 menu.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();return;}
  const items=[...menu.querySelectorAll('.menu-item')],at=items.indexOf(document.activeElement);
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();items[(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
 });

 // ---- list page
 function avatar(id){const a=el('span','issue-avatar',(agentName(id)[0]||'?').toUpperCase());a.title=agentName(id);return a;}
 function chips(issue){const wrap=el('span','issue-chips');for(const pr of issue.prs.slice(0,2)){const c=el('span','issue-chip');c.innerHTML=icon('merge');c.append(el('span','',pr.ref));wrap.append(c);}return wrap;}
 function row(issue){
  const li=el('li','issue-item'),b=btn('issue-row');b.dataset.id=issue.id;b.dataset.status=issue.status;b.setAttribute('aria-label',`${code(issue)} ${issue.title}, ${label(STATUSES,issue.status)}`);
  const status=el('span','issue-status');status.dataset.status=issue.status;status.innerHTML=STATUS_SVG[issue.status];
  const prio=el('span','issue-priority');prio.dataset.priority=issue.priority;prio.innerHTML=PRIORITY_SVG[issue.priority];prio.title=label(PRIORITIES,issue.priority);
  b.append(status,el('span','issue-code',code(issue)),el('span','issue-row-title',issue.title),chips(issue),prio,issue.assignee?avatar(issue.assignee):el('span','issue-avatar issue-avatar--none'),el('span','issue-age',ago(issue.modified)));
  li.append(b);return li;
 }
 function renderList(){
  const head=el('header','issues-head'),title=el('h1','issues-title','Issues'),sub=el('span','issues-sub',projectName());
  const tabs=el('div','issues-tabs');tabs.setAttribute('role','tablist');
  for(const [value,name] of [['open','Open'],['all','All']]){const t=btn('issues-tab',name);t.setAttribute('role','tab');t.setAttribute('aria-selected',String(tab===value));t.dataset.tab=value;if(value==='open'){const n=el('span','issues-tab-count',String(issues.filter(isOpen).length));t.append(n);}t.addEventListener('click',()=>{tab=value;render();});tabs.append(t);}
  const add=btn('issues-add');add.innerHTML=icon('plus');add.title='New issue';add.setAttribute('aria-label','New issue');add.disabled=!projectId;add.addEventListener('click',()=>create());
  head.append(title,sub);const bar=el('div','issues-bar');bar.append(tabs,add);
  const scroll=el('div','issues-scroll');
  if(!projectId){const e=el('div','issues-empty');e.append(el('div','issues-empty-title','Choose a project'),el('div','issues-empty-note','Issues are kept per project.'));scroll.append(e);}
  else if(loaded&&!issues.length){const e=el('div','issues-empty');e.append(el('div','issues-empty-title','No issues yet'),el('div','issues-empty-note','Write down work, assign it to an agent, start a thread from it.'));const b=btn('issues-act issues-act--primary','New issue');b.dataset.act='new';b.addEventListener('click',()=>create());e.append(b);scroll.append(e);}
  else{
   const groups=groupIssues(issues,tab);
   if(!groups.length&&issues.length){const e=el('div','issues-empty');e.append(el('div','issues-empty-title','Nothing open'));scroll.append(e);}
   for(const g of groups){
    const sec=el('section','issues-group');sec.dataset.status=g.status;
    const open=!collapsed.has(g.status);
    const h=btn('issues-group-head');h.setAttribute('aria-expanded',String(open));h.innerHTML=icon('chevron','issues-chevron');h.append(el('span','issues-group-name',g.name),el('span','issues-group-count',String(g.items.length)));
    h.addEventListener('click',()=>{collapsed.has(g.status)?collapsed.delete(g.status):collapsed.add(g.status);render();});
    sec.append(h);
    if(open){const ul=el('ul','issues-list');for(const i of g.items)ul.append(row(i));sec.append(ul);}
    scroll.append(sec);
   }
  }
  listPage.replaceChildren(head,bar,scroll);
 }

 // ---- issue page
 function property(name,glyph){const r=el('div','issue-prop');const l=el('span','issue-prop-label');l.innerHTML=glyph;l.append(el('span','',name));const v=el('div','issue-prop-value');r.append(l,v);return [r,v];}
 function trigger(field,html,text){const b=btn('issue-trigger');b.dataset.field=field;const g=el('span','issue-trigger-glyph');g.innerHTML=html;b.append(g,el('span','',text));b.insertAdjacentHTML('beforeend',icon('chevron','issue-trigger-chevron'));return b;}
 function renderDetail(){
  const issue=byId(openId);if(!issue){closeDetail();return;}
  const crumbs=el('header','issues-head issue-crumbs');const back=btn('issue-back','All issues');back.insertAdjacentHTML('afterbegin',icon('back'));back.dataset.act='back';back.addEventListener('click',()=>showList());
  const here=el('span','issue-crumb-here');const hs=el('span','issue-status');hs.dataset.status=issue.status;hs.innerHTML=STATUS_SVG[issue.status];here.append(hs,el('span','issue-crumb-title',issue.title));
  const del=btn('issues-act issue-delete','Delete');del.dataset.act='delete';
  del.addEventListener('click',()=>{if(del.dataset.armed!=='true'){del.dataset.armed='true';del.textContent='Confirm delete';setTimeout(()=>{if(del.isConnected){del.dataset.armed='';del.textContent='Delete';}},4000);return;}guarded(queue.then(()=>api.issues.remove(issue.id)).then(()=>{issues=issues.filter(i=>i.id!==issue.id);paintCount();showList();}));});
  crumbs.append(el('span','issues-title','Issues'),el('span','issue-crumb-sep','›'),here);const bar=el('div','issues-bar');bar.append(back,del);
  const body=el('div','issue-page-body');
  const title=el('input','issue-title');title.value=issue.title;title.setAttribute('aria-label','Issue title');title.maxLength=200;title.placeholder='Issue title';
  title.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();title.blur();}});
  title.addEventListener('change',()=>{const v=title.value.trim();if(!v){title.value=issue.title;return;}void guarded(save(issue.id,{title:v}).then(()=>{here.lastChild.textContent=v;}));});
  const meta=el('div','issue-meta');meta.append(el('span','',code(issue)),el('span','issue-meta-sep'),el('span','',ago(issue.created)==='now'?'just now':ago(issue.created)+' ago'));
  const props=el('div','issue-props');
  const set=(field,value)=>guarded(save(issue.id,{[field]:value}).then(renderDetail));
  {const [r,v]=property('Status',icon('circle'));const t=trigger('status',STATUS_SVG[issue.status],label(STATUSES,issue.status));t.dataset.value=issue.status;t.querySelector('.issue-trigger-glyph').dataset.status=issue.status;t.addEventListener('click',()=>pick(t,STATUSES.map(([value,name])=>({value,label:name,glyph:STATUS_SVG[value]})),issue.status,v2=>set('status',v2),'Status'));v.append(t);props.append(r);}
  {const [r,v]=property('Priority',icon('chart'));const t=trigger('priority',PRIORITY_SVG[issue.priority],label(PRIORITIES,issue.priority));t.dataset.value=issue.priority;t.addEventListener('click',()=>pick(t,PRIORITIES.map(([value,name])=>({value,label:name,glyph:PRIORITY_SVG[value]})),issue.priority,v2=>set('priority',v2),'Priority'));v.append(t);props.append(r);}
  {const [r,v]=property('Assignee',icon('agent'));const t=btn('issue-trigger');t.dataset.field='assignee';t.dataset.value=issue.assignee||'';if(issue.assignee)t.append(avatar(issue.assignee),el('span','',agentName(issue.assignee)));else t.append(el('span','issue-trigger-none','Unassigned'));t.insertAdjacentHTML('beforeend',icon('chevron','issue-trigger-chevron'));
   t.addEventListener('click',()=>pick(t,[{value:'',label:'Unassigned'},...agents.map(a=>({value:a.id,label:a.label}))],issue.assignee||'',v2=>set('assignee',v2||null),'Assign to an agent'));v.append(t);props.append(r);}
  {const [r,v]=property('Pull requests',icon('merge'));
   for(const pr of issue.prs){const line=el('div','issue-link');line.dataset.kind='pr';const open=pr.url?btn('issue-link-main'):el('span','issue-link-main');open.append(el('span','issue-link-ref',pr.ref),el('span','issue-link-note',pr.url?pr.url.replace(/^https:\/\/github\.com\//,'').replace(/\/pull\/\d+.*/,''):'local reference'));if(pr.url)open.addEventListener('click',()=>void api.openExternal(pr.url).catch(e=>say(e)));const x=btn('issue-unlink');x.innerHTML=icon('close');x.setAttribute('aria-label','Unlink '+pr.ref);x.addEventListener('click',()=>set('prs',issue.prs.filter(p=>p!==pr)));line.append(open,x);v.append(line);}
   const add=btn('issue-ghost');add.dataset.act='link-pr';add.innerHTML=icon('plus')+'<span>Link pull request</span>';
   add.addEventListener('click',()=>{const input=el('input','issue-input');input.placeholder='Paste a PR link or number';input.setAttribute('aria-label','Pull request link');add.replaceWith(input);input.focus();
    let done=false;const finish=async commit=>{if(done)return;done=true;const value=input.value.trim();if(!commit||!value){renderDetail();return;}try{await save(issue.id,{prs:[...issue.prs,{ref:value,url:value}]});}catch(error){say(error);}renderDetail();};
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void finish(true);}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();void finish(false);}});input.addEventListener('blur',()=>void finish(!!input.value.trim()));});
   v.append(add);props.append(r);}
  {const [r,v]=property('Threads',icon('message'));const live=getThreadDirectory().threads;
   for(const l of issue.threads){const t=live.find(x=>x.id===l.id),line=el('div','issue-link');line.dataset.kind='thread';line.dataset.id=l.id;const open=btn('issue-link-main');const st=el('span','issue-thread-state thread-state');st.dataset.status=t?.status||'';st.innerHTML=icon(THREAD_GLYPH[t?.status]||'circle');open.append(st,el('span','issue-link-title',t?.title||l.title||'Thread'));open.addEventListener('click',()=>{if(live.some(x=>x.id===l.id)){close(false);getThreadDirectory().open(l.id);}else toast('That thread is no longer in the list');});const x=btn('issue-unlink');x.innerHTML=icon('close');x.setAttribute('aria-label','Unlink thread');x.addEventListener('click',()=>set('threads',issue.threads.filter(y=>y!==l)));line.append(open,x);v.append(line);}
   const actions=el('div','issue-link-actions');
   const startBtn=btn('issues-act issues-act--primary','Start thread');startBtn.dataset.act='start';startBtn.title='Open a new thread in this project with this issue as the prompt';startBtn.addEventListener('click',()=>start(issue));
   const link=btn('issue-ghost');link.dataset.act='link-thread';link.innerHTML=icon('plus')+'<span>Link thread</span>';
   link.addEventListener('click',()=>{const have=new Set(issue.threads.map(l=>l.id)),here=projectName(),choices=live.filter(t=>!have.has(t.id)&&!t.archived&&(!here||t.project===here)).sort((a,b)=>b.modified-a.modified).slice(0,12);
    if(!choices.length){toast('No other threads in this project');return;}
    pick(link,choices.map(t=>({value:t.id,label:t.title||'Untitled'})),'',id=>{const t=choices.find(c=>c.id===id);set('threads',[...issue.threads,{id,title:t.title||''}]);},'Link a thread');});
   actions.append(startBtn,link);v.append(actions);props.append(r);}
  const dh=el('div','issue-desc-head','Description');
  const desc=el('textarea','issue-body');desc.value=issue.body;desc.rows=4;desc.placeholder='Add a description';desc.setAttribute('aria-label','Description');
  const grow=()=>{desc.style.height='auto';desc.style.height=Math.max(96,desc.scrollHeight)+'px';};desc.addEventListener('input',grow);
  desc.addEventListener('change',()=>void guarded(save(issue.id,{body:desc.value})));
  body.append(title,meta,props,dh,desc);const scroll=el('div','issues-scroll issue-scroll');scroll.append(body);detailPage.replaceChildren(crumbs,bar,scroll);requestAnimationFrame(grow);
  return title;
 }

 // ---- navigation
 function render(){if(openId&&byId(openId)){listPage.hidden=true;detailPage.hidden=false;renderDetail();}else{openId=null;detailPage.hidden=true;listPage.hidden=false;renderList();}}
 function closeDetail(){openId=null;render();}
 async function showList(){
  const gone=byId(openId);await queue.catch(()=>{});openId=null;
  // An untouched "New issue" left behind by clicking away is removed instead of kept as clutter.
  const stale=gone&&byId(gone.id);if(stale&&stale.title==='New issue'&&!stale.body&&!stale.threads.length&&!stale.prs.length){try{await api.issues.remove(stale.id);issues=issues.filter(i=>i.id!==stale.id);paintCount();}catch{}}
  render();await load();listPage.querySelector('.issue-row,.issues-add:not(:disabled)')?.focus({preventScroll:true});
 }
 async function create(){
  if(!projectId)return;
  try{const issue=await api.issues.create({projectId,fields:{title:'New issue'}});issues.push(issue);paintCount();openId=issue.id;render();const t=detailPage.querySelector('.issue-title');t.focus();t.select();}catch(error){say(error);}
 }
 function start(issue){
  const latest=byId(issue.id)||issue;
  if(!form||!prompt){toast('Composer unavailable');return;}
  started={id:latest.id,projectId};
  close(false);newSession?.click();
  prompt.value=threadPrompt(latest);prompt.dispatchEvent(new Event('input',{bubbles:true}));
  form.dataset.issue=latest.id;
  form.requestSubmit();
  setTimeout(()=>{if(form.dataset.issue===latest.id)delete form.dataset.issue;},4000);
 }
 // The thread exists: link it, and move a waiting issue to In progress.
 document.addEventListener('suffice-thread-started',event=>{
  const {issue:id,threadId}=event.detail||{};if(!id||!started||started.id!==id)return;
  const wanted=started.projectId;started=null;
  void (async()=>{
   try{
    const mine=wanted===projectId?issues:await api.issues.list(wanted),issue=mine.find(i=>i.id===id);if(!issue||issue.threads.some(t=>t.id===threadId))return;
    const live=getThreadDirectory().threads.find(t=>t.id===threadId),patch={threads:[...issue.threads,{id:threadId,title:live?.title||issue.title}]};
    if(issue.status==='backlog'||issue.status==='todo')patch.status='progress';
    const next=await save(id,patch);if(isOpen_&&openId===id)renderDetail();return next;
   }catch(error){say(error);}
  })();
 });
 // Directory updates repaint linked-thread titles and states while the page is open.
 document.addEventListener('suffice-thread-directory',()=>{if(isOpen_&&openId&&!detailPage.contains(document.activeElement)&&menu.hidden)renderDetail();});
 document.addEventListener('suffice-project-ready',()=>{if((document.documentElement.dataset.projectId||'')!==projectId){openId=null;void load();}});

 function open(){
  if(isOpen_){view.querySelector('.issue-row,.issues-add')?.focus();return;}
  if(workspace.classList.contains('needs-open'))document.querySelector('.needs-nav')?.click();
  isOpen_=true;openId=null;
  underlay=[...workspace.querySelectorAll('.home,.thread-transcript,.thread-header')].map(element=>({element,inert:element.inert}));for(const {element} of underlay)element.inert=true;
  view.hidden=false;workspace.classList.add('issues-open');nav.setAttribute('aria-current','page');newSession?.removeAttribute('aria-current');
  render();void load();
  if(motion())view.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:150,easing:'cubic-bezier(.2,.8,.2,1)'});
  (view.querySelector('.issue-row')||view.querySelector('.issues-add:not(:disabled)')||view.querySelector('.issues-title')).focus?.({preventScroll:true});
 }
 function close(restoreFocus=true){
  if(!isOpen_)return;closeMenu();isOpen_=false;
  for(const {element,inert} of underlay)element.inert=inert;underlay=[];
  view.hidden=true;workspace.classList.remove('issues-open');nav.removeAttribute('aria-current');
  if(!workspace.classList.contains('thread-view'))newSession?.setAttribute('aria-current','page');
  if(restoreFocus)nav.focus({preventScroll:true});
 }
 view.addEventListener('click',event=>{const rowButton=event.target.closest('.issue-row');if(rowButton){openId=rowButton.dataset.id;render();detailPage.querySelector('.issue-title')?.focus({preventScroll:true});}});
 document.addEventListener('click',event=>{
  if(event.target.closest?.('.issues-nav')){isOpen_?close():open();return;}
  if(isOpen_&&event.target.closest?.('.thread-row,.new-session,.brand-home,[data-action=settings],.needs-nav'))close(false);
 },true);
 document.addEventListener('keydown',event=>{
  if(!isOpen_||event.key!=='Escape'||event.defaultPrevented||!menu.hidden||document.querySelector('.popover:not([hidden]):not(.issues-menu)'))return;
  event.preventDefault();if(openId&&!detailPage.hidden)void showList();else close();
 });
 new MutationObserver(()=>{if(document.documentElement.classList.contains('settings-open'))close(false);}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 document.addEventListener('suffice-open-issues',open);
 void load();
}
