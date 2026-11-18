import './screen.css';
import {createDictation} from './voice/dictation.js';
import {threadViewState} from './thread-view-state.js';
const el=(tag,cls,attrs={})=>{const n=document.createElement(tag);n.className=cls;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
const MIC='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const WAVE='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2"/></svg>';
// One composer for standard and session chat: the box holds "+", the text and the dictate/voice/send cluster; one row below holds
// project and token usage (left), access mode, model with effort, and the context ring (right).
export function connectComposerLayout({form,prompt,toast=()=>{}}){
 if(!form||!prompt||form.dataset.layout==='box')return;
 const area=form.parentElement,toolbar=form.querySelector('.composer-toolbar');
 const attach=form.querySelector('[data-action="attach"]'),group=form.querySelector('.send-group'),voice=form.querySelector('.voice-start');
 const access=form.querySelector('.access-mode-picker'),model=form.querySelector('.model-button'),chip=form.querySelector('.context-chip');
 const bar=area.querySelector('.project-bar'),ring=document.querySelector('.context-ring');
 // Row inside the box: + | text | dictate, voice or send.
 const row=el('div','composer-row'),actions=el('div','composer-actions');
 const dictate=el('button','button button--ghost dictate-button',{type:'button','aria-label':'Dictate','aria-pressed':'false',title:'Dictate'});dictate.innerHTML=MIC;
 if(voice){voice.innerHTML=WAVE;voice.title='Voice conversation';}
 actions.append(dictate,...(voice?[voice]:[]),group);
 prompt.before(row);row.append(...(attach?[attach]:[]),prompt,actions);
 toolbar?.remove();
 // Row below the box.
 const meta=el('div','composer-meta'),left=el('div','composer-meta-left'),right=el('div','composer-meta-right');
 if(bar)left.append(bar);
 if(chip)left.append(chip);
 for(const node of [access,model,ring])if(node)right.append(node);
 meta.append(left,right);form.after(meta);
 // Typed text turns the voice button into Send.
 const sync=()=>{const on=!!prompt.value.trim()||!!form.attachments?.count;form.dataset.hasInput=String(on);};
 form.dataset.hasInput='false';
 prompt.addEventListener('input',sync);
 form.addEventListener('submit',()=>{queueMicrotask(sync);requestAnimationFrame(sync);},true);
 threadViewState.subscribe(()=>queueMicrotask(sync));
 for(const tray of form.querySelectorAll('.attachment-tray'))new MutationObserver(sync).observe(tray,{attributes:true,childList:true});
 // Dictate: record, then write the transcript at the caret.
 const dictation=createDictation({onState:({state,message})=>{dictate.setAttribute('aria-pressed',String(state==='recording'));dictate.dataset.state=state;if(state==='error'&&message)toast(message);}});
 dictate.addEventListener('click',async()=>{
  if(dictation.state==='recording'){const text=await dictation.accept();if(!text)return;const at=prompt.selectionEnd??prompt.value.length,pad=at&&!/\s$/.test(prompt.value.slice(0,at))?' ':'';prompt.setRangeText(pad+text,at,at,'end');prompt.dispatchEvent(new Event('input',{bubbles:true}));prompt.focus();return;}
  if(dictation.state==='idle'||dictation.state==='error')void dictation.start();
 });
 form.dataset.layout='box';
}
