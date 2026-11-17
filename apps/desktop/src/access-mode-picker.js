import {icon} from './ui.js';
import {createMenu} from './menu.js';
import {threadViewState} from './thread-view-state.js';
import {preference,savePreference} from './settings-preferences.js';
const modes=[
 {value:'Ask before every action',label:'Supervised',detail:'Ask before every tool action.',icon:'access-supervised'},
 {value:'Ask when needed',label:'Ask when needed',detail:'Allow reads; ask before edits and other actions.',icon:'access-auto'},
 {value:'Never ask',label:'Full access',detail:'Run tools without approval. Push confirmation still applies if enabled.',icon:'access-full'},
];
export function connectAccessModePicker(form){
 const button=document.createElement('button');button.type='button';button.className='button access-mode-picker';button.dataset.action='access-mode-menu';button.setAttribute('aria-label','Access mode');
 form.querySelector('[data-action="attach"]').after(button);
 const popup=document.createElement('div');popup.className='popover access-mode-menu';popup.hidden=true;document.body.append(popup);const menu=createMenu(popup);
 function paint(){const saved=threadViewState.id?threadViewState.state.approvalMode:null;if(threadViewState.id&&!saved){threadViewState.update({approvalMode:preference('approval-mode','Never ask')});return;}const mode=modes.find(mode=>mode.value===(saved||preference('approval-mode','Never ask')))||modes[2];form.approvalMode=mode.value;button.innerHTML=icon(mode.icon)+`<span>${mode.label}</span>`;button.dataset.mode=mode.value;}
 button.addEventListener('click',()=>{if(!popup.hidden){menu.close();return;}menu.open(button,modes.map((mode,index)=>({label:mode.label,detail:mode.detail,selected:mode.value===form.approvalMode,action:'access:'+index})),'Access mode');for(const [index,row] of [...popup.querySelectorAll('[data-menu-action]')].entries()){const text=document.createElement('small');text.className='access-mode-detail';text.textContent=modes[index].detail;row.insertAdjacentHTML('afterbegin',icon(modes[index].icon));row.querySelector('.menu-label').append(text);}const r=button.getBoundingClientRect();if(popup.offsetHeight>innerHeight-r.bottom-20&&r.top>innerHeight-r.bottom){popup.style.top=Math.max(12,r.top-popup.offsetHeight-8)+'px';popup.style.setProperty('--popover-origin','bottom left');}});
 popup.addEventListener('click',async event=>{const row=event.target.closest('[data-menu-action]');if(!row)return;const mode=modes[Number(row.dataset.menuAction.split(':')[1])];if(!mode)return;menu.close();if(threadViewState.id)threadViewState.update({approvalMode:mode.value});form.approvalMode=mode.value;await savePreference('approval-mode',mode.value).catch(()=>{});paint();});
 form.recordAccessModeUsed=value=>savePreference('approval-mode',value).catch(()=>{});
 threadViewState.subscribe(paint);document.addEventListener('suffice-preference',event=>{if(event.detail.id==='approval-mode')paint();});paint();
}
