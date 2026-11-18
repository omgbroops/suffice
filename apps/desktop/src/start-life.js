import './start-life.css';
// Start screen: greeting with project and branch, Needs-you count, a "Try ..." placeholder from real repo state, 3 recent threads.
const q=(s,r=document)=>r.querySelector(s);
const mk=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const motionOk=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
export const greeting=(h=new Date().getHours())=>h<5?'Still up':h<12?'Good morning':h<18?'Good afternoon':'Good evening';
export const ago=(ms,now=Date.now())=>{const s=Math.max(0,Math.floor((now-ms)/1000));return s<60?'just now':s<3600?Math.floor(s/60)+'m ago':s<86400?Math.floor(s/3600)+'h ago':Math.floor(s/86400)+'d ago';};
const NEEDS=['approval','input','failed'];
// Priority: failing test, uncommitted files, TODO/FIXME, last thread.
export function suggestions({failing=[],changes=[],todos=[],thread=null}){
 const out=[];
 if(failing[0])out.push(`Fix the failing test “${failing[0]}”`);
 if(changes.length)out.push(changes.length===1?`Review my change to ${changes[0]}`:`Review my ${changes.length} uncommitted changes`);
 if(todos[0])out.push(`Resolve the ${todos[0].kind} in ${todos[0].file.split('/').pop()}: ${todos[0].text}`);
 if(thread)out.push(`Continue “${thread.title}”`);
 return out;
}
const COMPOSE = '<svg class="icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="m9.2 9.8-2.4.6.6-2.4 4.5-4.5a1.1 1.1 0 0 1 1.6 1.6z"/></svg>';
function connectSidebarLife(){
 const $=(s,r=document)=>r.querySelector(s);
  // New session icon: compose-square, 14px.
  const ns = $('.new-session .icon, .new-session svg');
  if (ns) ns.outerHTML = COMPOSE;

  // Sidebar skeleton while sessions load; removed when the first real row lands or after 3 s.
  const sessions = $('.sidebar-sessions');
  const skeleton = () => {
    if (!sessions || $('.sidebar-skeleton')) return;
    const sk = document.createElement('div'); sk.className = 'sidebar-skeleton'; sk.setAttribute('aria-hidden', 'true');
    sk.innerHTML = '<i class="sk-head"></i>' + Array.from({ length: 5 }, () => '<div class="sk-row"><i class="sk-title"></i><i class="sk-meta"></i></div>').join('');
    sessions.prepend(sk);
    const done = () => { sk.remove(); mo.disconnect(); clearTimeout(timer); };
    const mo = new MutationObserver(() => { if ($('.thread-row', sessions)) done(); });
    mo.observe(sessions, { childList: true });
    const timer = setTimeout(done, 3000);
  };
  if (sessions && !$('.thread-row', sessions)) skeleton();
  document.addEventListener('suffice-sidebar-loading', skeleton);
}
export function connectStartLife({api}={}){
 connectSidebarLife();
 const area=q('.agent-area'),form=q('.composer'),prompt=q('#prompt'),workspace=q('.workspace');
 if(!area||!form||!prompt)return;
 const head=mk('div','life life-head'),tail=mk('div','life life-tail');
 head.append(mk('h2','life-hello'),mk('p','life-sub'));tail.append(mk('p','life-label','Pick up where you left off'),mk('div','life-strip'));
 const base=prompt.placeholder;let hints={failing:[],todos:[]},list=[],idx=0,first=true,timer=0;
 // Idle motion stops while the user types or the box is focused.
 const quiet=()=>area.classList.toggle('life-quiet',!!prompt.value||document.activeElement===prompt);
 for(const ev of ['input','focus','blur'])prompt.addEventListener(ev,quiet);
 const rows=()=>[...new Set(document.querySelectorAll('.sidebar .thread-row'))].filter(r=>r._threadDetails);
 const setPh=()=>{prompt.placeholder=list.length?`Try: ${list[idx%list.length]}  ·  Tab to use`:base;};
 // Tab on an empty box writes the suggestion in, ready to send with Enter.
 prompt.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey&&!prompt.value&&list.length&&!document.querySelector('.thread-followups')){e.preventDefault();prompt.value=list[idx%list.length];prompt.dispatchEvent(new Event('input',{bubbles:true}));prompt.setSelectionRange(prompt.value.length,prompt.value.length);}});
 async function pull(){
  const [h,c]=await Promise.all([api?.startHints?.().catch(()=>null),api?.changes?.().catch(()=>null)]);
  hints=h||{failing:[],todos:[]};hints.changes=(c?.entries||[]).map(e=>e.path);draw();
 }
 function draw(){clearTimeout(timer);timer=setTimeout(render,0);}
 function render(){
  const rs=rows().sort((a,b)=>(b._threadDetails.modified||0)-(a._threadDetails.modified||0));
  const project=q('.project-picker .project-name')?.textContent||'',branch=q('.git-pill:not([hidden]) span')?.textContent||'';
  const has=project&&project!=='Select project';
  const text=greeting();const h=head.firstChild;if(h.textContent!==text)h.textContent=text;
  const sub=head.lastChild,needing=rs.filter(r=>NEEDS.includes(r.dataset.status));
  const where=has?project+(branch?' on '+branch:''):'Choose a project to begin';
  const pill=mk('button','life-needs',needing.length?`${needing.length} need${needing.length===1?'s':''} you`:'All clear');pill.type='button';pill.dataset.count=String(needing.length);pill.disabled=!needing.length;
  pill.addEventListener('click',()=>needing[0]?.click());
  sub.replaceChildren(mk('span','life-where',where),...(has?[mk('span','life-dot','·'),pill]:[]));
  const next=suggestions({...hints,thread:rs[0]?._threadDetails});
  if(next.join('|')!==list.join('|')){list=next;idx=0;if(!prompt.value)setPh();}
  const strip=tail.lastChild;
  strip.replaceChildren(...rs.slice(0,3).map((row,i)=>{const t=row._threadDetails;
   const b=mk('button','life-card');b.type='button';b.dataset.status=row.dataset.status||'idle';b.style.setProperty('--i',i+3);
   const st=row.querySelector('.thread-state')?.cloneNode(true);
   const hd=mk('span','life-card-head');if(st)hd.append(st);hd.append(mk('span','life-card-time',ago(t.modified)));
   b.append(hd,mk('span','life-card-title',t.title),mk('span','life-card-meta',t.agent||t.branch||t.project||''));
   b.addEventListener('click',()=>row.click());return b;}));
  tail.hidden=!rs.length;
  if(first){first=false;if(motionOk())for(const n of [h,sub,tail.firstChild,...strip.children])n.classList.add('life-in');}
  [h,sub,tail.firstChild].forEach((n,i)=>n.style.setProperty('--i',i));
 }
 area.prepend(head);form.after(tail);area.dataset.life='on';
 // Idle: rotate the suggestion every 6 s unless typing, focused, or reduced motion.
 if(motionOk())setInterval(()=>{if(list.length<2||prompt.value||document.activeElement===prompt||workspace?.classList.contains('thread-view'))return;prompt.classList.add('life-ph-out');setTimeout(()=>{idx++;setPh();prompt.classList.remove('life-ph-out');},180);},6000);
 pull();draw();
 new MutationObserver(draw).observe(q('.sidebar'),{childList:true,subtree:true});
 new MutationObserver(draw).observe(q('.project-bar')||area,{childList:true,subtree:true,characterData:true});
 document.addEventListener('suffice-project-selected',()=>{pull();});
 window.addEventListener('focus',pull);
}
