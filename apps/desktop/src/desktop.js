import { connectThreads } from './threads-ui.js';
import { connectProjects } from './projects-ui.js';
import {connectModels} from './models-ui.js';
import {connectTooltips} from './tooltips.js';
import {connectWorkspaceTools} from './workspace-tools.js';
// Desktop-only behavior; the existing shell markup, tokens and controls stay.
export function connectDesktop({prompt,send,toast,escapeHtml}) {
  const api=window.sufficeDesktop;
  if(!api)return;
  document.documentElement.classList.add('desktop-app');
  const mode=api.windowChrome||'windows',mac=mode.startsWith('macos');
  document.documentElement.dataset.windowChrome=mode;
  const chrome=document.createElement('div');chrome.className='window-controls';chrome.setAttribute('role','group');chrome.setAttribute('aria-label','Window controls');
  const controls=[['minimize','Minimize','<path d="M3.5 8.5h9"/>'],['maximize','Maximize or restore','<rect x="3.5" y="3.5" width="9" height="9" rx=".5"/>'],['close','Close window','<path d="m3 3 10 10m-10 0 10-10"/>']];
  const traffic=[['close','Close window','<path d="m5 5 6 6m-6 0 6-6"/>'],['minimize','Minimize','<path d="M4 8h8"/>'],['maximize','Maximize or restore','<path d="M4 10V4h6M6 12h6V6"/>']];
  chrome.innerHTML=(mode==='macos-native'?[]:mac?traffic:controls).map(([action,label,path])=>`<button type="button" class="window-control" data-window="${action}" aria-label="${label}" title="${label}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${path}</svg></button>`).join('');
  if(mode==='macos-native'){chrome.setAttribute('aria-hidden','true');chrome.classList.add('window-controls-native');}
  const edge=document.createElement('span');edge.className='window-control-edge';edge.setAttribute('aria-hidden','true');chrome.append(edge);
  chrome.addEventListener('click',event=>{const control=event.target.closest('[data-window]');if(control)void api.windowControl(control.dataset.window);});document.body.append(chrome);
  const drag=document.createElement('div');drag.className='window-drag-region';drag.setAttribute('aria-hidden','true');document.body.prepend(drag);
  connectThreads({api,prompt,send,toast});
  connectProjects({api,toast});
  connectModels({api,toast});
  connectWorkspaceTools(api);
  for(const panel of document.querySelectorAll('.sidebar,.right-sidebar')){
    const drag=document.createElement('div');drag.className='panel-drag-region';drag.setAttribute('aria-hidden','true');panel.prepend(drag);
  }
  connectTooltips();
}
