import {createMenu} from './menu.js';
import {icon} from './ui.js';

export function connectThreadContextMenu(list,{getThread,metadata,update,onArchive,onDelete,projectManagement,isGrouped,toast,sections=()=>[],nestTargets=()=>[],openFolder}){
 const element=document.createElement('div');element.className='popover thread-context-menu';element.hidden=true;document.body.append(element);const menu=createMenu(element);let selected,row;
 document.addEventListener('suffice-close-thread-menu',()=>menu.close());
 const dialog=document.createElement('dialog');dialog.className='provider-dialog thread-rename-dialog';dialog.setAttribute('aria-label','Rename thread');dialog.innerHTML=`<form><header class="provider-dialog-header"><h2>Rename thread</h2><button type="button" class="button" aria-label="Close rename dialog">${icon('close')}</button></header><div class="provider-dialog-body"><label for="thread-rename-input">Title</label><input id="thread-rename-input" maxlength="90" required autocomplete="off"></div><footer class="provider-dialog-footer"><button type="button" class="provider-dialog-button" data-cancel>Cancel</button><button class="provider-dialog-button provider-dialog-primary" type="submit">Save</button></footer></form>`;document.body.append(dialog);
 let dialogMode='title';const input=dialog.querySelector('input'),dialogTitle=dialog.querySelector('h2'),dialogLabel=dialog.querySelector('label');const askName=(mode,value)=>{dialogMode=mode;dialogTitle.textContent=mode==='section'?'New section':'Rename thread';dialogLabel.textContent=mode==='section'?'Name':'Title';dialog.setAttribute('aria-label',dialogTitle.textContent);input.value=value;dialog.showModal();input.focus();input.select();};for(const button of dialog.querySelectorAll('button[type=button]'))button.addEventListener('click',()=>dialog.close());dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const title=input.value.trim();if(!title)return;update(selected.id,dialogMode==='section'?{section:title}:{title});dialog.close();});dialog.addEventListener('close',()=>row?.focus());
 const removal=document.createElement('dialog');removal.className='provider-dialog thread-delete-dialog';removal.setAttribute('aria-label','Delete thread');removal.innerHTML=`<header><h2>Delete thread?</h2><button type="button" class="button" aria-label="Close delete dialog">${icon('close')}</button></header><div class="provider-dialog-body"><p class="thread-delete-title"></p><p>The saved conversation will be moved to the Recycle Bin.</p></div><footer class="provider-dialog-footer"><button type="button" class="provider-dialog-button" data-cancel>Cancel</button><button type="button" class="provider-dialog-button provider-dialog-danger" data-delete>Delete thread</button></footer>`;document.body.append(removal);let deletion;
 for(const button of removal.querySelectorAll('header button,[data-cancel]'))button.addEventListener('click',()=>removal.close());
 function confirmDelete(thread){if(!thread||thread.running)return;deletion=thread.id;removal.querySelector('.thread-delete-title').textContent=thread.title;removal.showModal();removal.querySelector('[data-cancel]').focus();}
 removal.querySelector('[data-delete]').addEventListener('click',async event=>{event.target.disabled=true;try{await onDelete(deletion);removal.close();}catch(error){toast(error.message);}finally{event.target.disabled=false;}});
 document.addEventListener('suffice-delete-thread',event=>confirmDelete(getThread(event.detail.id)));
 for(const modal of [dialog,removal])modal.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
  function items(state){
  const section=metadata(selected.id).section,names=sections(),targets=nestTargets(selected.id),under=state.under;
  return [
   ...(selected.cwd?[{label:'Open in',icon:'folder',children:[{label:'Finder',icon:'folder',action:'thread:open-folder'},{label:'Copy path',icon:'files',action:'thread:copy-directory'}]}]:[]),
   {label:state.pinned?'Unpin':'Pin',icon:'pin',action:'thread:pin',key:'P',separator:!!selected.cwd},
   {label:state.unread?'Mark as read':'Mark as unread',icon:'inbox',action:'thread:read',key:'U'},
   {label:'Rename',icon:'pencil',action:'thread:rename',key:'R'},
   ...(!selected.running?[{label:'Fork',icon:'branch',action:'thread:fork',key:'F'},{label:'Hand off',icon:'move-project',action:'thread:handoff'}]:[]),
   {label:'Move to section',icon:'folder',separator:true,children:()=>[...names.map(name=>({label:name,selected:name===section,action:'thread:section='+encodeURIComponent(name)})),{label:'New section',icon:'plus',action:'thread:section-new',separator:!!names.length},...(section?[{label:'Remove from section',action:'thread:section-none'}]:[])]},
   {label:'Move under',icon:'branch',children:()=>targets.length||under?[...targets.map(t=>({label:t.title,selected:t.id===under,action:'thread:under='+encodeURIComponent(t.id)})),...(under?[{label:'No parent',action:'thread:under-none',separator:!!targets.length}]:[])]:[{label:'No other threads',action:'thread:noop',disabled:true}]},
   ...(!selected.running&&projectManagement?[{label:'Move to project',icon:'move-project',children:()=>projectManagement.moveItems(selected)}]:[]),
   ...(selected.cwd&&!isGrouped()&&projectManagement?[{label:'Manage project',icon:'folder',children:()=>projectManagement.projectItems(selected)}]:[]),
   {label:'Export',icon:'files',children:[{label:'Markdown file',icon:'files',action:'thread:export-md'},{label:'HTML file',icon:'files',action:'thread:export-html'},{label:'Copy as Markdown',icon:'files',action:'thread:export-copy'}]},
   ...(!selected.running?[{label:state.archived?'Unarchive':'Archive',icon:'archive',action:'thread:archive',key:'A',separator:true},{label:'Delete',icon:'trash',action:'thread:delete',key:'D',danger:true}]:[])
  ];
 }
 function open(target,x,y){selected=getThread(target.dataset.thread);if(!selected)return;row=target;const state=metadata(selected.id);menu.open(target,items(state),'Thread');{const sb=target.closest('.sidebar')?.getBoundingClientRect(),at=y??target.getBoundingClientRect().top;element.style.left=`${Math.max(8,Math.min(sb?sb.right+6:x??8,innerWidth-element.offsetWidth-8))}px`;element.style.top=`${Math.max(8,Math.min(at,innerHeight-element.offsetHeight-8))}px`;}element.querySelector('button')?.focus();}
 list.addEventListener('contextmenu',event=>{const target=event.target.closest('.thread-row');if(!target)return;event.preventDefault();open(target,event.clientX,event.clientY);});list.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){const target=event.target.closest('.thread-row');if(target){event.preventDefault();open(target);}}});
 async function run(full){
  if(!selected)return;const [action,arg]=full.split(/=(.*)/s);const state=metadata(selected.id);
  try{
   if(action==='fork')document.dispatchEvent(new CustomEvent('suffice-fork-thread',{detail:{id:selected.id}}));
   else if(action==='handoff')document.dispatchEvent(new CustomEvent('suffice-handoff-thread',{detail:{id:selected.id}}));
   else if(action==='delete')confirmDelete(selected);
   else if(action.startsWith('export-'))document.dispatchEvent(new CustomEvent('suffice-export-thread',{detail:{id:selected.id,kind:action.slice(7)}}));
   else if(action==='rename')askName('title',selected.title);
   else if(action==='pin')update(selected.id,{pinned:!state.pinned});
   else if(action==='read')update(selected.id,{unread:!state.unread});
   else if(action==='archive'){update(selected.id,{archived:!state.archived});if(!state.archived)onArchive(selected.id);}
   else if(action==='section')update(selected.id,{section:decodeURIComponent(arg)});
   else if(action==='section-new')askName('section','');
   else if(action==='section-none')update(selected.id,{section:''});
   else if(action==='under')update(selected.id,{under:decodeURIComponent(arg)});
   else if(action==='under-none')update(selected.id,{under:''});
   else if(action==='open-folder')await openFolder?.(selected.cwd);
   else if(action.startsWith('copy-'))await navigator.clipboard.writeText(action==='copy-title'?selected.title:selected.cwd);
  }catch(error){toast(error.message);}
 }
 const ACTIONS=new Set(['rename','pin','read','archive','delete','fork','handoff','export-md','export-html','export-copy','copy-title','copy-directory','section','section-new','section-none','under','under-none','open-folder']);
 document.addEventListener('click',event=>{const button=event.target.closest('[data-menu-action]');if(!button?.closest('.thread-context-menu,.popover--submenu')||!selected)return;const full=button.dataset.menuAction;if(!full.startsWith('thread:')||!ACTIONS.has(full.slice(7).split('=')[0]))return;menu.close();void run(full.slice(7));});
 // Single-key shortcuts while the menu is open.
 const KEYS={p:'pin',u:'read',r:'rename',f:'fork',a:'archive',d:'delete'};
 document.addEventListener('keydown',event=>{if(element.hidden||!selected||event.metaKey||event.ctrlKey||event.altKey)return;const action=KEYS[event.key.toLowerCase()];if(!action||(selected.running&&['fork','archive','delete'].includes(action)))return;event.preventDefault();event.stopImmediatePropagation();menu.close();void run(action);},true);
}

