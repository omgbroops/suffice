import {icon} from './ui.js';
import {el} from './sessions-util.js';
import './sessions-approval.css';

// Agent prompt (permission / trust / choice) shown as the composer-approval card in place of the composer content.
export function createApproval(c){
 const {form,hooks,sx,toast}=c;
 return function drawPrompt(){
  const p=c.active?c.ui?.prompt:null,sg=p?JSON.stringify(p):'';
  if(sg===c.cardSig)return;c.cardSig=sg;
  if(c.card){c.card.remove();c.card=null;delete form.dataset.approval;for(const x of form.children)x.inert=false;form.resizePrompt?.();}
  if(!p)return;
  const card=c.card=el('section','composer-approval');card.setAttribute('aria-label','Agent approval');
  card.append(el('h3','',p.title||'Agent needs input'));
  const body=(p.body||'').split('\n').filter(l=>!/^\s*(Claude Code v|claude-\S+ with \w+ effort)/.test(l)).join('\n').trim();
  if(p.type==='choice'&&body&&hooks.markdown){const a=el('div','approval-action');a.innerHTML=icon('terminal');a.append(el('span','',p.plan?'Plan':'Request'));const md=el('div','approval-preview-host session-plan');hooks.markdown(md,p.plan||body);card.append(a,md);}
  else if(body){const a=el('div','approval-action');a.innerHTML=icon('terminal');a.append(el('span','',p.type==='trust'?'Folder':'Request'));
   const host=el('div','approval-preview-host'),pre=el('pre','approval-preview');pre.tabIndex=0;pre.setAttribute('aria-label','Request details');pre.append(el('code','',body));host.append(pre);card.append(a,host);}
  for(const q of Array.isArray(p.questions)?p.questions:[]){ // optional structured fields; absent for the current parsers
   const g=el('div','session-question');g.append(el('div','session-question-text',q.question||q.text||q.title||''));
   for(const o of q.options||[]){const lab=typeof o==='string'?o:o.label,b=el('button','provider-dialog-button',lab);b.type='button';
    b.addEventListener('click',()=>{if(q.multiSelect)b.classList.toggle('provider-dialog-primary');else sx.control(c.active.id,'answerPrompt',{index:o.index??q.options.indexOf(o)}).catch(e=>toast(e.message));});g.append(b);}
   card.append(g);}
  const ctl=el('div','approval-controls');
  for(const o of p.options){const b=el('button',`provider-dialog-button${o.index===p.selected?' provider-dialog-primary':''}`,o.label);b.type='button';
   b.addEventListener('click',()=>{sx.control(c.active.id,'answerPrompt',{index:o.index}).catch(e=>toast(e.message));});ctl.append(b);}
  card.append(ctl);form.append(card);form.dataset.approval='true';
  for(const x of form.children)x.inert=x!==card;
 };
}
