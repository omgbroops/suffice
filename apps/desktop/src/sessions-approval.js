import {icon} from './ui.js';
import {connectOverlayScrollbar} from './overlay-scrollbar.js';
import {leadLine,hint,createLater} from './permission-card.js';

// CLI-session prompts reuse the composer-approval markup and classes from approvals.js; styles live in desktop.css.
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const base=p=>String(p||'').split('/').filter(Boolean).pop()||'';
export const DENY=/^(no\b|deny|reject|cancel|keep planning|tell claude what to change)/i;
const EDIT=/^(Edit|Write|MultiEdit|NotebookEdit)$/;
const HEAD=/^(Claude Code v|claude-\S+ with \w+ effort)/;

const lines=(t,c)=>String(t).split('\n').map(l=>c+l).join('\n');
/** -/+ rows from the pending Edit/MultiEdit/Write input; '' when the input has no change. */
const editDiff=i=>{
 const es=Array.isArray(i.edits)?i.edits:typeof i.new_string==='string'?[i]:[];
 if(es.length)return es.map(e=>(e.old_string?lines(e.old_string,'- ')+'\n':'')+lines(e.new_string??'','+ ')).join('\n');
 return typeof i.content==='string'?lines(i.content,'+ '):'';
};
/** Icon, label and preview for a prompt, from the pending tool item when there is one, else from the prompt text. */
export function describePrompt(p,items=[]){
 let tool=[...items].reverse().find(i=>i.kind==='tool'&&i.status==='running')||null;
 const body=(p.body||'').split('\n').filter(l=>!HEAD.test(l.trim())).join('\n').trim();
 if(p.type==='choice'&&!body&&tool?.name!=='ExitPlanMode')tool=null; // a plain question is not about the running tool
 const input=tool?.input||{},first=body.split('\n')[0]?.trim()||'';
 const plan=(typeof input.plan==='string'&&input.plan.trim())||p.plan||'';
 if(plan||tool?.name==='ExitPlanMode')return {icon:'plan',label:'Plan',markdown:plan||body};
 if(p.type==='trust'){const path=body.split('\n').find(l=>/^[~\/]/.test(l.trim()));return {icon:'folder',label:'Folder',text:path?path.trim():body};}
 if(tool?.name==='Bash'||/^Bash command/i.test(first))return {icon:'terminal',label:'Command',text:typeof input.command==='string'?input.command:body};
 if(EDIT.test(tool?.name||'')||/^(Edit|Write|Create|Update) (file|notebook)/i.test(first)){
  const file=base(input.file_path||input.notebook_path||body.split('\n')[1]);
  return {icon:'pencil',label:file?`Edit ${file}`:'Edit',text:editDiff(input)||body};}
 return body?{icon:'file',label:'Request',text:body}:null;
}

