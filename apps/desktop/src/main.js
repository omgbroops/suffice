import {connectSettingsPrivacy} from './settings-privacy.js';
import {threadViewState,restoreThreadViews} from './thread-view-state.js';
import {preference,initializePreferences} from './settings-preferences.js';
import {createSettings} from './settings.js';
import {createSpotlight} from './spotlight.js';
import {sidebarPreferences} from './sidebar-preferences.js';
import {connectComposerSize} from './composer-size.js';
import {connectAttachments} from './attachments.js';
import {connectSendControls} from './send-controls.js';
import { connectDesktop } from './desktop.js';
import './desktop.css';
import '@fontsource/geist/400.css';

import '@fontsource/geist/500.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';

import './styles.css';
import './tactile.css';
import './right-panel.css';
import './composer-files.css';
import './thread-row.css';
import './window-chrome.css';
import {sessionMenuItems} from './sessions-ui.js';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import { mountAtmosphere } from './background.js';

import { ACTIVE_BACKGROUND, backgroundPresets } from './backgrounds/presets.js';

import { createMenu } from './menu.js';
import { getTheme, setTheme } from './theme.js';

import { icon, mark, button, panel } from './ui.js';

await initializePreferences();
await restoreThreadViews();
const sessions = [

  { title: 'Rebuild the cloud workspace', time: '8 days ago', repo: 'suffice-cloud', description: 'Create a focused workspace for coding agents. Refine the composer, session history, and activity overview.', public: true },

  { title: 'Add repository search', time: 'last month', repo: 'suffice', description: 'Add fast repository search with keyboard navigation and useful empty states.' },

  { title: 'Polish the landing page', time: 'last month', repo: 'suffice-platform', description: 'Refine the landing page typography, spacing, and responsive layouts.' },

  { title: 'Build session sharing', time: 'last month', repo: 'suffice-cloud', description: 'Explore a simple way to share a session with the team.' },

  { title: 'Improve agent context routing', time: 'last month', repo: 'suffice', description: 'Explore more efficient context selection for coding tasks.' },

];

const prs = [

  { title: 'Preview picker: preserve focus in text fields', time: '1 minute ago', repo: 'suffice-cloud', number: 128 },

  { title: 'Sharing: add shareable sessions and guest access', time: '3 minutes ago', repo: 'suffice-cloud', number: 127 },

  { title: 'Show shortcuts while Cmd or Ctrl is held', time: '3 minutes ago', repo: 'suffice', number: 126 },

];

const sessionRow = (s, i, sidebar = false) => `<button class="session-row ${sidebar ? 'session-row--sidebar' : ''}" data-session="${i}"><span class="list-dot">·</span><span class="row-content"><span class="row-title">${s.title}</span><span class="row-meta">${s.time}${s.public ? ` <span>·</span> ${icon('globe')}` : ''}</span></span></button>`;

function heatmap() {

  let cells = '';

  for (let col = 0; col < 24; col++) {

    for (let row = 0; row < 7; row++) {

      const seed = (col * 37 + row * 19 + col * row * 13) % 101;

      const active = col > 4 && (row < 5 || col % 5 < 3) && seed > (col > 9 && row < 5 ? 5 : 25);

      const level = active ? (seed > 88 && row < 4 ? 4 : seed > 58 ? 3 : seed > 32 ? 2 : 1) : 0;

      cells += `<span class="heatmap-cell" data-level="${level}" title="${active ? Math.ceil(seed / 9) : 0} sessions · ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][row]}, week ${col + 1}"></span>`;

    }

  }

  return `<div class="heatmap" role="img" aria-label="Sample activity heatmap, May through November">${cells}</div><div class="activity-footer"><span>812 sessions <span>·</span> 380 PRs merged <span>·</span> 259,269 lines</span><span>May – Nov</span></div>`;

}

