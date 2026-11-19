import {tagRows} from '../shared/diff-hunks.mjs';
import {icon} from './ui.js';
import {applyFix} from './review.js';
// Batched inline review in the Changes panel: Accept / Reject per hunk, comment cards on lines, and one
// sticky footer that sends every open comment to the agent in a single turn. All state lives in the main
// process (review-store); this file only paints it and calls the review* api methods.
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const button=(label,className,text,glyph)=>{const node=el('button',className);node.type='button';node.setAttribute('aria-label',label);node.title=label;if(glyph)node.innerHTML=icon(glyph);if(text)node.append(el('span','',text));return node;};
const CHIP={sent:'Sent',fixed:'Fixed',skipped:'Skipped',noop:'No change needed'};
const plain=error=>error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,'');
// Comments the agent is working on right now, before the store round trip shows them as sent.
const sending=new Map();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:ms));

function card(comment,{api,threadId,change,live}){
 const state=live&&comment.state==='open'?'sent':comment.state,node=el('div','review-note review-card');
 node.dataset.state=state;node.dataset.hunk=comment.hunkId;node.dataset.comment=comment.id;node.setAttribute('role','note');if(comment.severity)node.dataset.severity=comment.severity;
 if(comment.severity)node.append(el('span','review-severity',comment.severity));
 const body=el('div','review-body');body.append(el('p','review-message',comment.text));if(comment.fix)body.append(el('p','review-fix',comment.fix));
 if(comment.error&&state==='sent'){const row=el('p','review-error',comment.error);row.setAttribute('role','alert');body.append(row);}
 node.append(body);
 if(state==='open'){
  if(comment.origin==='reviewer'){const apply=button(`Apply fix: ${comment.text.slice(0,60)}`,'button button--subtle review-apply','Apply fix');apply.addEventListener('click',()=>{if(applyFix({path:comment.file,line:comment.line,severity:comment.severity,message:comment.text,fix:comment.fix})){apply.textContent='Sent';apply.disabled=true;}});node.append(apply);}
  const remove=button('Delete comment','button button--ghost review-remove',null,'close');remove.addEventListener('click',async()=>{await api.reviewRemove({threadId,id:comment.id}).catch(()=>{});change();});node.append(remove);
 }else{
  const chip=el('span','review-outcome',CHIP[state]);chip.dataset.state=state;node.append(chip);
  if(state==='sent'&&!live){const reopen=button('Reopen comment','button button--subtle review-reopen','Reopen');reopen.addEventListener('click',async()=>{await api.reviewReopen({threadId,id:comment.id}).catch(()=>{});change();});node.append(reopen);}
 }
 return node;
}

function compose(row,line,{api,threadId,file,change}){
 const anchor=row.parentElement.classList.contains('split-diff-row')?row.parentElement:row;
 if(anchor.nextElementSibling?.classList.contains('review-compose')){anchor.nextElementSibling.querySelector('textarea').focus();return;}
 const form=el('form','review-note review-compose'),input=el('textarea');input.rows=2;input.setAttribute('aria-label',`Comment on line ${line.new}`);input.placeholder='Comment for the agent';
 const add=button('Add comment','button button--subtle review-apply','Add comment'),cancel=button('Cancel comment','button button--ghost review-cancel','Cancel');add.type='submit';
 const actions=el('div','review-compose-actions');actions.append(add,cancel);form.append(input,actions);anchor.after(form);input.focus();
 cancel.addEventListener('click',()=>form.remove());
 input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();form.remove();}if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();form.requestSubmit();}});
 form.addEventListener('submit',async event=>{event.preventDefault();if(!input.value.trim())return;add.disabled=true;try{await api.reviewAdd({threadId,file,hunkId:line.hunkId,rel:line.rel,line:line.new,text:input.value});change();}catch(error){add.disabled=false;let note=form.querySelector('.review-error');if(!note){note=el('p','review-error');note.setAttribute('role','alert');form.prepend(note);}note.textContent=plain(error);}});
}

