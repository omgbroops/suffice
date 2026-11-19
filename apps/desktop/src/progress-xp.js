// Run strip: elapsed, tokens, status verb, plan ticks and a level chip. XP comes from real work only (shared/progress-store.mjs).
import {runCtx,rekeyCtx,initial,step,toLogEvent,verbFor,liveStreak,progress,tooltip,stageFor,ACHIEVEMENTS} from '../shared/progress-store.mjs';
const KEY='suffice.progress.v1',SOUND='suffice.progress.sound';
const read=(k,f)=>{try{const v=localStorage.getItem(k);return v==null?f:JSON.parse(v);}catch{return f;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
let saved=read(KEY,null);let state=saved?.state||initial();let tail=saved?.tail||[];
const chips=new Set();// WeakRefs to strip roots: a dropped run's strip is collected, not called forever

// shortcut: strips stay subscribed for the page lifetime; state + last 500 events persist, not the full log; move to a file log when history needs auditing.
function record(ev){if(!ev)return;tail=[...tail.slice(-499),ev];const r=step(state,ev);state=r.state;write(KEY,{state,tail});
 for(const w of chips){const f=w.deref()?._sub;if(f)f(r.unlocked.length>0);else chips.delete(w);}
 if(r.unlocked.length)document.dispatchEvent(new CustomEvent('suffice-toast',{detail:'Unlocked · '+r.unlocked.map(a=>a.title).join(' · ')}));}
document.addEventListener('suffice-rewind-restored',()=>record({tool:'',tokens:0,outcome:'rewind',ts:Date.now()}));
export const progressState=()=>state;
export const soundOn=()=>read(SOUND,false)===true;
function cue(kind){if(!soundOn())return;try{const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();o.frequency.value={finish:660,fail:220,approval:440}[kind];g.gain.setValueAtTime(.05,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.18);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.2);o.onended=()=>c.close();}catch{}}
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};
const fmtT=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const fmtK=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);
const glyph=stage=>{const n=stage+3,pts=Array.from({length:n},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;return (8+6.5*Math.cos(a)).toFixed(2)+','+(8+6.5*Math.sin(a)).toFixed(2);}).join(' ');
 const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 16 16');s.setAttribute('aria-hidden','true');s.innerHTML=`<polygon points="${pts}"/>`;return s;};
const TIPS=['Rewind restores files to an earlier checkpoint.','Cmd+B hides the sidebar.'];
const KEYS=[['Cmd+K','Search'],['Cmd+N','New chat'],['Cmd+B','Sidebar'],['Cmd+,','Settings']];
export {rekeyCtx};
export function createRunStrip(threadId){
 const ctx=runCtx(threadId),root=el('div','run-strip');root.setAttribute('role','group');root.setAttribute('aria-label','Run progress');root.hidden=true;
 const verb=el('span','run-strip-verb','Working'),time=el('span','run-strip-time','0:00'),tok=el('span','run-strip-tokens','0 tokens');
 const chip=el('button','xp-chip');chip.type='button';chip.dataset.tooltipExtra='';chip.setAttribute('aria-haspopup','true');chip.setAttribute('aria-expanded','false');
 const bar=el('span','xp-bar'),fill=el('span','xp-fill');bar.append(fill);const lv=el('span','xp-level'),streak=el('span','xp-streak');
 let menu=null,stageNow=-1,levelNow=0,started=0,timer=0,total=0;
 const paint=levelUp=>{const s=state;const st=stageFor(s.level);
  if(st!==stageNow){chip.querySelector('svg')?.remove();chip.prepend(glyph(st));stageNow=st;}
  lv.textContent='Lv '+s.level;fill.style.transform=`scaleX(${Math.max(0,Math.min(1,progress(s)))})`;
  const k=liveStreak(s);streak.textContent=k>0?k+'d':'';streak.hidden=k<1;
  chip.title=s.level>=2?tooltip(s):'Level '+s.level+' · '+s.xp+' XP';chip.setAttribute('aria-label',chip.title);
  if(levelUp&&s.level>levelNow&&levelNow){chip.classList.remove('xp-up');void chip.offsetWidth;chip.classList.add('xp-up');}levelNow=s.level;};
 chip.append(lv,bar,streak);
 const closeMenu=()=>{menu?.remove();menu=null;chip.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',away,true);document.removeEventListener('keydown',esc,true);};
 const away=e=>{if(menu&&!menu.contains(e.target)&&!chip.contains(e.target))closeMenu();},esc=e=>{if(e.key==='Escape'){closeMenu();chip.focus();}};
 const openMenu=()=>{if(menu)return closeMenu();menu=el('div','xp-menu');menu.setAttribute('role','menu');
  const row=(a,b)=>{const r=el('div','xp-row');r.append(el('span','',a),el('span','xp-dim',b));return r;};
  const s=state;menu.append(row('Level '+s.level+' · '+s.xp+' XP',`${Object.keys(s.achievements).length} of ${ACHIEVEMENTS.length} unlocked`));
  const snd=el('button','xp-row xp-toggle','');snd.type='button';snd.setAttribute('role','menuitemcheckbox');const sp=()=>{snd.replaceChildren(el('span','','Sound cue'),el('span','xp-dim',soundOn()?'On':'Off'));snd.setAttribute('aria-checked',String(soundOn()));};sp();snd.addEventListener('click',()=>{write(SOUND,!soundOn());sp();});menu.append(snd);
  if(s.level>=2)menu.append(el('p','xp-tip',TIPS[(s.level-2)%TIPS.length]));
  if(s.level>=4){const h=el('p','xp-head','Shortcuts');menu.append(h,...KEYS.map(([k,v])=>row(v,k)));}
  menu.popover='manual';root.append(menu);menu.showPopover();{const r=chip.getBoundingClientRect();menu.style.right=(innerWidth-r.right)+'px';menu.style.bottom=(innerHeight-r.top+6)+'px';}chip.setAttribute('aria-expanded','true');document.addEventListener('pointerdown',away,true);document.addEventListener('keydown',esc,true);};
 chip.addEventListener('click',openMenu);
 root.append(verb,time,tok,el('span','run-strip-gap'),chip);
 const tick=()=>{time.textContent=fmtT(Date.now()-started);};
  root._sub=u=>paint(u);chips.add(new WeakRef(root));paint(false);
 return {element:root,
  start(){if(started)return;started=Date.now();root.hidden=false;tick();timer=setInterval(tick,1000);},
  event(ev){this.start();const t=toLogEvent(ev,ctx);if(t){record(t);if(t.outcome==='tokens'){total+=t.tokens;tok.textContent=fmtK(total)+' tokens';}}
   if(ev.event==='tool_start'){verb.textContent=verbFor(ev.name,ev.input);}
   if(ev.event==='tool_end'||ev.event==='assistant_start')verb.textContent='Working';
   if(ev.event==='approval'){verb.textContent='Waiting for approval';cue('approval');}},
  plan(items){if(items.length&&items.every(i=>i.state==='done')&&!ctx.planDone){ctx.planDone=true;record({tool:'',tokens:0,outcome:'plan',ts:Date.now()});}if(!items.every(i=>i.state==='done'))ctx.planDone=false;},
  stop(error,interrupted){clearInterval(timer);tick();if(!error&&!interrupted)record({tool:'',tokens:0,outcome:'finish',ts:Date.now()});verb.textContent=error?'Failed':interrupted?'Stopped':'Done';if(error)cue('fail');else if(!interrupted)cue('finish');closeMenu();}};
}
