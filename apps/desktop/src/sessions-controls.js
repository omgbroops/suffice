import {icon} from './ui.js';
import {createMenu} from './menu.js';
import {showPopover,hidePopover} from './popover-motion.js';
import './sessions-controls.css';

const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
const plain=label=>String(label).replace(/ \(.*/,'');
const modelHit=(mo,v)=>{const w=String(v||'').toLowerCase();return !!w&&[mo.id.replace(/\[.*/,''),String(mo.label).split(' ')[0],...(mo.aliases||[])].some(a=>w.includes(a.toLowerCase()));};

// Composer-side controls for a CLI session: model/effort and permission mode feed the standard pickers through
// form.modelSource / form.accessSource, plus slash completion, the queued/context shelf and the native picker list.
export function createSessionControls({form,sx,toast}){
 const prompt=()=>document.querySelector('#prompt'),PH=prompt()?.placeholder||'';
 let active=null,cat=null,ui=null,pend=null,pendTimer=0,sig='',cardsSig='',shelf=null,picker=null,pickerOff=null,pickSel=-1,hint=false,slashOff=null,hidden=false;
 const slashPop=el('div','popover slash-menu');slashPop.hidden=true;document.body.append(slashPop);const slashMenu=createMenu(slashPop);
 let slashRows=[],slashIdx=0;

 const modeOf=v=>{const n=norm(v);return cat?.modes.find(x=>norm(x.id)===n||norm(x.label)===n)?.id||'default';};
 function pendDone(m){
  const v=pend.kind==='model'?m.model:pend.kind==='effort'?m.effort:m.mode;
  const hit=pend.kind==='model'?modelHit(cat?.models.find(x=>x.id===pend.id)||{id:pend.id,label:pend.id},v):pend.kind==='effort'?norm(v)===norm(pend.id):modeOf(v)===pend.id&&(!!v||pend.id==='default');
  if(hit||v!==pend.from){pend=null;clearTimeout(pendTimer);}
 }
 // Never optimistic: the controls show the target with "…" until meta reports it (or 20 s pass).
 function choose(kind,id){
  const m=ui?.meta||{},raw=kind==='model'?m.model:kind==='effort'?m.effort:m.mode,from=kind==='mode'?modeOf(m.mode):raw;
  if(kind==='mode'&&id===from)return;
  pend={kind,id,from:raw};clearTimeout(pendTimer);
  pendTimer=setTimeout(()=>{if(pend){pend=null;toast('No confirmation from the terminal');sync();}},20000);
  sx.control(active.id,kind==='model'?'setModel':kind==='effort'?'setEffort':'setMode',kind==='model'?{id}:kind==='effort'?{level:id}:{from,to:id}).catch(e=>{pend=null;toast(e.message);sync();});
  sync();
 }

 function sync(){
  if(!active||!cat){return;}
  const m=ui?.meta||{},next=JSON.stringify([m.model,m.effort,m.mode,pend,cat.agent]);
  if(next===sig&&form.modelSource)return;sig=next;
  const claude=cat.agent==='claude',provider=claude?'anthropic':'openai',mo=cat.models.find(x=>modelHit(x,m.model));
  const base=cat.models.map(x=>plain(x.label)),models=cat.models.map((x,i)=>({id:x.id,name:x.label!==base[i]&&base.indexOf(base[i])!==i?`${base[i]} ${/\((\d+M)/.exec(x.label)?.[1]||x.id}`:base[i],provider,efforts:claude?cat.efforts:[]}));
  if(!mo&&m.model)models.push({id:m.model,name:plain(m.model),provider,efforts:claude?cat.efforts:[],available:false});
  form.modelSource={models,selected:{id:mo?.id||m.model,effort:m.effort},pending:pend?.kind==='model'?{id:pend.id}:pend?.kind==='effort'?{effort:pend.id}:null,
   choose(id,effort){if(id!==(mo?.id||m.model))choose('model',id);else if(effort&&norm(effort)!==norm(m.effort))choose('effort',effort);}};
  form.accessSource={modes:cat.modes.filter(x=>x.id!=='dontAsk').map(x=>({id:x.id,label:x.label,detail:x.description})),current:modeOf(m.mode),pending:pend?.kind==='mode'?pend.id:null,choose:id=>choose('mode',id)};
  form.dispatchEvent(new Event('model-source'));form.dispatchEvent(new Event('access-source'));
 }

 // Anchored above the composer at composer width; keys are taken at capture so the textarea keeps focus.
 function above(pop){
  const r=form.getBoundingClientRect();pop.style.width=r.width+'px';
  pop.style.left=r.left+'px';pop.style.top=Math.max(12,r.top-pop.offsetHeight-8)+'px';pop.style.setProperty('--popover-origin','bottom left');
 }
 const slashClose=()=>{document.removeEventListener('keydown',slashKey,true);slashMenu.close();slashRows=[];};
 const mark=i=>{slashIdx=i;[...slashPop.querySelectorAll('.menu-item')].forEach((b,k)=>{if(k===i){b.dataset.active='';b.scrollIntoView({block:'nearest'});}else delete b.dataset.active;});};
 function slashPick(i){const c=slashRows[i];if(!c)return;const p=prompt();slashClose();p.value=`/${c.name} `;p.placeholder=c.argumentHint||PH;hint=!!c.argumentHint;p.focus();p.dispatchEvent(new Event('input',{bubbles:true}));}
 function slashKey(e){
  const stop=()=>{e.preventDefault();e.stopImmediatePropagation();};
  if(e.key==='Escape'){stop();slashClose();}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){stop();mark((slashIdx+(e.key==='ArrowDown'?1:-1)+slashRows.length)%slashRows.length);}
  else if((e.key==='Enter'||e.key==='Tab')&&!e.shiftKey&&slashRows[slashIdx]){stop();slashPick(slashIdx);}
 }
 slashPop.addEventListener('click',e=>{const row=e.target.closest('[data-menu-action]');if(row)slashPick(Number(row.dataset.menuAction.split(':')[1]));});
 slashPop.addEventListener('pointermove',e=>{const row=e.target.closest('[data-menu-action]');if(row)mark(Number(row.dataset.menuAction.split(':')[1]));});
 // Prefix matches first, then substring (same order as the backend's filterCommands).
 function slash(){
  const p=prompt();if(!active||hidden||!cat)return;const v=p.value;
  if(!/^\/\S*$/.test(v)){if(slashRows.length)slashClose();if(hint){hint=false;p.placeholder=PH;}return;}
  const q=v.slice(1).toLowerCase(),pre=[],sub=[];
  for(const c of cat.commands){const n=c.name.toLowerCase();if(n.startsWith(q))pre.push(c);else if(n.includes(q))sub.push(c);}
  slashRows=[...pre,...sub].slice(0,40);if(!slashRows.length){slashClose();return;}
  form.setAttribute('aria-expanded','false');
  slashMenu.open(form,slashRows.map((c,i)=>({label:'/'+c.name,detail:String(c.description||'').split('\n')[0],action:'slash:'+i})),'Commands');
  slashPop.querySelectorAll('.menu-item').forEach((b,i)=>{const d=String(slashRows[i].description||'').split('\n')[0];if(d)b.append(el('span','slash-detail',d));});
  slashPop.style.setProperty('--menu-max-height',Math.min(320,Math.max(120,form.getBoundingClientRect().top-24))+'px');
  above(slashPop);document.removeEventListener('keydown',slashKey,true);document.addEventListener('keydown',slashKey,true);mark(0);
  p.focus();
 }

 // Queued messages and the context warning share the standard queued-messages shelf above the composer.
 function pickerClose(){pickerOff?.();pickerOff=null;if(picker){const n=picker;picker=null;hidePopover(n,()=>n.remove());}}
 function pickKeys(pk,i){const d=i-(pk.selected||0),keys=[...Array(Math.abs(d)).fill(d<0?'up':'down'),'enter'];sx.control(active.id,'keys',{keys}).catch(e=>toast(e.message));}
 function paintCards(){
  const m=active?ui?.meta||{}:{},q=[...(Array.isArray(m.queued)?m.queued:[]).map(x=>typeof x==='string'?x:x?.text||''),...(ui?.items||[]).filter(i=>i.queued&&i.text).map(i=>i.text)].filter(Boolean);
  const queued=[...new Set(q)],cw=m.contextWarning,pk=m.picker&&m.picker.options?.length>1&&!ui?.prompt?m.picker:null;
  const next=active?JSON.stringify([queued,cw,pk]):'';
  if(next===cardsSig)return;cardsSig=next;shelf?.remove();shelf=null;pickerClose();pickSel=-1;
  if(!next||(!queued.length&&!cw&&!pk))return;
  if(queued.length||cw){
   shelf=el('div','queued-messages session-shelf');shelf.hidden=hidden;
   for(const t of queued){const r=el('div','queued-message');r.innerHTML=icon('queue');const x=el('span','queued-message-text',t);x.title=t;r.append(x);shelf.append(r);}
   if(cw){const r=el('div','queued-message');r.innerHTML=icon('queue');r.append(el('span','queued-message-text',`Context ${cw.percentLeft!=null?cw.percentLeft+'% left':'nearly full'}`));
    const b=el('button','button button--ghost','Compact');b.type='button';b.addEventListener('click',()=>sx.control(active.id,'compact').catch(e=>toast(e.message)));r.append(b);shelf.append(r);}
   form.before(shelf);
  }
  if(pk){
   const pop=el('div','popover session-picker');pop.setAttribute('role','listbox');pop.setAttribute('aria-label',pk.title||'Choose');pop.append(el('div','popover-heading',pk.title||'Choose'));
   const sel=pk.selected||0,rows=pk.options.map((o,i)=>{const b=el('button','menu-item');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-pressed',String(i===sel));b.append(el('span','menu-label',String(o.label).replace(/\s*[✔✓]\s*$/,'')));b.addEventListener('click',()=>pickKeys(pk,i));pop.append(b);return b;});
   pickSel=sel;const hi=i=>{pickSel=i;rows.forEach((b,k)=>{if(k===i)b.dataset.active='';else delete b.dataset.active;});};hi(sel);rows.forEach((b,i)=>b.addEventListener('pointermove',()=>hi(i)));
   const key=e=>{const n=rows.length,stop=()=>{e.preventDefault();e.stopImmediatePropagation();};
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){stop();hi((pickSel+(e.key==='ArrowDown'?1:-1)+n)%n);}
    else if(e.key==='Enter'&&!e.shiftKey){stop();pickKeys(pk,pickSel);}
    else if(e.key==='Escape'){stop();sx.control(active.id,'keys',{keys:['esc']}).catch(er=>toast(er.message));}};
   document.body.append(pop);const r=form.getBoundingClientRect();pop.style.width=r.width+'px';pop.style.left=r.left+'px';pop.style.top=Math.max(12,r.top-pop.offsetHeight-8-(shelf?shelf.offsetHeight-8:0))+'px';pop.style.setProperty('--popover-origin','bottom left');
   pop.hidden=hidden;document.addEventListener('keydown',key,true);pickerOff=()=>document.removeEventListener('keydown',key,true);picker=pop;if(!hidden)showPopover(pop);
  }
  form.resizePrompt?.();
 }

 return {
  attach(s){
   active={id:s.id};cat=null;ui=null;pend=null;sig='';cardsSig='';hidden=false;form.modelSource={models:[],selected:{},pending:null,choose(){}};form.accessSource={modes:[{id:'',label:'…',detail:''}],current:'',pending:null,choose(){}};form.dispatchEvent(new Event('model-source'));form.dispatchEvent(new Event('access-source'));const p=prompt();p.addEventListener('input',slash);slashOff=()=>p.removeEventListener('input',slash);
  },
  setCatalog(c){cat=c;sig='';sync();},
  update(u){ui=u;if(pend&&u?.meta)pendDone(u.meta);sync();paintCards();},
  // The terminal view hides the composer; its cards go with it.
  hide(v){hidden=v;if(shelf)shelf.hidden=v;if(picker)picker.hidden=v;if(v&&slashRows.length)slashClose();},
  menuOpen:()=>slashRows.length>0||!!picker,
  detach(){
   slashOff?.();slashOff=null;slashClose();pickerClose();shelf?.remove();shelf=null;clearTimeout(pendTimer);pend=null;active=null;cat=null;ui=null;sig='';cardsSig='';
   if(hint){hint=false;const p=prompt();if(p)p.placeholder=PH;}
   delete form.modelSource;delete form.accessSource;form.dispatchEvent(new Event('model-source'));form.dispatchEvent(new Event('access-source'));
  },
 };
}
