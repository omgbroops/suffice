import './context-inspector.css';
import {icon} from './ui.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {threadViewState as viewState} from './thread-view-state.js';

const KINDS=[['system','System'],['skills','Skills'],['files','Files'],['tools','Tool schemas'],['history','History']];
const fmt=n=>n>=1000?(n/1000).toFixed(n>=10000?0:1)+'k':String(n);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};

// Composer chip + popover: what the next turn will send, per category, with removal and summaries-only.
export function connectContextInspector({api,form,toast}){
 const choices=new Map();let data=null,usage=null,panel=null,off=null,viewing=0,loads=0;
 const mine=id=>{if(!choices.has(id))choices.set(id,{exclude:new Set(),summaries:false});return choices.get(id);};
 const chip=el('button','button context-chip');chip.type='button';chip.setAttribute('aria-haspopup','dialog');chip.setAttribute('aria-expanded','false');chip.setAttribute('aria-label','Context inspector');
 form.querySelector('.toolbar-right').prepend(chip);

 // Tokens the next turn sends after the user's removals and the summaries toggle.
 function nextTotal(items,choice){
  return items.reduce((sum,item)=>choice.exclude.has(item.id)&&!item.fixed?sum:sum+(choice.summaries&&item.summaryTokens!=null?item.summaryTokens:item.tokens),0);
 }
 function paintChip(){
  // No estimate (or an empty one): fall back to the real count the run's usage reported.
  const id=viewState.id,est=data?.items?.length?nextTotal(data.items,mine(id)):0,total=est||usage?.totalTokens||usage?.windowTokens||0;
  chip.innerHTML=icon('context')+`<span>${fmt(total)}</span>`;chip.title=`Context: ${total.toLocaleString()} tokens`;
 }
 async function load(){
  const id=viewState.id,run=++loads;
  if(!id||String(id).startsWith('session-')||String(id).startsWith('pending:')){data=null;usage=null;paintChip();return;}
  try{const u=await api.usage?.(id);if(run===loads)usage=u||null;}catch{if(run===loads)usage=null;}
  try{const result=await api.context(id);if(run!==loads)return;data=result;}catch{if(run!==loads)return;data=null;}
  paintChip();if(panel)paintPanel();
 }

 function close(){
  if(!panel)return;const node=panel;panel=null;off?.();removeEventListener('resize',place);off=null;chip.setAttribute('aria-expanded','false');hidePopover(node,()=>node.remove());
 }
 function open(){
  if(panel){close();return;}
  panel=el('div','popover context-inspector');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Context inspector');panel.tabIndex=-1;viewing=0;
  document.body.append(panel);paintPanel();
  const outside=event=>{if(!panel.contains(event.target)&&!chip.contains(event.target))close();};
  const key=event=>{if(event.key==='Escape'){event.stopPropagation();close();chip.focus();}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);let frame=0,lastTop=-1;const follow=()=>{if(!panel)return;const top=form.getBoundingClientRect().top;if(top!==lastTop){lastTop=top;place();}frame=requestAnimationFrame(follow);};follow();off=()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);};
  chip.setAttribute('aria-expanded','true');addEventListener('resize',place);showPopover(panel);panel.addEventListener('animationend',()=>place(),{once:true});setTimeout(()=>panel&&place(),250);panel.focus({preventScroll:true});void load();
 }
 chip.addEventListener('click',open);
 api.onEvent?.(event=>{if(event.event==='usage'&&event.usage&&(!event.threadId||event.threadId===viewState.id)){usage=event.usage;paintChip();}});

 function place(){
  const r=form.getBoundingClientRect(),w=Math.min(r.width,520);
  panel.style.width=w+'px';panel.style.left=Math.max(12,r.right-w)+'px';
  panel.style.top='';panel.style.bottom=(innerHeight-r.top+8)+'px';panel.style.setProperty('--popover-origin','bottom right');
 }

 function paintPanel(){
  const id=viewState.id,choice=mine(id),turns=data?.turns||[],turn=viewing?turns.find(t=>t.n===viewing):null,live=!turn;
  const items=turn?turn.items:data?.items||[],removed=live?choice.exclude:new Set(turn.removed),summaries=live?choice.summaries:turn.summaries;
  const total=items.reduce((sum,item)=>removed.has(item.id)&&!item.fixed?sum:sum+(summaries&&item.summaryTokens!=null?item.summaryTokens:item.tokens),0);
  const head=el('div','context-head');head.append(el('span','context-title','Context'));
  const count=el('span','context-total',`${total.toLocaleString()} tokens${data?.window?` of ${fmt(data.window)}`:''}`);head.append(count);
  const body=[head];
  if(turns.length){
   const tabs=el('div','context-turns');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Turn');
   for(const [n,label] of [[0,'Next turn'],...turns.map(t=>[t.n,`Turn ${t.n}`])]){const b=el('button','context-turn',label);b.type='button';b.setAttribute('aria-pressed',String(viewing===n));b.addEventListener('click',()=>{viewing=n;paintPanel();});tabs.append(b);}
   body.push(tabs);
  }
  if(!items.length){body.push(el('p','context-empty','Nothing in context yet. Send a message and the system prompt, tools and history appear here.'));}
  else{
   const bar=el('div','context-bar');bar.setAttribute('role','img');bar.setAttribute('aria-label','Tokens by category');
   for(const [kind,label] of KINDS){const sum=items.filter(i=>i.kind===kind).reduce((s,i)=>removed.has(i.id)&&!i.fixed?s:s+i.tokens,0);if(sum){const seg=el('span','context-seg');seg.dataset.kind=kind;seg.style.flexGrow=String(sum);seg.title=`${label}: ${sum.toLocaleString()}`;bar.append(seg);}}
   body.push(bar);
   const row=el('div','context-switch-row');const text=el('div','context-switch-text');text.append(el('span','context-switch-label','Summaries only'),el('span','context-hint','Replace long tool results with a short summary'));
   const sw=el('button','settings-switch');sw.type='button';sw.setAttribute('role','switch');sw.setAttribute('aria-label','Summaries only');sw.setAttribute('aria-checked',String(summaries));sw.disabled=!live;if(!live){sw.setAttribute('aria-disabled','true');sw.title='Read-only for past turns';}sw.append(document.createElement('span'));
   sw.addEventListener('click',()=>{choice.summaries=!choice.summaries;paintChip();paintPanel();});row.append(text,sw);body.push(row);
   if(!items.some(i=>i.kind==='system'))body.push(el('p','context-note','System prompt, skills and tools are counted once the next message is sent.'));
   for(const [kind,label] of KINDS){
    const group=items.filter(i=>i.kind===kind);if(!group.length)continue;
    const sum=group.reduce((s,i)=>removed.has(i.id)&&!i.fixed?s:s+(summaries&&i.summaryTokens!=null?i.summaryTokens:i.tokens),0);
    const d=el('details','context-group');d.open=kind==='history'||kind==='files'||kind==='system';d.dataset.kind=kind;
    const s=el('summary','context-group-head');s.append(el('span','context-dot'),el('span','context-group-name',label),el('span','context-group-count',String(group.length)),el('span','context-group-tokens',fmt(sum)));d.append(s);
    const list=el('ul','context-items');
    for(const item of group){
     const gone=removed.has(item.id)&&!item.fixed,li=el('li','context-item');li.dataset.id=item.id;if(gone)li.dataset.removed='';
     const name=el('span','context-item-name',item.label);name.title=item.label;
     const useSum=summaries&&item.summaryTokens!=null,shown=useSum?item.summaryTokens:item.tokens;
     const tok=el('span','context-item-tokens',useSum?`${fmt(shown)} (summary)`:fmt(shown));li.append(name,tok);
     if(live&&!item.fixed){const b=el('button','context-remove');b.type='button';b.innerHTML=icon(gone?'undo':'close');b.setAttribute('aria-label',`${gone?'Keep':'Remove'} ${item.label} ${gone?'in':'from'} the next turn`);b.title=gone?'Keep in next turn':'Remove from next turn';b.addEventListener('click',()=>{if(gone)choice.exclude.delete(item.id);else choice.exclude.add(item.id);paintChip();paintPanel();});li.append(b);}
     else li.append(el('span','context-remove-gap'));
     list.append(li);
    }
    d.append(list);body.push(d);
   }
   body.push(el('p','context-note',live?'Removals apply to the next message only.':'What this turn sent. Removed items were left out.'));
  }
  const keep=panel.querySelector('.context-body')?.scrollTop||0,wrap=el('div','context-body');wrap.append(...body);panel.replaceChildren(wrap);place();wrap.scrollTop=keep;
 }

 document.addEventListener('suffice:usage-change',()=>void load());
 viewState.subscribe(e=>{if(e.type==='select')void load();});
 paintChip();
 return {
  // The choices for a send: removals last one message, the summaries switch stays until turned off.
  take(id=viewState.id){const c=choices.get(id);if(!c)return {exclude:[],summaries:false};const out={exclude:[...c.exclude],summaries:c.summaries};c.exclude.clear();paintChip();return out;},
  refresh:load,
 };
}
