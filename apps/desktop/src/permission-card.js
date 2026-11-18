// Shared pieces of the permission request card used by standard chat (approvals.js) and CLI sessions (sessions-approval.js).
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const VERB={Command:'run',Folder:'trust',Plan:'propose a plan',Request:'ask'};

/** "<agent> wants to run…" title line. */
export const leadLine=(agent,label='Command')=>el('p','approval-lead',`${agent||'The agent'} wants to ${/^Edit/.test(label)?'edit':VERB[label]||'run'}…`);

/** Key hint drawn by CSS (data-key), so button text and accessible name stay the plain label. */
export function hint(button,key,shortcut){button.dataset.key=key;button.setAttribute('aria-label',button.textContent);if(shortcut)button.setAttribute('aria-keyshortcuts',shortcut);return button;}

/** Later button: hides the card and returns the composer, leaving a chip that brings the card back. Returns {button,drop}. */
export function createLater(form,card){
 let chip=null;
 const drop=()=>{chip?.remove();chip=null;};
 const button=hint(el('button','approval-later','Later'),'Esc','Escape');button.type='button';
 const later=()=>{
  if(card.hidden||!card.isConnected)return;
  card.hidden=true;delete form.dataset.approval;for(const c of form.children)c.inert=false;form.resizePrompt?.();
  chip=el('button','approval-chip','Permission needed');chip.type='button';chip.append(el('span','','Review'));
  chip.onclick=()=>{drop();card.hidden=false;form.dataset.approval='true';for(const c of form.children)c.inert=c!==card;card.querySelector('.provider-dialog-primary')?.focus({preventScroll:true});form.resizePrompt?.();};
  form.prepend(chip);chip.focus({preventScroll:true});
 };
 button.onclick=later;
 return {button,drop,later};
}
