import {threadViewState} from './thread-view-state.js';
import {preference} from './settings-preferences.js';
export function connectExtensionUI(api,toast){
 const dialogs=new Map(),statuses=new Map();
 const widget=document.createElement('div');widget.className='extension-status';widget.hidden=true;document.querySelector('.composer').append(widget);
 const key=event=>event.threadId||event.clientId||'new';
 const draw=()=>{widget.textContent=[...(statuses.get(threadViewState.id)||new Map()).values()].filter(Boolean).join('\n');widget.hidden=!widget.textContent;};
 threadViewState.subscribe(draw);
 api.onEvent(event=>{if(event.event!=='extension_ui')return;
  const id=key(event)+':'+event.requestId;
  if(event.kind==='dismiss'){dialogs.get(id)?.remove();dialogs.delete(id);return;}
  if(event.kind==='notice'){toast(event.message);return;}
  if(event.kind==='status'){const group=statuses.get(key(event))||new Map();event.text?group.set(event.key,event.text):group.delete(event.key);statuses.set(key(event),group);draw();return;}
  if(['paste','editor-text'].includes(event.kind)){if(key(event)!==threadViewState.id)return;const input=document.querySelector('.composer textarea');input.value=(event.kind==='paste'?input.value:'')+event.text;input.dispatchEvent(new Event('input',{bubbles:true}));return;}
  if(event.kind==='expand-tools'){document.querySelectorAll('.thread-activity').forEach(el=>el.open=event.expanded);return;}
  if(!['input','editor','select','confirm'].includes(event.kind))return;
  const dialog=document.createElement('dialog');dialog.className='provider-dialog extension-dialog';dialog.setAttribute('aria-label',event.title);dialogs.set(id,dialog);
  const header=document.createElement('header'),title=document.createElement('h2');title.textContent=event.title;header.append(title);
  const body=document.createElement('div');body.className='provider-dialog-body';const form=document.createElement('form');body.append(form);
  let input;
  if(event.kind==='confirm'){const p=document.createElement('p');p.textContent=event.message;form.append(p);}
  else if(event.kind==='select'){input=document.createElement('select');input.setAttribute('aria-label',event.title);for(const value of event.options){const option=document.createElement('option');option.textContent=value;option.value=value;input.append(option);}form.append(input);}
  else{input=document.createElement(event.kind==='editor'?'textarea':'input');input.setAttribute('aria-label',event.title);input.placeholder=event.placeholder||'';input.value=event.prefill||'';form.append(input);}
  const footer=document.createElement('footer');footer.className='provider-dialog-footer';
  const answer=async value=>{dialog.close();dialog.remove();dialogs.delete(id);try{await api.extensionAnswer({threadId:event.threadId||event.clientId,requestId:event.requestId,value});}catch(error){toast(error.message);}};
  const cancel=document.createElement('button');cancel.type='button';cancel.className='provider-dialog-button';cancel.textContent='Cancel';cancel.onclick=()=>answer(undefined);
  const submit=document.createElement('button');submit.type='submit';submit.className='provider-dialog-button provider-dialog-primary';submit.textContent=event.kind==='confirm'?'Allow':'Continue';
  const formId='extension-form-'+crypto.randomUUID();form.id=formId;submit.setAttribute('form',formId);form.onsubmit=e=>{e.preventDefault();void answer(event.kind==='confirm'?true:input.value);};
  dialog.addEventListener('cancel',e=>{e.preventDefault();e.stopPropagation();void answer(undefined);});footer.append(cancel,submit);dialog.append(header,body,footer);document.body.append(dialog);dialog.showModal();
  if(!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion:reduce)').matches)dialog.animate([{opacity:0,transform:'translateY(6px) scale(.98)'},{opacity:1,transform:'none'}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});
  (input||cancel).focus();
 });
}