document.querySelector('#app').innerHTML = `

  <aside class="sidebar" id="session-sidebar" aria-label="Session navigation">
    <div class="sidebar-resizer" role="separator" tabindex="0" aria-label="Resize sidebar" aria-orientation="vertical" aria-controls="session-sidebar" aria-valuemin="280" aria-valuemax="400" aria-valuenow="280"></div>

    <div class="sidebar-heading"><button type="button" class="brand-wordmark brand-home" data-action="brand-home" aria-label="Suffice home">[suffice]</button><div class="sidebar-tools">${button('Settings', { icon: 'gear', action: 'settings' })}${button('Search sessions', { icon: 'search', action: 'search-sessions' })}${button('Collapse sidebar', { icon: 'panel', action: 'toggle-sidebar' })}</div></div>

    ${button('New session', { icon: 'plus', variant: 'subtle', className: 'new-session', action: 'new', content: 'New session' })}

    <div class="session-section"><div class="section-label"><span id="sidebar-section-label">Threads</span></div><div class="sidebar-sessions">${sessions.map((s, i) => sessionRow(s, i, true)).join('')}</div></div>




  </aside>

  <main class="workspace">

    <canvas class="atmosphere" aria-hidden="true"></canvas><div class="atmosphere-shade" aria-hidden="true"></div>

    ${button('Open sidebar', { icon: 'panel', className: 'sidebar-reopen', action: 'toggle-sidebar' })}

    <div class="home">

      <div class="agent-area"><h1 class="brand"><span class="brand-wordmark">[suffice]</span></h1>

        <form class="composer" aria-label="Start an agent session">

          <label class="sr-only" for="prompt">What would you like to build?</label>

          <textarea id="prompt" placeholder="Ask Suffice to build features, fix bugs, or work on your code" rows="2"></textarea>

          <div class="attachment-chip" hidden></div>

          <div class="composer-toolbar"><div class="toolbar-group">

            ${button('Add attachment', { icon: 'plus', action: 'attach' })}



          </div><div class="toolbar-group toolbar-right">

            ${button('Choose model speed', { action: 'model-menu', className: 'model-button', content: `<span id="model-label">Normal Fast</span>${icon('chevron')}` })}

            ${button('Choose repository', { icon: 'folder', action: 'repo-menu', className: 'repo-button' })}

            <div class="send-group"><button class="button send-button" type="submit" aria-label="Start session" title="Start session" disabled>${icon('arrow')}</button>${button('Session options', { icon: 'chevron', action: 'send-menu', className: 'send-options' })}</div>

          </div></div>

        </form>

      </div>

      <div class="dashboard">

        ${panel('Activity', 'calendar', heatmap(), 'activity-panel')}

        ${panel('Recent sessions', 'history', `<div class="recent-list">${sessions.slice(0, 3).map((s, i) => sessionRow(s, i)).join('')}</div><button class="text-button" data-action="more-sessions">2 more</button>`, 'recent-panel')}

        ${panel('Usage', 'usage', '<div class="usage-value">880.29 <span>credits</span></div><p class="muted">Resets Dec 1</p>', 'usage-panel')}

        ${panel('Pull requests', 'branch', `<div class="pr-list">${prs.map((p, i) => `<button class="pr-row" data-pr="${i}">${icon('merge')}<span class="row-content"><span class="row-title">${p.title}</span><span class="row-meta">${p.time} <span>·</span> mohammed</span></span></button>`).join('')}</div><button class="text-button" data-action="all-prs">97 more</button>`, 'pr-panel')}

        ${panel('This month', 'chart', '<div class="month-stat"><span class="muted">Sessions</span><div><span class="stat-value stat-value--blue">36</span><span class="stat-change">-177</span></div></div><div class="month-stat"><span class="muted">PRs merged</span><div><span class="stat-value stat-value--purple">7</span><span class="stat-change">-50</span></div></div>', 'month-panel')}

      </div>

    </div>



  </main>

  <div class="popover" id="popover" hidden></div>

  <dialog class="detail-dialog" aria-labelledby="dialog-title"><div class="dialog-top">${mark}${button('Close dialog', { icon: 'close', action: 'close-dialog' })}</div><div id="dialog-body"></div></dialog>

  <div class="toast" role="status" hidden></div>

  <input type="file" id="file-input" hidden />

`;

