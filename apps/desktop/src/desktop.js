import { connectThreads } from './threads-ui.js';
import { connectProjects } from './projects-ui.js';
import {connectSignIn} from './signin-ui.js';
import {connectModels} from './models-ui.js';
import {connectTooltips} from './tooltips.js';
import {getTheme} from './theme.js';
import {connectSettingsModal} from './settings-modal.js';
import {connectWorkspaceTools} from './workspace-tools.js';
// Desktop-only behavior; the existing shell markup, tokens and controls stay.
export function connectDesktop({prompt,send,toast,escapeHtml,showDialog,closeDialog}) {
  const api=window.sufficeDesktop;
  if(!api)return;
  document.documentElement.classList.add('desktop-app');
  const chrome=document.createElement('div');chrome.className='window-controls';chrome.setAttribute('role','group');chrome.setAttribute('aria-label','Window controls');
  const controls=[['minimize','Minimize','<path d="M3.5 8.5h9"/>'],['maximize','Maximize or restore','<rect x="3.5" y="3.5" width="9" height="9" rx=".5"/>'],['close','Close window','<path d="m3 3 10 10m-10 0 10-10"/>']];
  chrome.innerHTML=controls.map(([action,label,path])=>`<button type="button" class="window-control" data-window="${action}" aria-label="${label}" title="${label}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${path}</svg></button>`).join('');
  chrome.addEventListener('click',event=>{const control=event.target.closest('[data-window]');if(control)void api.windowControl(control.dataset.window);});document.body.append(chrome);
  const drag=document.createElement('div');drag.className='window-drag-region';drag.setAttribute('aria-hidden','true');document.body.append(drag);
  const projects=connectProjects({api,toast}),signIn=connectSignIn({api,toast});
  connectThreads({api,prompt,send,toast,projectsReady:projects.ready,ensureProject:projects.ensure,ensureSignedIn:signIn.ensure});
  connectModels({api,toast});
  connectWorkspaceTools(api);
  connectTooltips();
  // Real settings for the desktop app: account, current project, appearance.
  const modal=connectSettingsModal({api,signIn});
  async function settings(page){
    await signIn.ready;
    if(typeof page!=='string'?modal.open('account'):modal.open(page))return;
    const project=document.querySelector('.project-picker .project-name')?.textContent;
    const row=(label,value)=>`<div class="settings-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
    showDialog('Settings',row('Account',signIn.signedIn?'OpenAI · signed in':'Not signed in')+row('Project',project&&project!=='Select project'?project:'None selected')+row('Appearance',getTheme()==='light'?'Light':'Dark')+`<button type="button" class="button button--subtle dialog-action settings-account">${signIn.signedIn?'Sign out':'Sign in'}</button>`);
    document.querySelector('.settings-account').addEventListener('click',async()=>{closeDialog();if(!signIn.signedIn){signIn.open();return;}try{await signIn.signOut();toast('Signed out');}catch(error){toast(error.message);}});
  }
  window.addEventListener('suffice:settings',e=>{void settings(e.detail?.page||'account');});
  window.addEventListener('suffice:sign-in',()=>{signIn.open();});
  window.addEventListener('suffice:sign-out',()=>{signIn.signOut().catch(error=>toast(error.message));});
  return {settings};
}
