// Neon account menu: the sidebar footer button and its popout (Settings, Usage, Language, Get help, Sign out).
// Platform: modifier names and the Settings shortcut follow window.__nxPlatform (tests) or the real platform.
import './neon-user-menu.css';
import { UM_ICONS } from './neon-icons.js';
import { esc } from './neon-util.js';
export const ISSUES_URL = 'https://github.com/sufficelabs/suffice/issues';
// evaluated on use, so a test can force the platform before any menu opens
export const isMac = () => /mac|darwin/i.test(String(window.__nxPlatform || navigator.userAgentData?.platform || navigator.platform || ''));
export const modLabel = () => isMac() ? '⌘' : 'Ctrl';
export const keyLabel = (...keys) => isMac() ? keys.map(k => k === 'Shift' ? '⇧' : k).join('') : keys.join('+');
export const openSettings = page => window.dispatchEvent(new CustomEvent('suffice:settings', { detail: { page } }));
const cap = p => { const s = String(p || '').replace(/[_-]+/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : ''; };

export function mountUserMenu({ api, icons: I, pixelAvatar, userAv, foot }) {
  if (!foot) return { set() {}, cleanup() {} };
  const st = { login: '', author: '', info: {}, signed: true };
  let menu = null, sub = null, subRow = null, timer = 0, html = '';
  foot.setAttribute('role', 'button'); foot.tabIndex = 0; foot.setAttribute('aria-haspopup', 'menu'); foot.setAttribute('aria-expanded', 'false');
  const name = () => st.login || st.info.gitName || st.author || 'Local';
  const render = () => {
    const next = `${st.login ? userAv() : pixelAvatar(name())}<span class="nx-um-name">${esc(name())}</span><span class="nx-um-plan">· ${esc(cap(st.info.plan) || 'Local')}</span>${UM_ICONS.down}`;
    foot.dataset.login = st.login;
    if (next !== html) { html = next; foot.innerHTML = next; }
  };
  const load = () => api?.accountInfo?.().then(i => { st.info = i || {}; render(); }).catch(() => {});
  api?.status?.().then(r => { st.signed = Boolean(r?.authenticated); }).catch(() => {});
  render(); load();

  const rows = el => [...el.querySelectorAll('.nx-um-mi')];
  const row = ({ id, icon, label, kbd, sub: s, checked }) =>
    `<button type="button" class="nx-um-mi" role="${s ? 'menuitem' : checked !== undefined ? 'menuitemradio' : 'menuitem'}" data-id="${id}"${s ? ' aria-haspopup="menu" aria-expanded="false"' : ''}${checked !== undefined ? ` aria-checked="${checked}"` : ''}>${icon || ''}<span class="nx-um-l">${label}</span>${kbd ? `<span class="nx-um-k">${esc(kbd)}</span>` : ''}${s ? UM_ICONS.right : ''}${checked ? `<span class="nx-um-c">${UM_ICONS.check}</span>` : ''}</button>`;
  const subs = () => ({
    language: [{ id: 'lang-en', label: 'English', checked: true }],
    help: [{ id: 'issue', icon: UM_ICONS.external, label: 'Report an issue' }, { id: 'shortcuts', icon: UM_ICONS.keyboard, label: 'Keyboard shortcuts' }],
  });
  const items = () => [
    { id: 'settings', icon: I.gear, label: 'Settings', kbd: keyLabel(modLabel(), ',') },
    { id: 'usage', icon: UM_ICONS.gauge, label: 'Usage' },
    { id: 'language', icon: UM_ICONS.globe, label: 'Language', sub: 1 },
    { id: 'help', icon: UM_ICONS.help, label: 'Get help', sub: 1 },
    'sep',
    st.signed ? { id: 'out', icon: I.exit, label: 'Sign out' } : { id: 'in', icon: I.exit, label: 'Sign in' },
  ];

  const place = (el, x, y) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.round(Math.max(8, Math.min(x, innerWidth - w - 8)))}px`;
    el.style.top = `${Math.round(Math.max(8, Math.min(y, innerHeight - h - 8)))}px`;
    el.style.visibility = '';
  };
  const closeSub = refocus => {
    clearTimeout(timer);
    if (sub) { sub.remove(); sub = null; }
    if (subRow) { subRow.setAttribute('aria-expanded', 'false'); if (refocus) subRow.focus(); subRow = null; }
  };
  function openSub(r, focusFirst) {
    clearTimeout(timer);
    if (subRow === r) { if (focusFirst) rows(sub)[0]?.focus(); return; }
    closeSub(false);
    subRow = r; r.setAttribute('aria-expanded', 'true');
    const s = document.createElement('div'); s.className = 'nx nx-um nx-um-sub'; s.setAttribute('role', 'menu'); s.tabIndex = -1; s.style.visibility = 'hidden';
    s.innerHTML = subs()[r.dataset.id].map(row).join('');
    document.body.append(s); sub = s;
    const mr = menu.getBoundingClientRect(), rr = r.getBoundingClientRect(), w = s.offsetWidth;
    const x = mr.right - 4 + w > innerWidth - 8 ? mr.left - w + 4 : mr.right - 4;
    place(s, x, rr.top - 7);
    s.addEventListener('pointerenter', () => clearTimeout(timer));
    s.addEventListener('keydown', e => keys(e, s));
    s.addEventListener('click', e => { const b = e.target.closest('.nx-um-mi'); if (b) act(b.dataset.id); });
    if (focusFirst) rows(s)[0]?.focus();
  }
  function close(refocus) {
    closeSub(false);
    menu?.remove(); menu = null;
    foot.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', onResize);
    if (refocus) foot.focus();
  }
  const outside = e => { if (!menu?.contains(e.target) && !sub?.contains(e.target) && !foot.contains(e.target)) close(false); };
  const onResize = () => close(false);
  function act(id) {
    close(id !== 'out' && id !== 'in' ? true : false);
    if (id === 'settings') openSettings('account');
    else if (id === 'usage') openSettings('usage');
    else if (id === 'shortcuts') openSettings('shortcuts');
    else if (id === 'issue') api?.openGithub?.(ISSUES_URL)?.catch?.(() => {});
    else if (id === 'out') window.dispatchEvent(new CustomEvent('suffice:sign-out'));
    else if (id === 'in') window.dispatchEvent(new CustomEvent('suffice:sign-in'));
  }
  function keys(e, el) {
    const list = rows(el), i = list.indexOf(document.activeElement), k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); const d = k === 'ArrowDown' ? 1 : -1; list[i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length]?.focus(); }
    else if (k === 'Home' || k === 'End') { e.preventDefault(); list[k === 'Home' ? 0 : list.length - 1]?.focus(); }
    else if (k === 'Enter' || k === ' ') { if (i >= 0) { e.preventDefault(); list[i].click(); } }
    else if (k === 'ArrowRight') { if (el === menu && list[i]?.getAttribute('aria-haspopup')) { e.preventDefault(); openSub(list[i], true); } }
    else if (k === 'ArrowLeft') { if (el === sub) { e.preventDefault(); closeSub(true); } }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); sub ? closeSub(true) : close(true); }
    else if (k === 'Tab') close(false);
  }
  function open(viaKey) {
    if (menu) return close(true);
    const m = document.createElement('div'); m.className = 'nx nx-um'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Account'); m.tabIndex = -1; m.style.visibility = 'hidden';
    const mail = st.info.email || st.info.gitEmail;
    m.innerHTML = (mail ? `<div class="nx-um-mail">${esc(mail)}</div>` : '') + items().map(it => it === 'sep' ? '<div class="nx-um-sep" role="separator"></div>' : row(it)).join('');
    document.body.append(m); menu = m;
    const r = foot.getBoundingClientRect(), h = m.offsetHeight;
    place(m, r.left, r.top - h - 6 < 8 ? r.bottom + 6 : r.top - h - 6);
    foot.setAttribute('aria-expanded', 'true');
    m.addEventListener('keydown', e => keys(e, m));
    m.addEventListener('click', e => { const b = e.target.closest('.nx-um-mi'); if (!b) return; if (b.getAttribute('aria-haspopup')) openSub(b, false); else act(b.dataset.id); });
    m.addEventListener('pointerover', e => {
      const b = e.target.closest('.nx-um-mi'); if (!b) return;
      if (b.getAttribute('aria-haspopup')) openSub(b, false);
      else if (sub) { clearTimeout(timer); timer = setTimeout(() => closeSub(false), 120); }
    });
    document.addEventListener('pointerdown', outside, true); window.addEventListener('resize', onResize);
    (viaKey ? rows(m)[0] : m).focus();
  }
  const onFoot = e => { if (e.type === 'click') open(false); else if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(true); } };
  foot.addEventListener('click', onFoot); foot.addEventListener('keydown', onFoot);
  // Settings shortcut: Cmd+, on macOS, Ctrl+, elsewhere (the other modifier must be off)
  const onKey = e => {
    if (e.key !== ',' || e.altKey || e.shiftKey || !(isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return;
    e.preventDefault(); if (menu) close(false); openSettings('account');
  };
  document.addEventListener('keydown', onKey, true);
  const onIn = () => { st.signed = true; load(); }, onOut = () => { st.signed = false; st.info = { ...st.info, email: null, plan: null }; render(); load(); };
  document.addEventListener('suffice:signed-in', onIn); document.addEventListener('suffice:signed-out', onOut);

  return {
    set(info) { st.login = info?.login || ''; st.author = info?.author || ''; render(); load(); },
    cleanup() { close(false); clearTimeout(timer); document.removeEventListener('keydown', onKey, true); document.removeEventListener('suffice:signed-in', onIn); document.removeEventListener('suffice:signed-out', onOut); },
  };
}