let unmountAtmosphere = mountAtmosphere(document.querySelector('.atmosphere'));

const prompt = document.querySelector('#prompt');

const send = document.querySelector('.send-button');

const popover = document.querySelector('#popover');

const { open: menu, close: closeMenu } = createMenu(popover);

const dialog = document.querySelector('dialog');


let toastTimeout;

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function toast(message) {

  const el = document.querySelector('.toast');

  el.textContent = message; el.hidden = false;

  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { el.hidden = true; }, 3500);

}

function showDialog(title, content) {

  closeMenu();

  document.querySelector('#dialog-body').innerHTML = `<h2 id="dialog-title">${title}</h2>${content}`;

  dialog.showModal();

}

prompt.addEventListener('input', () => { send.disabled = !prompt.value.trim(); });

prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && (preference('send','Enter')==='Enter'||e.ctrlKey||e.metaKey)) { e.preventDefault(); if (!send.disabled) document.querySelector('form').requestSubmit(); } });

document.querySelector('form').addEventListener('submit', (e) => {

  e.preventDefault(); if (!prompt.value.trim()) return;

  showDialog('Your session is ready', `<p class="dialog-prompt">${escapeHtml(prompt.value)}</p><div class="session-detail-meta">${icon('agent')} Agent <span>·</span> ${document.querySelector('#model-label').textContent}</div><p class="dialog-note">This is a visual prototype. Your prompt stays in this browser; no agent is started.</p><button class="button button--subtle dialog-action" data-action="close-dialog">Back to workspace</button>`);

});

