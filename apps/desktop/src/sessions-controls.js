import {icon} from './ui.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {el,base,plural,prompt} from './sessions-util.js';
import './sessions-controls.css';

// Header controls (model / effort / mode menus, usage, background chip), composer cards (queued, context warning, native picker),
// slash completion, Esc-to-interrupt and terminal-draft sync.
export function createControls(c){
 const {sx,toast,form,labels}=c;
 const sessionPH=()=>`Message ${labels.get(c.active?.id)||'the agent'}`;
 // Popover list shared by the header controls and the slash completion. Arrows/Enter/Tab/Esc are taken at capture so focus stays where it was.
 function closeMenu(){c.openMenu?.close();}
 function menu(anchor,rows,pick,o={}){
  closeMenu();
  const pop=el('div','popover session-menu');pop.role='listbox';let idx=0;
  const btns=rows.map((r,i)=>{
   const b=el('button','menu-item');b.type='button';b.role='option';b.disabled=!!r.disabled;b.append(el('span','menu-label',r.label));
   if(r.detail)b.append(el('span','session-menu-detail',r.detail));
   if(r.tag)b.append(el('span','session-menu-tag',r.tag));
   if(r.checked!==undefined){const ck=el('span',`menu-check${r.checked?'':' menu-check--empty'}`);ck.innerHTML=icon('check');b.append(ck);}
   if(r.checked)idx=i;
   b.addEventListener('click',()=>{close();pick(r);});b.addEventListener('pointermove',()=>mark(i));pop.append(b);return b;});
  const mark=i=>{idx=i;btns.forEach((b,k)=>{if(k===i)b.dataset.active='';else delete b.dataset.active;});btns[i]?.scrollIntoView({block:'nearest'});};
  const move=d=>{let i=idx;for(let n=0;n<rows.length;n++){i=(i+d+rows.length)%rows.length;if(!rows[i].disabled){mark(i);return;}}};
  const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
  const key=e=>{
   if(e.key==='Escape'){stop(e);close();}
   else if(e.key==='ArrowDown'||e.key==='ArrowUp'){stop(e);move(e.key==='ArrowDown'?1:-1);}
   else if((e.key==='Enter'||e.key==='Tab')&&!e.shiftKey&&rows[idx]&&!rows[idx].disabled){stop(e);const r=rows[idx];close();pick(r);}
  };
  const away=e=>{if(!pop.contains(e.target)&&!anchor.contains(e.target))close();};
  function close(){document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',away,true);if(c.openMenu===h)c.openMenu=null;hidePopover(pop,()=>pop.remove());}
  document.body.append(pop);
  const r=(o.rect||anchor).getBoundingClientRect();pop.style.left=Math.max(12,Math.min(r.left,innerWidth-(o.width||r.width||260)-12))+'px';
  if(o.width)pop.style.width=Math.min(o.width,innerWidth-24)+'px';
  if(o.above)pop.style.bottom=innerHeight-r.top+6+'px';else pop.style.top=r.bottom+6+'px';
  if(o.quiet)pop.style.animation='none';
  document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',away,true);
  const h={close,anchor,slash:!!o.slash};c.openMenu=h;mark(idx);showPopover(pop);
  return h;
 }
 const norm=s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
 const modelHit=(mo,v)=>{const w=String(v||'').toLowerCase();return !!w&&[mo.id.replace(/\[.*/,''),String(mo.label).split(' ')[0],...(mo.aliases||[])].some(a=>w.includes(a.toLowerCase()));};
 const modeOf=v=>{const n=norm(v);return c.cat?.modes.find(x=>norm(x.id)===n||norm(x.label)===n)?.id||'default';};
 function pendDone(m){
  const v=c.pend.kind==='model'?m.model:c.pend.kind==='effort'?m.effort:m.mode;
  const hit=c.pend.kind==='model'?modelHit(c.cat?.models.find(x=>x.id===c.pend.id)||{id:c.pend.id,label:c.pend.id},v):c.pend.kind==='effort'?norm(v)===norm(c.pend.id):modeOf(v)===c.pend.id&&(!!v||c.pend.id==='default');
  if(hit||v!==c.pend.from){c.pend=null;clearTimeout(c.pendTimer);}
 }
 // Never optimistic: the button shows the target with "…" until meta reports it (or 20 s pass).
 function choose(kind,id){
  const m=c.ui?.meta||{},raw=kind==='model'?m.model:kind==='effort'?m.effort:m.mode,from=kind==='mode'?modeOf(m.mode):raw;
  if(kind==='mode'&&id===from)return;
  c.pend={kind,id,from:raw};clearTimeout(c.pendTimer);
  c.pendTimer=setTimeout(()=>{if(c.pend){c.pend=null;toast('No confirmation from the terminal');paintMeta();}},20000);
  sx.control(c.active.id,kind==='model'?'setModel':kind==='effort'?'setEffort':'setMode',kind==='model'?{id}:kind==='effort'?{level:id}:{from,to:id}).catch(e=>{c.pend=null;toast(e.message);paintMeta();});
  paintMeta();
 }
 // Header controls: model / effort / c.mode menus, quiet usage text, background chip, cwd. Rebuilt only when its inputs change.
 const bgCount=v=>typeof v==='number'?v:Number(v?.count)||0;
 function ctl(text,pending,onclick){
  const b=el('button','button button--subtle session-ctl');b.type='button';b.append(el('span','',text));
  const ch=el('span','session-ctl-chev');ch.innerHTML=icon('chevron');b.append(ch);
  if(pending){b.dataset.pending='';b.disabled=true;}else b.addEventListener('click',()=>onclick(b));return b;
 }
 function paintMeta(){
  if(!c.metaEl||!c.active)return;const m=c.ui?.meta||{},u=m.usage;
  const ul=(Array.isArray(u?.lines)?u.lines:String(u?.lines||'').split(' · ')).map(String).filter(x=>x&&!x.startsWith('$'));
  const sg=JSON.stringify([m.model,m.effort,m.mode,ul,u?.inputTokens,u?.outputTokens,bgCount(m.backgroundTasks),m.cwd,c.pend,!!c.cat]);
  if(sg===c.metaSig)return;c.metaSig=sg;if(!c.openMenu?.slash)closeMenu();c.metaEl.replaceChildren();
  if(c.cat){
   const pm=c.pend?.kind==='model',pe=c.pend?.kind==='effort',pd=c.pend?.kind==='mode';
   const mo=c.cat.models.find(x=>modelHit(x,m.model));
   c.metaEl.append(ctl(pm?c.pend.id+'…':mo?.label?.replace(/ \(.*/,'')||m.model||'Model',pm,b=>menu(b,c.cat.models.map(x=>({id:x.id,label:x.label,checked:x===mo})),r=>choose('model',r.id),{width:260})));
   if(c.cat.agent==='claude'&&(m.effort||pe))c.metaEl.append(ctl(pe?c.pend.id+'…':m.effort,pe,b=>menu(b,c.cat.efforts.map(x=>({id:x,label:x,checked:norm(x)===norm(m.effort)})),r=>choose('effort',r.id),{width:160})));
   const cur=modeOf(m.mode),modes=c.cat.modes.filter(x=>x.id!=='dontAsk');
   c.metaEl.append(ctl(pd?(modes.find(x=>x.id===c.pend.id)?.label||c.pend.id)+'…':modes.find(x=>x.id===cur)?.label||'Manual',pd,b=>menu(b,modes.map(x=>({id:x.id,label:x.label,detail:x.description,checked:x.id===cur})),r=>choose('mode',r.id),{width:640})));
  }else if(m.model)c.metaEl.append(el('span','',[m.model,m.effort,m.mode].filter(Boolean).join(' · ')));
  if(ul.length){const t=el('span','session-usage',ul.join(' · '));if(u?.inputTokens!=null)t.title=`${u.inputTokens} tokens in · ${u.outputTokens??0} out`;c.metaEl.append(t);}
  else if(m.contextUsedPct!=null)c.metaEl.append(el('span','session-usage',`ctx ${Math.round(m.contextUsedPct)}%`));
  const n=bgCount(m.backgroundTasks);
  if(n){const bg=el('button','attachment-chip session-bg',`${n} background`);bg.type='button';bg.title='Background tasks';
   bg.addEventListener('click',()=>menu(bg,[{label:plural(n,'task'),detail:'running in background'}],()=>{},{width:300}));c.metaEl.append(bg);}
  c.metaEl.append(el('span','session-cwd',base(m.cwd||c.active.s.cwd)));
 }
 // Composer extras above the form's first child: queued messages, context warning, native picker card. One strip, rebuilt on a signature change.
 function paintCards(){
  const m=c.active?c.ui?.meta||{}:{},q=[...(Array.isArray(m.queued)?m.queued:[]).map(x=>typeof x==='string'?x:x?.text||''),...(c.ui?.items||[]).filter(i=>i.queued&&i.text).map(i=>i.text)].filter(Boolean);
  const queued=[...new Set(q)],cw=m.contextWarning,pk=m.picker&&m.picker.options?.length>1&&!c.ui?.prompt?m.picker:null;
  const sg=c.active?JSON.stringify([queued,cw,pk]):'';
  if(sg===c.cardsSig)return;c.cardsSig=sg;c.cards?.remove();c.cards=null;c.pickSel=-1;
  if(!sg||(!queued.length&&!cw&&!pk))return;
  c.cards=el('div','session-cards');
  for(const t of queued){const r=el('div','session-notice session-notice--quiet session-queued');r.append(el('span','session-queued-tag','Queued'),el('span','session-queued-text',t));c.cards.append(r);}
  if(cw){const r=el('div','session-notice session-ctxwarn');r.append(el('span','',`Context ${cw.percentLeft!=null?cw.percentLeft+'% left':'nearly full'}`));
   const b=el('button','button button--subtle','Compact');b.type='button';b.addEventListener('click',()=>sx.control(c.active.id,'compact').catch(e=>toast(e.message)));r.append(b);c.cards.append(r);}
  if(pk){const p=el('div','session-picker');p.tabIndex=0;p.setAttribute('aria-label',pk.title||'Choose');p.append(el('div','popover-heading',pk.title||'Choose'));
   const sel=pk.selected||0,rowsB=pk.options.map((o,i)=>{const b=el('button','menu-item');b.type='button';b.append(el('span','menu-label',o.label));if(i===sel){const ck=el('span','menu-check');ck.innerHTML=icon('check');b.append(ck);}
    b.addEventListener('click',()=>pickKeys(pk,i));p.append(b);return b;});
   c.pickSel=sel;const mark=i=>{c.pickSel=i;rowsB.forEach((b,k)=>{if(k===i)b.dataset.active='';else delete b.dataset.active;});};mark(sel);
   rowsB.forEach((b,i)=>b.addEventListener('pointermove',()=>mark(i)));
   p.addEventListener('keydown',e=>{const n=rowsB.length;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();mark((c.pickSel+(e.key==='ArrowDown'?1:-1)+n)%n);}
    else if(e.key==='Enter'){e.preventDefault();pickKeys(pk,c.pickSel);}
    else if(e.key==='Escape'){e.preventDefault();sx.control(c.active.id,'keys',{keys:['esc']}).catch(er=>toast(er.message));}});
   c.cards.append(p);}
  form.prepend(c.cards);form.resizePrompt?.();
 }
 // Never auto-picks: arrow presses by position difference from the highlighted row, then enter.
 function pickKeys(pk,i){const d=i-(pk.selected||0),keys=[...Array(Math.abs(d)).fill(d<0?'up':'down'),'enter'];sx.control(c.active.id,'keys',{keys}).catch(e=>toast(e.message));}
 // Slash completion at the composer start: prefix matches first, then substring (same order as the backend's filterCommands).
 function slash(){
  const p=prompt();if(!c.active||c.mode!=='chat'||!c.cat)return;const v=p.value;
  if(!/^\/\S*$/.test(v)){if(c.openMenu?.slash)closeMenu();if(c.sessionHint){c.sessionHint=false;p.placeholder=sessionPH();}return;}
  const q=v.slice(1).toLowerCase(),pre=[],sub=[];
  for(const cm of c.cat.commands){const n=cm.name.toLowerCase();if(n.startsWith(q))pre.push(cm);else if(n.includes(q))sub.push(cm);}
  const list=[...pre,...sub].slice(0,40);if(!list.length){if(c.openMenu?.slash)closeMenu();return;}
  const rows=list.map(cm=>({id:cm.name,label:'/'+cm.name,detail:String(cm.description||'').split('\n')[0],tag:cm.source&&cm.source!=='builtin'?cm.source:'',hint:cm.argumentHint}));
  menu(form,rows,r=>{p.value=`/${r.id} `;p.placeholder=r.hint||sessionPH();c.sessionHint=!!r.hint;p.focus();p.dispatchEvent(new Event('input',{bubbles:true}));},{above:true,slash:true,width:Math.min(560,form.getBoundingClientRect().width),quiet:true});
  p.focus();
 }
 const esc=e=>{if(e.key==='Escape'&&!c.openMenu&&c.active&&c.mode==='chat'&&!e.target.value?.trim?.()&&c.isWorking()){e.preventDefault();sx.control(c.active.id,'interrupt').catch(er=>toast(er.message));}};
 // Mirror the terminal's half-typed input only into an empty, unfocused composer.
 function syncDraft(){
  const p=prompt(),d=c.ui?.meta?.draft;if(!c.active||c.mode!=='chat'||typeof d!=='string'||d===c.lastDraft)return;c.lastDraft=d;
  if(d&&!p.value&&document.activeElement!==p){p.value=d;p.dispatchEvent(new Event('input',{bubbles:true}));}
 }
 // Prompt listeners live only while a session is open.
 function attach(){const p=prompt();p.addEventListener('input',slash);p.addEventListener('keydown',esc);return()=>{p.removeEventListener('input',slash);p.removeEventListener('keydown',esc);};}
 return {closeMenu,pendDone,paintMeta,paintCards,syncDraft,attach};
}