// Right-click menu for CLI session rows: same popover, menu and dialog classes as the thread menu.
export function connectSessionContextMenu(list,{getSession,toast,openFolder}){
 let element,menu,confirm,current,row,ready;
 function init(){if(ready)return;ready=true;element=document.createElement('div');element.className='popover thread-context-menu';element.hidden=true;document.body.append(element);menu=createMenu(element);
 document.addEventListener('suffice-close-thread-menu',()=>menu.close());
 confirm=document.createElement('dialog');confirm.className='provider-dialog thread-delete-dialog';confirm.setAttribute('aria-label','Stop session');
 confirm.innerHTML=`<header><h2>Stop session?</h2><button type="button" class="button" aria-label="Close stop dialog">${icon('close')}</button></header><div class="provider-dialog-body"><p class="thread-delete-title"></p><p>The agent process ends and the terminal closes.</p></div><footer class="provider-dialog-footer"><button type="button" class="provider-dialog-button" data-cancel>Cancel</button><button type="button" class="provider-dialog-button provider-dialog-danger" data-stop>Stop session</button></footer>`;document.body.append(confirm);
 for(const button of confirm.querySelectorAll('header button,[data-cancel]'))button.addEventListener('click',()=>confirm.close());
 confirm.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});confirm.addEventListener('close',()=>row?.focus());
 confirm.querySelector('[data-stop]').addEventListener('click',async event=>{event.target.disabled=true;try{await current.stop();confirm.close();}catch(error){toast(error.message);}finally{event.target.disabled=false;}});
 document.addEventListener('click',async event=>{const button=event.target.closest('[data-menu-action^="session:"]');if(!button?.closest('.thread-context-menu,.popover--submenu'))return;if(!button||!current)return;const action=button.dataset.menuAction.slice(8);menu.close();
  try{if(action==='attach'){await navigator.clipboard.writeText(await current.attach());toast('Attach command copied');}else if(action==='attach-terminal'){const r=await current.attachTerminal();toast(r.opened?'Opened in Terminal':'Attach: '+r.command);}else if(action==='open-folder')await openFolder?.(current.cwd);else if(action==='copy-path'){await navigator.clipboard.writeText(current.cwd);toast('Path copied');}else if(action==='title'){await navigator.clipboard.writeText(current.title);toast('Title copied');}
   if(action==='terminal')current.show();
   if(action==='stop'){confirm.querySelector('.thread-delete-title').textContent=current.title;confirm.showModal();confirm.querySelector('[data-cancel]').focus();}}catch(error){toast(error.message);}});
 }
 function open(target,x,y){init();current=getSession(target);if(!current)return;row=target;menu.open(target,[...(current.cwd?[{label:'Open in',icon:'folder',children:[{label:'Finder',icon:'folder',action:'session:open-folder'},{label:'Copy path',icon:'files',action:'session:copy-path'}]}]:[]),{label:'Show terminal',icon:'terminal',action:'session:terminal',key:'O',separator:!!current.cwd},{label:'Copy attach command',icon:'files',action:'session:attach',key:'C',separator:true},{label:'Attach in Terminal',icon:'terminal',action:'session:attach-terminal'},{label:'Copy title',icon:'files',action:'session:title',key:'T'},{label:'Stop session',icon:'close',action:'session:stop',key:'S',danger:true,separator:true}],'Session');{const sb=target.closest('.sidebar')?.getBoundingClientRect(),at=y??target.getBoundingClientRect().top;element.style.left=`${Math.max(8,Math.min(sb?sb.right+6:x??8,innerWidth-element.offsetWidth-8))}px`;element.style.top=`${Math.max(8,Math.min(at,innerHeight-element.offsetHeight-8))}px`;}element.querySelector('button')?.focus();}
 const KEYS={o:'terminal',c:'attach',t:'title',s:'stop'};
 document.addEventListener('keydown',event=>{if(!ready||element.hidden||event.metaKey||event.ctrlKey||event.altKey)return;const name=KEYS[event.key.toLowerCase()];const button=name&&element.querySelector(`[data-menu-action="session:${name}"]`);if(!button)return;event.preventDefault();event.stopImmediatePropagation();button.click();},true);
 list.addEventListener('contextmenu',event=>{const target=event.target.closest('.thread-row');if(!target)return;event.preventDefault();open(target,event.clientX,event.clientY);});
 list.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){const target=event.target.closest('.thread-row');if(target){event.preventDefault();open(target);}}});

}
