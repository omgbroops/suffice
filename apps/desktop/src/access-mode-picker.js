import {icon} from './ui.js';
import {createMenu} from './menu.js';
import {threadViewState} from './thread-view-state.js';
import {preference,savePreference} from './settings-preferences.js';
const modes=[
 {value:'Ask before every action',label:'Supervised',detail:'Ask before every tool action.',icon:'access-supervised'},
 {value:'Ask when needed',label:'Ask when needed',detail:'Allow reads; ask before edits and other actions.',icon:'access-auto'},
 {value:'Never ask',label:'Full access',detail:'Run tools without approval. Push confirmation still applies if enabled.',icon:'access-full'},
];
// form.accessSource ({modes:[{id,label,detail,icon?}],current,pending,choose(id)}) swaps the list for a CLI session's permission modes; the saved app mode is never touched.
const ICON={default:'access-supervised',acceptEdits:'pencil',plan:'plan',auto:'access-auto',bypassPermissions:'access-full'};
const escText=value=>String(value).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export function connectAccessModePicker(form){
 const button=document.createElement('button');button.type='button';button.className='button access-mode-picker';button.dataset.action='access-mode-menu';button.setAttribute('aria-label','Access mode');
 form.querySelector('[data-action="attach"]').after(button);
 const popup=document.createElement('div');popup.className='popover access-mode-menu';popup.hidden=true;document.body.append(popup);const menu=createMenu(popup);
 const list=()=>form.accessSource?form.accessSource.modes.map(m=>({value:m.id,label:m.label,detail:m.detail,icon:m.icon||ICON[m.id]||'access-supervised'})):modes;
 function paint(){const src=form.accessSource;if(src){const all=list(),m=all.find(x=>x.value===(src.pending||src.current))||all[0];if(!m)return;button.innerHTML=icon(m.icon)+`<span>${escText(m.label)}${src.pending?'<span class="model-pending">…</span>':''}</span>`;button.dataset.mode=m.value;if(src.pending)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');return;}button.removeAttribute('aria-busy');const saved=threadViewState.id?threadViewState.state.approvalMode:null;if(threadViewState.id&&!saved){threadViewState.update({approvalMode:preference('approval-mode','Never ask')});return;}const mode=modes.find(mode=>mode.value===(saved||preference('approval-mode','Never ask')))||modes[2];form.approvalMode=mode.value;button.innerHTML=icon(mode.icon)+`<span>${mode.label}</span>`;button.dataset.mode=mode.value;}
 button.addEventListener('click',()=>{if(!popup.hidden){menu.close();return;}const all=list(),cur=form.accessSource?form.accessSource.current:form.approvalMode;menu.open(button,all.map((mode,index)=>({label:mode.label,detail:mode.detail,selected:mode.value===cur,action:'access:'+index})),'Access mode');for(const [index,row] of [...popup.querySelectorAll('[data-menu-action]')].entries()){const text=document.createElement('small');text.className='access-mode-detail';text.textContent=all[index].detail;row.insertAdjacentHTML('afterbegin',icon(all[index].icon));row.querySelector('.menu-label').append(text);}const r=button.getBoundingClientRect();if(popup.offsetHeight>innerHeight-r.bottom-20&&r.top>innerHeight-r.bottom){popup.style.top=Math.max(12,r.top-popup.offsetHeight-8)+'px';popup.style.setProperty('--popover-origin','bottom left');}});
 popup.addEventListener('click',async event=>{const row=event.target.closest('[data-menu-action]');if(!row)return;const mode=list()[Number(row.dataset.menuAction.split(':')[1])];if(!mode)return;menu.close();if(form.accessSource){form.accessSource.choose(mode.value);return;}if(threadViewState.id)threadViewState.update({approvalMode:mode.value});form.approvalMode=mode.value;await savePreference('approval-mode',mode.value).catch(()=>{});paint();});
 form.recordAccessModeUsed=value=>savePreference('approval-mode',value).catch(()=>{});
 form.addEventListener('access-source',paint);threadViewState.subscribe(paint);document.addEventListener('suffice-preference',event=>{if(event.detail.id==='approval-mode')paint();});paint();
}
