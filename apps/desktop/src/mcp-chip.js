import {icon} from './ui.js';
import {createMenu} from './menu.js';
import {threadViewState} from './thread-view-state.js';
import {currentScope,tokenText} from './mcp-manager.js';
// Composer chip: the tools active for this thread, with a switch per toolkit and server.
export function connectToolsChip(form,api){
 const button=document.createElement('button');button.type='button';button.className='button tools-chip';button.dataset.action='tools-menu';button.setAttribute('aria-label','Tools');button.setAttribute('aria-haspopup','menu');
 (form.querySelector('.access-mode-picker')||form.querySelector('[data-action="attach"]')).after(button);
 const popup=document.createElement('div');popup.className='popover access-mode-menu tools-menu';popup.hidden=true;document.body.append(popup);const menu=createMenu(popup);
 let state=null,level='global',seq=0;
 const levelNow=()=>{const s=currentScope();return s.thread?'thread':s.project?'project':'global';};
 async function refresh(){const mine=++seq,s=currentScope();level=levelNow();try{const next=await api.resourceAction({action:'mcp-state',level,project:s.project,thread:s.thread});if(mine!==seq)return;state=next;}catch{return;}
  button.innerHTML=icon('plug')+`<span>Tools ${state.activeCount}/${state.toolkits.length+state.servers.length}</span>`;button.title=`${state.activeCount} of ${state.toolkits.length+state.servers.length} active · ~${tokenText(state.tokens)} tokens of tool schemas`;button.dataset.count=String(state.activeCount);}
 const items=()=>[...state.toolkits,...state.servers];
 function open(){if(!state)return;const all=items();menu.open(button,all.map((item,i)=>({label:item.name,detail:item.detail,selected:item.enabled,action:'tool:'+i,separator:i===state.toolkits.length})).concat({label:'Manage tools…',action:'manage',separator:true}),'Tools for this '+(level==='thread'?'thread':level==='project'?'project':'app'));
  for(const [i,row] of [...popup.querySelectorAll('[data-menu-action^="tool:"]')].entries()){const it=all[i],text=document.createElement('small');text.className='access-mode-detail';text.textContent=it.kind==='server'?(it.health?.ok?`${it.health.tools.length} tools · ~${tokenText(it.health.tokens)} tokens`:it.health?'Check failed':'Not checked'):`${it.tools.length} tools${it.tokens?` · ~${tokenText(it.tokens)} tokens`:' · loaded on demand'}`;row.querySelector('.menu-label').append(text);if(it.enabled)row.insertAdjacentHTML('beforeend',icon('check','tool-on'));}
  const r=button.getBoundingClientRect();if(popup.offsetHeight>innerHeight-r.bottom-20&&r.top>innerHeight-r.bottom){popup.style.top=Math.max(12,r.top-popup.offsetHeight-8)+'px';popup.style.setProperty('--popover-origin','bottom left');}}
 button.addEventListener('click',()=>{if(!popup.hidden){menu.close();return;}open();});
 popup.addEventListener('click',async event=>{const row=event.target.closest('[data-menu-action]');if(!row)return;const action=row.dataset.menuAction;menu.close();
  if(action==='manage'){document.dispatchEvent(new CustomEvent('suffice-open-settings',{detail:{section:'mcps'}}));return;}
  const item=items()[Number(action.split(':')[1])];if(!item)return;const s=currentScope(),key=item.kind==='toolkit'?'toolkit:'+item.id:item.id;
  try{await api.resourceAction(level==='global'&&item.kind==='server'?{action:'mcp-toggle',name:item.id,enabled:!item.enabled}:{action:'mcp-scope',level,key,enabled:!item.enabled,id:level==='project'?s.project:s.thread});}catch{}
  await refresh();});
 threadViewState.subscribe(event=>{if(event.type==='select'||event.type==='adopt')void refresh();});
 document.addEventListener('suffice-mcp-changed',()=>void refresh());
 const picker=document.querySelector('.project-picker');if(picker)new MutationObserver(()=>void refresh()).observe(picker,{attributes:true,attributeFilter:['data-path']});
 void refresh();
}
