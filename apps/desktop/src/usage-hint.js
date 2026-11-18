import {suggest} from './usage-optimizer.js';
import {preference} from './settings-preferences.js';
import {icon} from './ui.js';

const level={xhigh:'Extra high'};
const name=value=>level[value]||String(value).charAt(0).toUpperCase()+String(value).slice(1);

// Composer hint: suggests cheaper settings for simple asks. Dismissable; switches on its own only with the optimizer-auto setting.
export function connectUsageHint({form,prompt}){
 const hint=document.createElement('div');hint.className='usage-hint';hint.hidden=true;hint.setAttribute('role','status');
 hint.innerHTML='<span class="usage-hint-text"></span><button type="button" class="usage-hint-apply"></button><button type="button" class="usage-hint-dismiss" aria-label="Dismiss suggestion"></button>';
 hint.querySelector('.usage-hint-dismiss').innerHTML=icon('close');
 prompt.after(hint);
 const [text,apply,dismiss]=[...hint.children];
 let dismissed=false,current=null,undo=null,applying=false;
 const choose=choice=>{applying=true;try{return form.chooseModel(choice);}finally{applying=false;}};
 const motion=()=>!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const show=(message,label,action)=>{const wasHidden=hint.hidden;text.textContent=message;apply.textContent=label;current=action;hint.hidden=false;if(wasHidden&&motion())hint.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:140,easing:'cubic-bezier(.23,1,.32,1)'});};
 const hide=()=>{hint.hidden=true;current=null;};
 const reset=()=>{dismissed=false;undo=null;hide();};
 function evaluate(){
  if(undo||dismissed||!preference('optimizer-hint',true)||!prompt.value.trim()){if(!undo&&!prompt.value.trim())reset();else if(!undo)hide();return;}
  const state=form.modelState?.();if(!state||state.locked){hide();return;}
  const found=suggest({text:prompt.value,model:state.model,effort:state.effort,models:state.models});
  if(!found){hide();return;}
  if(preference('optimizer-auto',false)){
   const before={provider:state.model.provider,id:state.model.id,effort:state.effort};
   if(choose(found.kind==='model'?{provider:found.provider,id:found.model}:{effort:found.effort})){undo=before;show(found.kind==='model'?`Switched to ${found.action.slice(4)}.`:`Switched to ${name(found.effort)} effort.`,'Undo',()=>{choose(before);undo=null;dismissed=true;hide();});return;}
  }
  show(found.message,found.action,()=>{choose(found.kind==='model'?{provider:found.provider,id:found.model}:{effort:found.effort});dismissed=true;hide();});
 }
 apply.addEventListener('click',()=>current?.());
 dismiss.addEventListener('click',()=>{dismissed=true;undo=null;hide();prompt.focus();});
 prompt.addEventListener('input',evaluate);form.addEventListener('model-change',()=>{if(!undo&&!applying)evaluate();});
 form.addEventListener('submit',reset,true);
 document.addEventListener('suffice-preference',event=>{if(String(event.detail.id).startsWith('optimizer-'))evaluate();});
}
