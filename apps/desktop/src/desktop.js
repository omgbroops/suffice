import {fileLinkPath} from './file-links.js';
import {connectComposerOverflow} from './composer-overflow.js';
import {connectQueuedMessages} from './queued-messages.js';
import {connectChatChangesWidget} from './chat-changes-widget.js';
import {connectAccessModePicker} from './access-mode-picker.js';
import { connectThreads } from './threads-ui.js';
import { connectProjects } from './projects-ui.js';
import {connectModels} from './models-ui.js';
import {connectUsageHint} from './usage-hint.js';
import {connectToolsChip} from './mcp-chip.js';
import {connectTooltips} from './tooltips.js';
import {connectWorkspaceTools} from './workspace-tools.js';
import {connectStartLife} from './start-life.js';
// Desktop-only behavior; the existing shell markup, tokens and controls stay.
export function connectDesktop({prompt,send,toast,escapeHtml}) {
  const api=window.sufficeDesktop;
  if(!api)return;
  document.documentElement.classList.add('desktop-app');
  document.addEventListener('click',event=>{const anchor=event.target.closest('a[href]');if(!anchor)return;const raw=anchor.dataset.sufficeFile||anchor.getAttribute('href');if(raw.startsWith('#'))return;const path=fileLinkPath(raw);if(anchor.closest('.thread-assistant')&&path!==null){event.preventDefault();document.dispatchEvent(new CustomEvent('suffice-open-file',{detail:{path}}));return;}if(!/^(https?:|mailto:)/i.test(anchor.href))return;event.preventDefault();void api.openExternal(anchor.href).catch(error=>toast(error.message));});
  // Escape the workspace stacking context so the caption drag region cannot intercept navigation.
  const collapsedTools=document.querySelector('.sidebar-collapsed-tools');
  if(collapsedTools)document.body.append(collapsedTools);
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
  connectAccessModePicker(prompt.form);
  connectQueuedMessages(prompt.form,prompt,toast);
  connectProjects({api,toast});
  connectModels({api,toast});
  connectUsageHint({form:prompt.form,prompt});
  connectToolsChip(prompt.form,api);
  connectComposerOverflow(prompt.form);
  connectWorkspaceTools(api);
  connectChatChangesWidget();
  connectStartLife({api});
  {
    const title=document.querySelector('.thread-header'),tools=document.querySelector('.workspace-tools');
    const chatTools=document.createElement('div');chatTools.className='caption-chat-tools'+(mac?' caption-chat-tools-macos':'');chatTools.append(title,tools);
    function placeChatTools(){const detached=document.body.classList.contains('right-panel-open');chatTools.classList.toggle('caption-chat-tools-detached',detached);if(detached||mac){if(chatTools.parentElement!==document.body)document.body.append(chatTools);}else if(chatTools.parentElement!==chrome)chrome.prepend(chatTools);}
    new MutationObserver(placeChatTools).observe(document.body,{attributes:true,attributeFilter:['class']});placeChatTools();
    if(!mac)new ResizeObserver(entries=>{const size=entries[0].borderBoxSize?.[0]?.inlineSize||chrome.offsetWidth;document.documentElement.style.setProperty('--window-controls-width',`${size}px`);}).observe(chrome);
  }
  if(mode==='macos-preview'){
    const traffic=document.createElement('div');traffic.className='mac-traffic-buttons';traffic.append(...chrome.querySelectorAll('.window-control'));chrome.prepend(traffic);
    const placeTraffic=()=>{const collapsed=document.body.classList.contains('sidebar-collapsed');const target=collapsed?collapsedTools:chrome;if(target&&traffic.parentElement!==target)target.prepend(traffic);};
    new MutationObserver(placeTraffic).observe(document.body,{attributes:true,attributeFilter:['class']});placeTraffic();
  }
  for(const panel of document.querySelectorAll('.sidebar,.right-sidebar')){
    const drag=document.createElement('div');drag.className='panel-drag-region';drag.setAttribute('aria-hidden','true');panel.prepend(drag);
  }
  connectTooltips();
}
