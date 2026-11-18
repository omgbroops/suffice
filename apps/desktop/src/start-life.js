import './start-life.css';
import {paintStarterImage,sampleWallpaper} from './start-cards.js';
// Start screen: mark + title, Needs-you pill when something waits, a suggestion typed into the composer once, 3 starter cards drawn in the wallpaper's own dither.
const q=(s,r=document)=>r.querySelector(s);
const mk=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const motionOk=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
export const greeting=(h=new Date().getHours())=>h<5?'Still up? Build something.':h<12?'Morning. What are we building?':h<18?'What are we building this afternoon?':'What are we building tonight?';
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
// Starter prompts: the card shows a short title; clicking writes the full prompt into the composer.
export const STARTERS=[
 {title:'Explain this codebase',prompt:'Give me a tour of this codebase: the main modules, how they connect, and where to start reading.'},
 {title:'Fix a failing test',prompt:'Run the tests, find the first failure, and fix it with the smallest change.'},
 {title:'Review my changes',prompt:'Review my uncommitted changes and list bugs, risks and missing tests.'},
];
export const TYPE_MS=30;
export function connectStartLife({api}={}){
 connectSidebarLife();
 const area=q('.agent-area'),form=q('.composer'),prompt=q('#prompt'),workspace=q('.workspace');
 if(!area||!form||!prompt)return;
 const head=mk('div','life life-head'),tail=mk('div','life life-tail');
 const mark=mk('span','life-mark','[suffice]');mark.setAttribute('aria-hidden','true');
 head.append(mark,mk('h2','life-hello'),mk('div','life-sub'));
 const base=prompt.placeholder;let hints={failing:[],todos:[]},list=[],first=true,timer=0,typed=false,typer=0;
 const home=()=>!workspace?.classList.contains('thread-view');
 const full=()=>list.length&&home()?`${list[0]}  \u00b7  Tab to use`:base;
 const setPh=()=>{if(typer)return;prompt.placeholder=full();};
 // Typewriter: once, ~30 ms a character, in the placeholder's greyed colour. Focus, typing or reduced motion finishes it at once.
 function typeOnce(){
  if(typed)return;typed=true;
  const text=full();
  if(!motionOk()||prompt.value||!home()){prompt.placeholder=text;return;}
  let i=0;prompt.placeholder='';
  const stop=()=>{clearInterval(typer);typer=0;prompt.placeholder=full();prompt.removeEventListener('focus',stop);prompt.removeEventListener('input',stop);};
  typer=setInterval(()=>{i++;prompt.placeholder=text.slice(0,i);if(i>=text.length)stop();},TYPE_MS);
  prompt.addEventListener('focus',stop);prompt.addEventListener('input',stop);
 }
 if(motionOk()&&home())prompt.placeholder='';
 setTimeout(()=>typeOnce(),1500);
 const rows=()=>[...new Set(document.querySelectorAll('.sidebar .thread-row'))].filter(r=>r._threadDetails);
 // Tab on an empty box writes the suggestion in, ready to send with Enter.
 const fill=text=>{prompt.value=text;prompt.dispatchEvent(new Event('input',{bubbles:true}));prompt.focus();prompt.setSelectionRange(text.length,text.length);};
 prompt.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey&&!prompt.value&&list.length&&home()&&!document.querySelector('.thread-followups')){e.preventDefault();fill(list[0]);}});
 async function pull(){
  const [h,c]=await Promise.all([api?.startHints?.().catch(()=>null),api?.changes?.().catch(()=>null)]);
  hints=h||{failing:[],todos:[]};hints.changes=(c?.entries||[]).map(e=>e.path);draw();
 }
 function draw(){clearTimeout(timer);timer=setTimeout(render,0);}
 function render(){
  const rs=rows().sort((a,b)=>(b._threadDetails.modified||0)-(a._threadDetails.modified||0));
  const text=greeting();const h=head.querySelector('.life-hello');if(h.textContent!==text)h.textContent=text;
  const sub=head.querySelector('.life-sub'),needing=rs.filter(r=>NEEDS.includes(r.dataset.status));
  if(needing.length){const pill=mk('button','life-needs',`${needing.length} need${needing.length===1?'s':''} you`);pill.type='button';pill.dataset.count=String(needing.length);pill.addEventListener('click',()=>needing[0]?.click());sub.replaceChildren(pill);}else sub.replaceChildren();
  const next=suggestions({...hints,thread:rs[0]?._threadDetails});
  if(next.join('|')!==list.join('|')){list=next;if(!prompt.value)setPh();}
  if(!tail.firstChild)buildCards();
  if(first){first=false;typeOnce();if(motionOk())for(const n of [mark,h,...tail.children])n.classList.add('life-in');}
  [mark,h,...tail.children].forEach((n,i)=>n.style.setProperty('--i',i));
 }
 function buildCards(){
  const tones=sampleWallpaper();
  tail.replaceChildren(...STARTERS.map((st,i)=>{
   const b=mk('button','start-card');b.type='button';b.dataset.starter=String(i);b.title=st.prompt;
   const art=mk('canvas','start-card-art');art.width=240;art.height=96;art.setAttribute('aria-hidden','true');
   b.append(art,mk('span','start-card-title',st.title));
   b.addEventListener('click',()=>fill(st.prompt));
   paintStarterImage(art,tones[i],i);
   return b;}));
 }
 // The cards sample the wallpaper's colours; repaint when the theme or wallpaper changes.
 new MutationObserver(()=>{tail.replaceChildren();draw();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 area.prepend(head);
 form.after(tail);area.dataset.life='on';
 if(workspace)new MutationObserver(()=>{if(!prompt.value)setPh();}).observe(workspace,{attributes:true,attributeFilter:['class']});
 pull();draw();
 new MutationObserver(draw).observe(q('.sidebar'),{childList:true,subtree:true});
 document.addEventListener('suffice-project-selected',()=>{pull();});
 window.addEventListener('focus',pull);
}
