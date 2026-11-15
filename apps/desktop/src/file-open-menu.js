import explorerIcon from './assets/file-explorer.png';
import {createMenu} from './menu.js';
import {threadViewState} from './thread-view-state.js';
import {preference,savePreference} from './settings-preferences.js';
import {icon} from './ui.js';
const notify=error=>document.dispatchEvent(new CustomEvent('suffice-toast',{detail:error.message}));
export function createFileOpenButton(path){
 const api=window.sufficeDesktop,threadId=threadViewState.id;
 const group=document.createElement('div');group.className='file-open-split';
 const open=document.createElement('button');open.type='button';open.className='button button--ghost editor-control editor-open-button';
 let apps=[],chosen;const draw=()=>{chosen=apps.find(app=>app.id===preference('file-open-app','folder'))||apps.find(app=>app.id==='folder');open.replaceChildren();if(chosen?.icon){const image=document.createElement('img');image.src=chosen.icon;image.alt='';image.className='file-open-icon';open.append(image);}const text=document.createElement('span');text.textContent='Open';open.append(text);const arrow=document.createElement('span');arrow.className='file-open-arrow';arrow.innerHTML=icon('chevron');open.append(arrow);open.title='Open in…';open.setAttribute('aria-label','Open in…');};draw();
 const ready=api.fileOpenOptions({threadId,path}).then(value=>{apps=value.map(app=>app.id==='folder'&&(api.platform==='win32'||(!api.platform&&api.windowChrome==='windows'))?{...app,icon:explorerIcon}:app);draw();}).catch(notify);
 open.onclick=()=>void ready.then(()=>{
  if(open.getAttribute('aria-expanded')==='true'){document.querySelector('.file-open-menu')?.fileMenu?.close();return;}
  let popup=document.querySelector('.file-open-menu');if(!popup){popup=document.createElement('div');popup.id='file-open-menu';popup.className='popover file-open-menu';popup.hidden=true;document.body.append(popup);}
  popup.fileMenu?.destroy();const menu=createMenu(popup);popup.fileMenu=menu;
  menu.open(open,apps.map(app=>({label:app.label,action:'open:'+app.id,leading:()=>{const image=document.createElement('img');image.src=app.icon||'';image.alt='';image.className='file-open-icon';return image;}})),'Open in…');
  popup.onclick=event=>{const action=event.target.closest('[data-menu-action]')?.dataset.menuAction;if(!action?.startsWith('open:'))return;menu.close();const application=action.slice(5);void savePreference('file-open-app',application).then(()=>{draw();return api.openFileIn({threadId,path,application});}).catch(notify);};
 }).catch(notify);
 group.append(open);return group;
}