export function createApproval({form,markdown,answer,answerMulti,agent=()=>''}){
 let card=null,sig='',off=()=>{},stopSb=()=>{},later=null;
 function clear(){off();off=()=>{};stopSb();stopSb=()=>{};later?.drop();later=null;if(!card)return;const had=card.contains(document.activeElement);card.remove();card=null;sig='';delete form.dataset.approval;for(const c of form.children)c.inert=false;form.resizePrompt?.();if(had)form.querySelector('textarea')?.focus({preventScroll:true});}
 function draw(p,items){
  const s=p?JSON.stringify([p,items?.at(-1)?.id,items?.at(-1)?.status]):'';
  if(s===sig)return;
  const hadFocus=!card||card.contains(document.activeElement)||form.contains(document.activeElement)||document.activeElement===document.body;
  clear();sig=s;if(!p)return;
  card=el('section','composer-approval');card.setAttribute('aria-label','Agent approval');
  const d=describePrompt(p,items);let pending=null;
  card.append(leadLine(agent(),d?.label||'Request'));
  if(d){const a=el('div','approval-action');a.innerHTML=icon(d.icon);a.append(el('span','',d.label));
   const host=el('div','approval-preview-host');
   if(d.markdown&&markdown){const md=el('div','approval-preview approval-plan');md.tabIndex=0;md.setAttribute('aria-label','Plan');markdown(md,d.markdown);host.append(md);}
   else if(d.text||d.markdown){const pre=el('pre','approval-preview'),code=el('code','',d.text||d.markdown);pre.tabIndex=0;pre.setAttribute('aria-label','Requested action');pre.append(code);host.append(pre);pending=[pre,code,d.icon==='terminal'?'input.sh':''];}
   card.append(a);if(host.childNodes.length)card.append(host);}
  card.append(el('h3','',p.title||'Agent needs input'));
  later=createLater(form,card);delete later.button.dataset.key;later.button.removeAttribute('aria-keyshortcuts'); // Esc denies in sessions
  const ctl=el('div','approval-controls',''),buttons=[],opts=p.options||[],yes=opts.find(o=>o.index===p.selected)||opts[0],no=opts.find(o=>DENY.test(o.label));
  ctl.append(later.button);
  const multi=p.multiSelect&&answerMulti,rows=multi?opts.filter(o=>'checked' in o&&!o.other):[],on=new Set(rows.filter(o=>o.checked).map(o=>o.index)),boxes=[];
  if(multi){ // checkboxes: arrows move, Space/Enter or a digit toggles, Ctrl+Enter or Submit sends the set
   const list=el('div','approval-options');list.setAttribute('role','group');list.setAttribute('aria-label',p.title||'Options');
   const toggle=(o,b)=>{on.has(o.index)?on.delete(o.index):on.add(o.index);b.setAttribute('aria-checked',String(on.has(o.index)));};
   for(const [n,o] of rows.entries()){const b=el('button','approval-option');b.type='button';b.setAttribute('role','checkbox');b.setAttribute('aria-checked',String(o.checked));b.tabIndex=n?-1:0;
    b.append(el('span','approval-box'),el('span','approval-option-label',o.label));hint(b,String(n+1));b.dataset.index=o.index;
    b.addEventListener('click',()=>toggle(o,b));
    b.addEventListener('keydown',e=>{const d=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;if(!d)return;e.preventDefault();e.stopPropagation();const t=boxes[(n+d+boxes.length)%boxes.length][1];for(const [,x] of boxes)x.tabIndex=-1;t.tabIndex=0;t.focus();});
    list.append(b);boxes.push([o,b]);}
   card.append(list);
  }
  for(const [n,o] of multi?opts.filter(o=>!rows.includes(o)&&!o.other).entries():opts.entries()){const b=el('button',`provider-dialog-button${!multi&&o.index===p.selected?' provider-dialog-primary':''}`,o.label);b.type='button';
   if(multi)b.setAttribute('aria-label',o.label);else hint(b,o===yes?'Ctrl ↵':o===no?'Esc':String(n+1));
   b.addEventListener('click',()=>answer(o.index));ctl.append(b);buttons.push([o,b]);}
  if(multi){const b=el('button','provider-dialog-button provider-dialog-primary','Submit');b.type='button';hint(b,'Ctrl ↵');b.addEventListener('click',()=>answerMulti([...on]));ctl.append(b);buttons.push([{index:-1},b]);}
  card.append(ctl);form.append(card);form.dataset.approval='true';
  if(pending){const [pre,code,lang]=pending;stopSb=connectOverlayScrollbar(pre,{inset:6});if(lang)import('./code-highlight.js').then(({colorCode})=>colorCode(code,lang)).catch(()=>{});}
  for(const c of form.children)c.inert=c!==card;form.resizePrompt?.();
  const key=e=>{
   if(card.hidden)return;
   if(!e.defaultPrevented&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&yes){e.preventDefault();e.stopPropagation();multi?answerMulti([...on]):answer(yes.index);return;}
   if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
   if(!card.contains(e.target)&&e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
   const n=/^[1-9]$/.test(e.key)?Number(e.key)-1:-1;if(multi){const bx=boxes[n];if(bx){e.preventDefault();e.stopPropagation();bx[1].click();bx[1].focus({preventScroll:true});}return;}const hit=n>=0?p.options?.[n]:e.key==='Escape'?p.options?.find(o=>DENY.test(o.label)):null;
   if(!hit)return;e.preventDefault();e.stopPropagation();answer(hit.index);};
  document.addEventListener('keydown',key,true);off=()=>document.removeEventListener('keydown',key,true);
  if(hadFocus)(boxes[0]?.[1]||ctl.querySelector('.provider-dialog-primary')||buttons[0]?.[1])?.focus({preventScroll:true});
 }
 return {draw,clear};
}
