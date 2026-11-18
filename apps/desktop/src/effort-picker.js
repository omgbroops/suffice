import {createMenu} from './menu.js';
const TITLES={off:'Off',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Max'};
const name=v=>TITLES[v]||String(v).charAt(0).toUpperCase()+String(v).slice(1);
// Four rising bars; the lit ones show the level. Collapses to this icon at rest (see screen.css).
const bars=(n,total)=>`<svg class="icon effort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">${[5,9,13,17].map((h,i)=>`<path d="M${5+i*5} 20v-${h-4}" opacity="${i<Math.ceil((n+1)/Math.max(total,1)*4)?1:.4}"/>`).join('')}</svg>`;
export function connectEffortPicker(form){
 const access=form.querySelector('.access-mode-picker');if(!access)return;
 const button=document.createElement('button');button.type='button';button.className='button effort-picker';button.dataset.action='effort-menu';button.setAttribute('aria-label','Reasoning effort');button.setAttribute('aria-haspopup','menu');button.hidden=true;
 access.after(button);
 const popup=document.createElement('div');popup.className='popover effort-menu';popup.hidden=true;document.body.append(popup);const menu=createMenu(popup);
 const state=()=>{const s=form.modelState?.();const m=s?.model;return m?.efforts?.length>1?{model:m,effort:s.effort,list:m.efforts,locked:s.locked}:null;};
 function paint(){const s=state();button.hidden=!s;if(!s)return;const i=Math.max(0,s.list.indexOf(s.effort));button.innerHTML=bars(i,s.list.length-1)+`<span>${name(s.effort)}</span>`;button.title=`Reasoning effort: ${name(s.effort)}`;}
 button.addEventListener('click',()=>{if(!popup.hidden){menu.close();return;}const s=state();if(!s)return;menu.open(button,s.list.map((v,i)=>({label:name(v),selected:v===s.effort,action:'effort:'+i})),'Reasoning effort');});
 popup.addEventListener('click',event=>{const row=event.target.closest('[data-menu-action]');const s=state();if(!row||!s)return;const v=s.list[Number(row.dataset.menuAction.split(':')[1])];if(!v)return;menu.close();if(s.locked)form.modelSource?.choose(s.model.id,v);else form.chooseModel?.({effort:v});paint();});
 for(const type of ['model-change','model-source'])form.addEventListener(type,paint);
 document.addEventListener('suffice-models-refresh',()=>setTimeout(paint,0));
 queueMicrotask(paint);setTimeout(paint,300);
}