document.addEventListener('click', (e) => {

  const session = e.target.closest('[data-session]');

  if (session) { const s = sessions[Number(session.dataset.session)]; showDialog(escapeHtml(s.title), `<div class="session-detail-meta">${icon('folder')}${s.repo}<span>·</span>${s.time}</div><p>${s.description}</p><div class="sample-note">Sample session · prototype data</div>`); return; }

  const pr = e.target.closest('[data-pr]');

  if (pr) { const p = prs[Number(pr.dataset.pr)]; showDialog(p.title, `<div class="session-detail-meta">${icon('merge', 'green')}${p.repo}<span>·</span>#${p.number}</div><p>This sample pull request has been merged.</p><div class="sample-note">Sample pull request · prototype data</div>`); return; }

  const item = e.target.closest('[data-menu-action]');

  if (item) {

    closeMenu(true);

    const [type, value] = item.dataset.menuAction.split(':');

    if (type === 'background-send') { document.querySelector('.composer').backgroundSubmit=true;document.querySelector('.composer').requestSubmit(); }

    if (type === 'sidebar') sidebarPreferences.choose(value);

    if (type === 'model') document.querySelector('#model-label').textContent = value;

    if (type === 'repo') { document.querySelector('.repo-button').title = value; toast(`Repository selected: ${value}`); }

    if (type === 'shortcut') { prompt.value = value + ' '; prompt.dispatchEvent(new Event('input')); prompt.focus(); }

    if (type === 'attach') document.querySelector('#file-input').click();

    if (type === 'settings') showSettings();

    if (type === 'search') showSearch();

    if (type === 'option') toast(value);
    if (type === 'theme') setTheme(value);

    if (type === 'background') {

      if (Object.hasOwn(backgroundPresets, value)) {

        try { localStorage.setItem('suffice-background', value); } catch {}
        unmountAtmosphere();

        const url = new URL(window.location.href);

        if (value === ACTIVE_BACKGROUND) url.searchParams.delete('background');

        else url.searchParams.set('background', value);

        history.replaceState(null, '', url);

        unmountAtmosphere = mountAtmosphere(document.querySelector('.atmosphere'));

      }

    }

    if (type === 'motion') {

      const canvas = document.querySelector('.atmosphere');

      if (value === 'replay') canvas.dispatchEvent(new Event('replay-formation'));

      else {

        canvas.dataset.motion = canvas.dataset.motion === 'paused' ? 'running' : 'paused';

        canvas.dispatchEvent(new Event('motion-change'));

      }

    }

    return;

  }

  const control = e.target.closest('[data-action]');

  if (!control) { if (!e.target.closest('.popover')) closeMenu(); return; }

  const action = control.dataset.action;

  if (!action.endsWith('-menu') && !['shortcuts', 'attach', 'workspace-menu', 'send-menu'].includes(action)) closeMenu();

  switch (action) {

    case 'brand-home': if(settingsPage?.isOpen)void settingsPage.close();else document.querySelector('.new-session').click(); break;

    case 'new': prompt.value = ''; send.disabled = true; document.querySelector('.composer').attachments?.clear(); prompt.focus(); if (innerWidth < 700) document.body.classList.remove('sidebar-open'); break;

    case 'toggle-sidebar': if (innerWidth < 700) document.body.classList.toggle('sidebar-open'); else document.body.classList.toggle('sidebar-collapsed'); break;


    case 'model-menu': menu(control, ['Normal Fast', 'Normal', 'Deep'].map(label => ({ label, detail: { 'Normal Fast': 'Quick, everyday tasks', Normal: 'Balanced reasoning', Deep: 'Complex, considered work' }[label], action: `model:${label}`, selected: label === document.querySelector('#model-label').textContent }))); break;

    case 'repo-menu': menu(control, ['suffice-cloud', 'suffice', 'suffice-platform'].map(label => ({ label, action: `repo:${label}` }))); break;


    case 'attach': document.querySelector('#file-input').click(); break;

    case 'send-menu': menu(control, [{ label: 'Start session in background', action: 'background-send:start' }, ...sessionMenuItems()]); break;

    case 'sidebar-menu': menu(control, sidebarPreferences.items(), 'Sidebar'); break;

    case 'workspace-menu': menu(control, [{ label: 'Sidebar', children: () => sidebarPreferences.items() }, { label: 'Background', children: backgroundOptions }, { label: 'Theme', children: themeOptions }, { label: 'Workspace settings', action: 'settings:open' }]); break;


    case 'search-sessions': showSearch(); break;

    case 'settings': showSettings(); break;

    case 'more-sessions': { const expanded = control.dataset.expanded === 'true'; document.querySelector('.recent-list').innerHTML = sessions.slice(0, expanded ? 3 : 5).map((s, i) => sessionRow(s, i)).join(''); control.dataset.expanded = String(!expanded); control.textContent = expanded ? '2 more' : 'Show less'; break; }

    case 'all-prs': showDialog('Pull requests', `<div class="dialog-prs">${prs.map((p, i) => `<button class="pr-row" data-pr="${i}">${icon('merge')}<span class="row-content"><span class="row-title">${p.title}</span><span class="row-meta">${p.repo} #${p.number}</span></span></button>`).join('')}</div><div class="sample-note">3 sample pull requests · prototype data</div>`); break;

    case 'close-dialog': dialog.close(); break;

    case 'about': showDialog('A space to build', '<p>A visual prototype of the Suffice cloud workspace. A focused canvas for your coding agent, with sessions, activity, and pull requests close at hand.</p><p class="dialog-note">All activity, sessions, usage, and pull requests are sample data. No backend is connected.</p>'); break;

  }

});

function themeOptions() {
  return ['dark', 'light'].map(theme => ({ label: theme === 'dark' ? 'Dark' : 'Light', action: `theme:${theme}`, selected: getTheme() === theme }));
}

function backgroundOptions() {

  const canvas = document.querySelector('.atmosphere');

  const current = canvas.dataset.background;

  const items = ['none', 'ascii', 'sonar', 'oceanic', 'lake', 'orbital', 'horizon', 'dusk', 'glacier'].map(key => ({

    label: backgroundPresets[key].label,

    detail: { ascii: 'Glowing ASCII gradient', sonar: 'Dot grid with ambient and click-triggered ripples', oceanic: 'Supplied blue gradient with fine grain', lake: 'Original dithered moonlit scenery', orbital: 'Saved · planetary arc with formation and glow', horizon: 'Saved · blue and amber', dusk: 'Saved · violet and soft rose', glacier: 'Saved · cool teal and silver' }[key],

    action: `background:${key}`, selected: current === key,

  }));

  if (current === 'orbital') {

    const settled = canvas.dataset.formation === 'settled';

    const paused = canvas.dataset.motion === 'paused';

    if (settled) items.push({ label: 'Replay formation', action: 'motion:replay', separator: true });

    items.push({ label: settled ? paused ? 'Resume glow' : 'Pause glow' : paused ? 'Resume animation' : 'Pause animation', action: 'motion:toggle', separator: !settled });

  }
  if (['ascii', 'sonar', 'lake'].includes(current)) items.push({ label: canvas.dataset.motion === 'paused' ? 'Resume animation' : 'Pause animation', action: 'motion:toggle', separator: true });

  return items;

}

let settingsPage;
document.addEventListener('suffice-open-settings',event=>{closeMenu();(settingsPage??=createSettings()).open(event.detail?.section);});
function showSettings() { closeMenu(); if(settingsPage?.isOpen)settingsPage.close();else (settingsPage??=createSettings()).open(); }

const spotlight=createSpotlight({commands:()=>[
 {id:'new',title:'New session',icon:'plus',run:()=>document.querySelector('.new-session').click()},
 {id:'sidebar',title:'Toggle sidebar',icon:'panel',run:()=>document.querySelector('[data-action="toggle-sidebar"]').click()},
 {id:'project',title:'Choose project',icon:'folder',run:()=>document.querySelector('.project-picker')?.click()},
 {id:'theme',title:getTheme()==='dark'?'Use light theme':'Use dark theme',icon:'agent',run:()=>setTheme(getTheme()==='dark'?'light':'dark')},
 {id:'settings',title:'Workspace settings',icon:'agent',run:showSettings}
]});
function showSearch(keyboard=false){spotlight.open({keyboard});}

dialog.addEventListener('click', (e) => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });

