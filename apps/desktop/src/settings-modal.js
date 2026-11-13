// Neon Settings window: Account, Usage, Appearance, Shortcuts. Opened by the 'suffice:settings' window event (see desktop.js).
import './settings-modal.css';
import { UM_ICONS, keyLabel, modLabel } from './backgrounds/neon-user-menu.js';
import { backgroundPresets } from './backgrounds/presets.js';
import { getTheme, setTheme } from './theme.js';

const NAV = [['account', 'Account', 'user'], ['usage', 'Usage', 'gauge'], ['appearance', 'Appearance', 'palette'], ['shortcuts', 'Shortcuts', 'keyboard']];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmtN = n => Number(n || 0).toLocaleString('en-US');
const fmtC = n => `$${Number(n || 0).toFixed(2)}`;

export function connectSettingsModal({ api, signIn }) {
  let root = null, page = 'account', query = '', info = {}, usage = null, prevFocus = null;
  const shortcuts = () => {
    const mod = modLabel();
    return [
      ['Search', keyLabel(mod, 'K')], ['New thread', keyLabel(mod, 'N')], ['Settings', keyLabel(mod, ',')],
      ['Filter files', keyLabel(mod, 'P')], ['Toggle explorer', keyLabel(mod, '\\')],
      ['Send', 'Enter'], ['New line', keyLabel('Shift', 'Enter')], ['Send in background', 'Ctrl+Enter'], ['Close dialog or pane', 'Esc'],
    ];
  };
  const match = t => !query || String(t).toLowerCase().includes(query.toLowerCase());
  const row = (label, control, extra = '') => `<div class="nx-st-row" data-label="${esc(label)}"${extra}><span class="nx-st-rl">${esc(label)}</span><span class="nx-st-rc">${control}</span></div>`;
  const table = (head, rows) => rows.length
    ? `<table class="nx-st-t"><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="r"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';

  const avatar = () => {
    const img = document.querySelector('.nx-foot img.nx-av');
    return img ? `<img class="nx-av nx-st-av" src="${esc(img.getAttribute('src'))}" alt="">` : (document.querySelector('.nx-foot .nx-av')?.outerHTML.replace('class="nx-av', 'class="nx-av nx-st-av') || '');
  };
  const pages = {
    account() {
      const name = document.querySelector('.nx-um-name')?.textContent || 'Local', signed = signIn.signedIn;
      const login = document.querySelector('.nx-foot')?.dataset.login || '';
      return `<div class="nx-st-id">${avatar()}<div class="nx-st-who"><strong>${esc(name)}</strong><span>${esc(info.email || info.gitEmail || '')}</span></div></div>`
        + [login && match('GitHub') ? row('GitHub', esc(login)) : '',
          match('Plan') ? row('Plan', esc(info.plan ? info.plan[0].toUpperCase() + info.plan.slice(1) : 'Local')) : '',
          match('OpenAI') ? row('OpenAI', `<button type="button" class="nx-st-btn" data-act="${signed ? 'out' : 'in'}">${signed ? 'Sign out' : 'Sign in'}</button>`) : ''].join('');
    },
    usage() {
      if (!usage) return '<div class="nx-st-empty">Loading</div>';
      if (!usage.days.length) return '<div class="nx-st-empty">No usage in the last 30 days</div>';
      return `${row('Tokens, 30 days', fmtN(usage.tokens))}${row('Cost, 30 days', fmtC(usage.cost))}`
        + `<div class="nx-st-h">By day</div>${table(['Day', 'Tokens', 'Cost'], usage.days.map(d => [d.day, fmtN(d.tokens), fmtC(d.cost)]))}`
        + `<div class="nx-st-h">By model</div>${table(['Model', 'Tokens', 'Cost'], usage.models.map(m => [m.model, fmtN(m.tokens), fmtC(m.cost)]))}`;
    },
    appearance() {
      const theme = getTheme(), cur = localStorage.getItem('suffice-background') || '', compact = document.body.hasAttribute('data-nx-compact');
      const seg = (name, val, opts) => `<span class="nx-st-seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" class="nx-st-opt" data-${name}="${v}" aria-pressed="${v === val}">${l}</button>`).join('')}</span>`;
      const skins = Object.entries(backgroundPresets).filter(([, p]) => match(p.label) || match('Background'));
      return (match('Theme') ? row('Theme', seg('theme', theme, [['dark', 'Dark'], ['light', 'Light']])) : '')
        + (match('Compact thread list') ? row('Compact thread list', `<button type="button" class="nx-st-sw" role="switch" aria-checked="${compact}" data-compact></button>`) : '')
        + (skins.length ? `<div class="nx-st-h">Background</div><div class="nx-st-skins" role="radiogroup" aria-label="Background">${skins.map(([k, p]) => `<button type="button" class="nx-st-skin" role="radio" aria-checked="${k === cur}" data-skin="${esc(k)}">${esc(p.label)}</button>`).join('')}</div>` : '');
    },
    shortcuts() {
      const list = shortcuts().filter(([a, b]) => match(a) || match(b));
      return list.length ? table(['Action', 'Shortcut'], list) : '';
    },
  };
  const visibleNav = () => NAV.filter(([k, l]) => match(l) || pageText(k));
  const pageText = k => k === 'shortcuts' ? shortcuts().some(([a, b]) => match(a) || match(b)) : k === 'appearance' ? ['Theme', 'Compact thread list', 'Background'].some(match) || Object.values(backgroundPresets).some(p => match(p.label)) : k === 'account' ? ['Account', 'GitHub', 'Plan', 'OpenAI', 'Sign out', 'Sign in', 'Email'].some(match) : false;

  function paint() {
    if (!root) return;
    const nav = visibleNav();
    if (nav.length && !nav.some(([k]) => k === page)) page = nav[0][0];
    root.querySelector('.nx-st-navlist').innerHTML = nav.map(([k, l, i]) => `<button type="button" class="nx-st-nav" data-page="${k}" aria-current="${k === page}">${UM_ICONS[i]}<span>${l}</span></button>`).join('');
    const title = NAV.find(([k]) => k === page)?.[1] || '';
    const body = nav.length ? (pages[page]() || '') : '';
    root.querySelector('.nx-st-main').innerHTML = `<h2 class="nx-st-title">${title}</h2>${body || (nav.length ? '' : '<div class="nx-st-empty">No results</div>')}`;
  }
  async function load(withUsage) {
    try { const i = await api.accountInfo(withUsage); info = i || {}; if (withUsage) usage = i?.usage || { days: [], models: [], tokens: 0, cost: 0 }; } catch { if (withUsage && !usage) usage = { days: [], models: [], tokens: 0, cost: 0 }; }
    paint();
  }
  function go(p) { page = p; paint(); if (p === 'usage') { usage = null; paint(); load(true); } }
  function close() {
    if (!root) return;
    document.removeEventListener('keydown', onKey, true); document.removeEventListener('suffice:signed-in', refreshAcct); document.removeEventListener('suffice:signed-out', refreshAcct);
    root.remove(); root = null;
    (prevFocus?.isConnected ? prevFocus : document.querySelector('.nx-foot'))?.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { const f = [...root.querySelectorAll('button,input')].filter(x => !x.disabled && x.offsetParent), i = f.indexOf(document.activeElement); if (f.length) { e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); } }
  }
  function open(p) {
    if (document.body.dataset.skin !== 'neon') return false;
    if (root) { close(); }
    prevFocus = document.activeElement; query = '';
    root = document.createElement('div'); root.className = 'nx nx-st-ov';
    root.innerHTML = `<div class="nx-st" role="dialog" aria-modal="true" aria-label="Settings"><header class="nx-st-hd"><h1>Settings</h1><button type="button" class="nx-st-x" aria-label="Close" data-act="close">${UM_ICONS.x}</button></header><div class="nx-st-bd"><nav class="nx-st-side"><label class="nx-st-search">${UM_ICONS.search}<input type="text" placeholder="Search" aria-label="Search settings" autocomplete="off" spellcheck="false"></label><div class="nx-st-navlist"></div></nav><main class="nx-st-main"></main></div></div>`;
    document.body.append(root);
    root.addEventListener('pointerdown', e => { if (e.target === root) close(); });
    root.addEventListener('input', e => { if (e.target.matches('input')) { query = e.target.value.trim(); paint(); } });
    root.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.page) go(t.dataset.page);
      else if (t.dataset.act === 'close') close();
      else if (t.dataset.act === 'out') window.dispatchEvent(new CustomEvent('suffice:sign-out'));
      else if (t.dataset.act === 'in') window.dispatchEvent(new CustomEvent('suffice:sign-in'));
      else if (t.dataset.theme) { setTheme(t.dataset.theme); paint(); }
      else if (t.dataset.skin) { const b = document.createElement('button'); b.dataset.menuAction = `background:${t.dataset.skin}`; b.hidden = true; document.body.append(b); b.click(); b.remove(); setTimeout(() => { paint(); }, 0); }
      else if ('compact' in t.dataset) { document.querySelector('[data-nx="density"]')?.click(); paint(); }
    });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('suffice:signed-in', refreshAcct); document.addEventListener('suffice:signed-out', refreshAcct);
    go(NAV.some(([k]) => k === p) ? p : 'account');
    if (page !== 'usage') load(false);
    root.querySelector('.nx-st-nav[aria-current="true"]')?.focus();
    return true;
  }
  function refreshAcct() { if (!root) return; setTimeout(() => { if (page === 'usage') load(true); else load(false); }, 50); }
  return { open, get isOpen() { return Boolean(root); } };
}