function footer(preview,state,{api,threadId,refresh,change}){
 preview.querySelector('.review-footer')?.remove();
 const open=state.comments.filter(c=>c.state==='open'),live=sending.has(threadId);
 if(!open.length&&!live)return;
 const bar=el('div','review-footer');bar.setAttribute('role','region');bar.setAttribute('aria-label','Review comments');
 if(live){const status=el('span','review-footer-status','Agent is working on '+sending.get(threadId)+' comment'+(sending.get(threadId)===1?'':'s')+'…');status.setAttribute('role','status');bar.append(status);bar.dataset.busy='true';}
 else{
  const send=button(`Send ${open.length} comment${open.length===1?'':'s'} to agent`,'button review-send',`Send ${open.length} comment${open.length===1?'':'s'} to agent`);
  send.addEventListener('click',async()=>{
   const selection=document.querySelector('.composer')?.modelSelection;
   if(!selection?.model||!selection.provider||selection.provider==='cli'){let note=bar.querySelector('.review-error');if(!note){note=el('span','review-error');note.setAttribute('role','alert');bar.prepend(note);}note.textContent='Pick a model in the composer first';return;}
   sending.set(threadId,open.length);change();
   try{await api.reviewSend({threadId,model:selection.model,provider:selection.provider,effort:selection.effort||'low'});}catch{/* the store holds the error on each card */}
   sending.delete(threadId);refresh();
  });
  bar.append(send);
 }
 preview.append(bar);
}

// Returns the hooks renderCode calls while painting a diff, or null outside Changes.
export async function loadReview({api,threadId,file,preview,change,refresh}){
 let state;try{state=await api.reviewState(threadId);}catch{state={comments:[],accepted:[]};}
 const ctx={api,threadId,file,change,refresh,live:sending.has(threadId)};
 footer(preview,state,ctx);
 const here=state.comments.filter(c=>c.file===file),accepted=new Set(state.accepted);
 return {
  state,
  // Findings the store has no card for stay plain notes.
  unplaced:findings=>findings.filter(f=>!here.some(c=>c.origin==='reviewer'&&c.text===f.message)),
  tag:tagRows,
  mark(node,hunkId){if(hunkId)node.dataset.hunk=hunkId;},
  gutter(line,row){
   if(line.new==null||!line.hunkId)return null;
   const add=button(`Comment on line ${line.new}`,'review-gutter',null,'message');add.addEventListener('click',()=>compose(row,line,ctx));return add;
  },
  hunkTools(line,header){
   const tools=el('div','review-hunk-tools'),done=accepted.has(line.hunkId);
   if(done){header.classList.add('is-accepted');tools.append(el('span','review-outcome','Accepted'));}
   else{const accept=button('Accept change','button button--subtle review-accept','Accept','tick');accept.addEventListener('click',async()=>{await api.reviewAccept({threadId,hunkId:line.hunkId,on:true}).catch(()=>{});change();});tools.append(accept);}
   const reject=button('Reject change','button button--subtle review-reject','Reject','undo');
   reject.addEventListener('click',async()=>{
    const rows=[...header.closest('.panel-code').querySelectorAll(`[data-hunk="${CSS.escape(line.hunkId)}"]`)];
    for(const row of rows)row.classList.add('is-rejecting');reject.disabled=true;
    try{await Promise.all([api.reviewReject({threadId,file,hunkId:line.hunkId}),wait(170)]);refresh();}
    catch(error){for(const row of rows)row.classList.remove('is-rejecting');reject.disabled=false;let note=tools.querySelector('.review-error');if(!note){note=el('span','review-error');note.setAttribute('role','alert');tools.prepend(note);}note.textContent=plain(error);}
   });
   tools.append(reject);return tools;
  },
  cardsAfter:line=>here.filter(c=>c.hunkId===line.hunkId&&c.rel===line.rel).map(c=>card(c,ctx)),
 };
}
