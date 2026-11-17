import {icon} from './ui.js';
import './sessions-approval.css';

// CLI-session prompts reuse the composer-approval markup and classes from approvals.js; styles live in desktop.css.
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const base=p=>String(p||'').split('/').filter(Boolean).pop()||'';
const DENY=/^(no\b|deny|reject|cancel|keep planning|tell claude what to change)/i;
const EDIT=/^(Edit|Write|MultiEdit|NotebookEdit)$/;
const HEAD=/^(Claude Code v|claude-\S+ with \w+ effort)/;

/** Icon, label and preview for a prompt, from the pending tool item when there is one, else from the prompt text. */
export function describePrompt(p,items=[]){
 let tool=[...items].reverse().find(i=>i.kind==='tool'&&i.status==='running')||null;
 const body=(p.body||'').split('\n').filter(l=>!HEAD.test(l.trim())).join('\n').trim();
 if(p.type==='choice'&&!body&&tool?.name!=='ExitPlanMode')tool=null; // a plain question is not about the running tool
 const input=tool?.input||{},first=body.split('\n')[0]?.trim()||'';
 const plan=(typeof input.plan==='string'&&input.plan.trim())||p.plan||'';
 if(plan||tool?.name==='ExitPlanMode')return {icon:'plan',label:'Plan',markdown:plan||body};
 if(p.type==='trust')return {icon:'folder',label:'Folder',text:body};
 if(tool?.name==='Bash'||/^Bash command/i.test(first))return {icon:'terminal',label:'Command',text:typeof input.command==='string'?input.command:body};
 if(EDIT.test(tool?.name||'')||/^(Edit|Write|Create|Update) (file|notebook)/i.test(first)){
  const file=base(input.file_path||input.notebook_path||body.split('\n')[1]);
  return {icon:'pencil',label:file?`Edit ${file}`:'Edit',text:body};}
 return body?{icon:'file',label:'Request',text:body}:null;
}

export function createApproval({form,markdown,answer}){
 let card=null,sig='',off=()=>{};
 function clear(){off();off=()=>{};if(!card)return;card.remove();card=null;sig='';delete form.dataset.approval;for(const c of form.children)c.inert=false;form.resizePrompt?.();}
 function draw(p,items){
  const s=p?JSON.stringify([p,items?.at(-1)?.id,items?.at(-1)?.status]):'';
  if(s===sig)return;
  const hadFocus=!card||card.contains(document.activeElement)||form.contains(document.activeElement)||document.activeElement===document.body;
  clear();sig=s;if(!p)return;
  card=el('section','composer-approval');card.setAttribute('aria-label','Agent approval');
  card.append(el('h3','',p.title||'Agent needs input'));
  const d=describePrompt(p,items);
  if(d){const a=el('div','approval-action');a.innerHTML=icon(d.icon);a.append(el('span','',d.label));
   const host=el('div','approval-preview-host');
   if(d.markdown&&markdown){const md=el('div','approval-preview approval-plan');md.tabIndex=0;md.setAttribute('aria-label','Plan');markdown(md,d.markdown);host.append(md);}
   else if(d.text||d.markdown){const pre=el('pre','approval-preview');pre.tabIndex=0;pre.setAttribute('aria-label','Requested action');pre.append(el('code','',d.text||d.markdown));host.append(pre);}
   card.append(a);if(host.childNodes.length)card.append(host);}
  const ctl=el('div','approval-controls'),buttons=[];
  for(const o of p.options||[]){const b=el('button',`provider-dialog-button${o.index===p.selected?' provider-dialog-primary':''}`,o.label);b.type='button';
   b.addEventListener('click',()=>answer(o.index));ctl.append(b);buttons.push([o,b]);}
  card.append(ctl);form.append(card);form.dataset.approval='true';
  for(const c of form.children)c.inert=c!==card;form.resizePrompt?.();
  const key=e=>{
   if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
   if(!card.contains(e.target)&&e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
   const n=/^[1-9]$/.test(e.key)?Number(e.key)-1:-1,hit=n>=0?p.options?.[n]:e.key==='Escape'?p.options?.find(o=>DENY.test(o.label)):null;
   if(!hit)return;e.preventDefault();e.stopPropagation();answer(hit.index);};
  document.addEventListener('keydown',key,true);off=()=>document.removeEventListener('keydown',key,true);
  if(hadFocus)(ctl.querySelector('.provider-dialog-primary')||buttons[0]?.[1])?.focus({preventScroll:true});
 }
 return {draw,clear};
}