document.addEventListener('keydown', (e) => {

  if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); showSettings(); }

  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); showSearch(true); }

});

import { setupSidebarResize } from './sidebar-resize.js';
setupSidebarResize();

connectSendControls(document.querySelector('.composer'),prompt,send);
connectComposerSize(document.querySelector('.composer'),prompt);
connectAttachments({form:document.querySelector('.composer'),prompt,send,input:document.querySelector('#file-input'),toast});
connectDesktop({prompt,send,toast,escapeHtml});

document.addEventListener('suffice-preference',event=>{const {id,value}=event.detail;if(id==='background'){localStorage.setItem('suffice-background',value);unmountAtmosphere();const url=new URL(location.href);url.searchParams.set('background',value);history.replaceState(null,'',url);unmountAtmosphere=mountAtmosphere(document.querySelector('.atmosphere'));}if(id==='background-motion'||id==='reduced-motion'||id==='background'){document.querySelector('.atmosphere').dataset.motion=preference('background-motion',true)&&!preference('reduced-motion',false)?'running':'paused';}});
document.querySelector('.atmosphere').dataset.motion=preference('background-motion',true)&&!preference('reduced-motion',false)?'running':'paused';
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&preference('escape',false)&&!document.querySelector('.settings-main:not([hidden])')&&document.querySelector('.composer')?.dataset.running==='true')void window.sufficeDesktop.abort(threadViewState.id);});

document.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey))return;if(event.key.toLowerCase()==='n'){event.preventDefault();Promise.resolve(settingsPage?.close()).then(()=>document.querySelector('.new-session').click());}if(event.key.toLowerCase()==='b'){event.preventDefault();document.querySelector('[data-action=toggle-sidebar]').click();}});

window.sufficeDesktop?.onNotification?.(event=>{if(!event.play)return;const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const audio=new Audio(),oscillator=audio.createOscillator(),gain=audio.createGain(),duration=event.sound==='Click'?.05:event.sound==='Chime'?.3:.16;oscillator.frequency.value=event.sound==='Click'?180:event.sound==='Chime'?740:440;gain.gain.setValueAtTime(.06,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);oscillator.onended=()=>audio.close();});

connectSettingsPrivacy();
import './focus-modality.js';
