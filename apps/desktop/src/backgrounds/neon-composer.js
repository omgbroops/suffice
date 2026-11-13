// Neon composer menus: "+" add menu, run options, run-location chip, footer account menu, dictation.
// Mounted from mountNeonChrome; returns a cleanup. Menus are .nx.nx-pop.nx-menu popovers.
import { getTheme, setTheme } from '../theme.js';

export function mountNeonComposer({ api, note, esc, icons: I, S, data, prompt, form, foot, getLogin }) {
  const undo = [];
  let menu = null, anchorEl = null;
  const q = (s, r = document) => r.querySelector(s);
  const fire = s => q(s)?.click();

  // ---- popover helper ----
  function closeMenu(focus = true) { const a = anchorEl; menu?.remove(); menu = null; anchorEl = null; a?.setAttribute('aria-expanded', 'false'); if (focus && a?.isConnected) a.focus?.(); }
  function place() {
    if (!menu || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect(); menu.style.left = `${Math.max(8, r.left)}px`; // set x first so the height is measured at its final width
    const h = menu.offsetHeight, w = menu.offsetWidth;
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, innerHeight - h - 8);
    menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`; menu.style.top = `${Math.max(8, top)}px`;
  }
  // items: { label, icon, hint, check, disabled, keepOpen, run }
  function row(it) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'nx-mi'; b.setAttribute('role', 'menuitem');
    if (it.check !== undefined) { b.setAttribute('role', 'menuitemcheckbox'); b.setAttribute('aria-checked', String(!!it.check)); }
    b.innerHTML = `${it.icon || ''}<span class="nx-mi-l">${esc(it.label)}</span>${it.hint ? `<span class="nx-mi-h">${esc(it.hint)}</span>` : ''}${it.check ? I.check : ''}`;
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', () => { if (!it.keepOpen) closeMenu(false); it.run?.(b); });
    return b;
  }
  function openMenu(anchor, items, { label, head } = {}) {
    const same = menu && anchorEl === anchor; closeMenu(false); document.querySelectorAll('.nx-pop').forEach(e => e.remove());
    if (same) return null;
    menu = document.createElement('div'); menu.className = 'nx nx-pop nx-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', label || 'Menu');
    if (head) menu.insertAdjacentHTML('beforeend', `<div class="nx-pop-head">${esc(head)}</div>`);
    for (const it of items) menu.append(it.sep ? Object.assign(document.createElement('div'), { className: 'nx-sep' }) : row(it));
    document.body.append(menu); anchorEl = anchor; anchor.setAttribute('aria-expanded', 'true'); place();
    menu.querySelector('.nx-mi:not(:disabled)')?.focus();
    return menu;
  }
  const items_ = () => [...(menu?.querySelectorAll('.nx-mi:not(:disabled)') || [])];
  const onKey = e => {
    if (!menu) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    if (e.target.matches?.('input')) { if (e.key === 'ArrowDown') { e.preventDefault(); items_()[0]?.focus(); } return; }
    const list = items_(), i = list.indexOf(document.activeElement);
    const to = { ArrowDown: (i + 1) % list.length, ArrowUp: (i - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
    if (to !== undefined && list.length) { e.preventDefault(); list[to].focus(); } else if (e.key === 'Tab') closeMenu(false);
  };
  const onDown = e => { if (menu && !menu.contains(e.target) && !anchorEl?.contains(e.target)) closeMenu(false); };
  document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('resize', place);
  undo.push(() => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('resize', place); closeMenu(false); });

  // ---- prompt insert ----
  function insert(text) {
    if (!prompt) return;
    const s = prompt.selectionStart ?? prompt.value.length, e = prompt.selectionEnd ?? s, v = prompt.value;
    const lead = s > 0 && !/\s/.test(v[s - 1]) ? ' ' : '';
    prompt.value = v.slice(0, s) + lead + text + v.slice(e);
    prompt.selectionStart = prompt.selectionEnd = s + lead.length + text.length;
    prompt.dispatchEvent(new Event('input', { bubbles: true })); prompt.focus();
  }

  // ---- "+" add menu ----
  async function pasteFiles() {
    try {
      const files = await api.clipboardFiles();
      const input = q('#file-input');
      if (!files?.length || !input) { note('No copied files on the clipboard'); return; }
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.data), c => c.charCodeAt(0))], f.name, { type: f.type || '' }));
      input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) { note(error.message); }
  }
  async function issueList(anchor) {
    closeMenu(false); // openMenu toggles off for the same anchor
    const m = openMenu(anchor, [], { label: 'Add an issue or pull request', head: 'Issue or pull request' }); if (!m) return;
    m.innerHTML = `<div class="nx-pop-head">Issue or pull request</div><input class="nx-search" type="search" placeholder="Search" aria-label="Search issues and pull requests" autocomplete="off"><div class="nx-list" role="menu"></div>`;
    const box = q('.nx-list', m), input = q('.nx-search', m); let all = [], reason = 'Loading…';
    const draw = () => {
      const t = input.value.trim().toLowerCase(), hit = all.filter(x => !t || `${x.number} ${x.title}`.toLowerCase().includes(t));
      box.replaceChildren();
      if (!hit.length) { box.append(Object.assign(document.createElement('div'), { className: 'nx-pop-empty', textContent: all.length ? 'No matches.' : reason })); place(); return; }
      for (const x of hit) box.append(row({ label: x.title, hint: `#${x.number}`, icon: x.kind === 'pr' ? I.pr : I.issue, run: () => insert(`#${x.number} ${x.title} ${x.url}`) }));
      place();
    };
    input.addEventListener('input', draw); draw(); input.focus();
    try {
      const [a, b] = await Promise.all([api.issues(), api.prs()]);
      Object.assign(data, { issues: a, prs: b });
      all = [...(a.items || []).map(x => ({ ...x, kind: 'issue' })), ...(b.items || []).map(x => ({ ...x, kind: 'pr' }))];
      reason = (!a.available && a.reason) || 'No open issues or pull requests.';
    } catch (error) { reason = error.message; }
    if (menu === m) draw();
  }
  const addMenu = anchor => openMenu(anchor, [
    { label: 'Add files or images', icon: I.image, run: () => q('#file-input')?.click() },
    { label: 'Paste copied files', icon: I.clipboard, run: pasteFiles },
    { label: 'Add an issue or pull request', icon: I.issue, keepOpen: true, run: () => issueList(anchor) },
    { sep: 1 },
    { label: 'Slash commands', icon: I.slash, run: () => insert('/') },
    { label: 'Mention a file', icon: I.at, run: () => insert('@') },
  ], { label: 'Add to prompt' });

  // ---- run options ----
  let background = false;
  const onSubmit = () => { if (background) form.backgroundSubmit = true; };
  form?.addEventListener('submit', onSubmit, true); undo.push(() => form?.removeEventListener('submit', onSubmit, true));
  const effortLabel = () => q('.model-effort')?.textContent.trim() || '';
  // open the real model panel, move its slider, close it again (same task, never painted)
  function stepEffort(d) {
    const btn = q('.model-button'); if (!btn) return;
    btn.click(); const s = q('input[type=range][aria-label="Reasoning effort"]');
    if (s) { s.value = String(Math.max(+s.min, Math.min(+s.max, +s.value + d))); s.dispatchEvent(new Event('input', { bubbles: true })); }
    if (btn.getAttribute('aria-expanded') === 'true') btn.click();
  }
  function runOptions(anchor) {
    const m = openMenu(anchor, [], { label: 'Run options', head: 'Run options' }); if (!m) return;
    const draw = () => {
      m.querySelectorAll('.nx-mi, .nx-eff').forEach(e => e.remove());
      const eff = effortLabel(), r = document.createElement('div'); r.className = 'nx-eff';
      r.innerHTML = `<span class="nx-mi-l">Reasoning effort</span>${eff ? `<button type="button" class="nx-ib" data-d="-1" aria-label="Less effort">${I.minus}</button><span class="nx-eff-v" aria-live="polite">${esc(eff)}</span><button type="button" class="nx-ib" data-d="1" aria-label="More effort">${I.plus}</button>` : '<span class="nx-mi-h">Not for this model</span>'}`;
      r.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { stepEffort(+b.dataset.d); draw(); m.querySelector(`[data-d="${b.dataset.d}"]`)?.focus(); } });
      m.append(r);
      m.append(row({ label: 'Run in background', icon: I.stop, check: background, keepOpen: true, hint: background ? '' : 'Off', run: () => { background = !background; draw(); m.querySelector('.nx-mi')?.focus(); } }));
      place();
    };
    draw();
  }

  // ---- run location chip ----
  const envChip = () => q('[data-nx="env"]');
  async function newWorktree() {
    try {
      const item = await api.worktreeCreate();
      const picker = q('.project-picker'); picker?.click();
      const want = item.name || item.path.split('/').pop(); let opt = null;
      for (let i = 0; i < 40 && !opt; i++) { // the picker loads its list asynchronously
        opt = [...document.querySelectorAll('.project-option')].find(o => o.textContent.includes(want));
        if (!opt) await new Promise(r => setTimeout(r, 50));
      }
      if (!opt) throw new Error('Worktree created but not found in the project list');
      opt.click(); document.querySelectorAll('.project-menu').forEach(e => e.matches('[open], :popover-open') && e.hidePopover?.());
      const l = envChip()?.querySelector('span'); if (l) l.textContent = 'Worktree';
      note(`Worktree ready on branch ${item.git?.branch || ''}`.trim());
    } catch (error) { note(error.message); }
  }
  const envMenu = anchor => {
    const wt = envChip()?.querySelector('span')?.textContent === 'Worktree';
    openMenu(anchor, [
      { label: 'Run on', sep: 0, disabled: true, hint: '' },
      { label: 'This folder', icon: I.folder, check: !wt, run: () => { const l = envChip()?.querySelector('span'); if (l) l.textContent = 'Local'; } },
      { label: 'New git worktree', icon: I.worktree, run: newWorktree },
      { label: 'Cloud', icon: I.cloud, disabled: true, hint: 'not available yet' },
    ], { label: 'Run on', head: 'Run on' });
    menu?.querySelector('.nx-mi[disabled]:first-of-type')?.remove();
  };

  // ---- footer account menu ----
  const footMenu = anchor => {
    const login = getLogin(), theme = getTheme();
    openMenu(anchor, [
      { label: 'Settings', icon: I.gear, run: () => { const b = document.createElement('button'); b.dataset.action = 'settings'; b.hidden = true; document.body.append(b); b.click(); b.remove(); } },
      ...(login ? [{ label: 'GitHub profile', icon: I.user, hint: login, run: () => api.openGithub(`https://github.com/${encodeURIComponent(login)}`).catch(e => note(e.message)) }] : []),
      { label: 'Theme: Dark', icon: '<span class="nx-i-pad"></span>', check: theme === 'dark', run: () => setTheme('dark') },
      { label: 'Theme: Light', icon: '<span class="nx-i-pad"></span>', check: theme === 'light', run: () => setTheme('light') },
      { sep: 1 },
      { label: 'Sign out', icon: I.exit, run: async () => { try { await api.logout(); note('Signed out'); window.dispatchEvent(new Event('suffice:signed-out')); } catch (e) { note(e.message); } } },
    ], { label: 'Account' });
    menu?.querySelector('.nx-mi[disabled]')?.classList.add('nx-mi-sub');
  };
  if (foot) { foot.setAttribute('role', 'button'); foot.tabIndex = 0; foot.setAttribute('aria-haspopup', 'menu'); foot.setAttribute('aria-label', 'Account menu'); }
  const onFootKey = e => { if ((e.key === 'Enter' || e.key === ' ') && !menu) { e.preventDefault(); footMenu(foot); } };
  foot?.addEventListener('keydown', onFootKey); undo.push(() => foot?.removeEventListener('keydown', onFootKey));

  // ---- delegated clicks (capture: replace the chrome's own handlers for these controls) ----
  const onClick = e => {
    const t = e.target.closest?.('[data-nx="tools"], [data-nx="env"], [data-action="attach"], .nx-foot');
    if (!t || (t.matches('[data-action="attach"]') && !t.closest('.composer'))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (t.matches('.nx-foot')) return footMenu(t);
    if (t.matches('[data-nx="env"]')) return envMenu(t);
    if (t.matches('[data-nx="tools"]')) return runOptions(t);
    addMenu(t);
  };
  document.addEventListener('click', onClick, true); undo.push(() => document.removeEventListener('click', onClick, true));
  const tools = q('[data-nx="tools"]'); tools?.setAttribute('aria-label', 'Run options'); tools?.setAttribute('aria-haspopup', 'menu');
  q('.composer [data-action="attach"]', form)?.setAttribute('aria-haspopup', 'menu');
  envChip()?.setAttribute('aria-haspopup', 'menu');

  // ---- mic: dictation through local whisper.cpp ----
  const send = q('.send-button', form), group = q('.send-group', form);
  let mic = null, stt = false, rec = null;
  async function toPcm(blob) {
    const ctx = new AudioContext(), buf = await ctx.decodeAudioData(await blob.arrayBuffer()); ctx.close();
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000), src = off.createBufferSource();
    src.buffer = buf; src.connect(off.destination); src.start();
    const f = (await off.startRendering()).getChannelData(0), out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) out[i] = Math.max(-1, Math.min(1, f[i])) * 32767;
    return out.buffer;
  }
  function setMic(state) { if (mic) { mic.dataset.state = state; mic.setAttribute('aria-label', state === 'rec' ? 'Stop dictation' : state === 'busy' ? 'Transcribing' : 'Dictate'); mic.setAttribute('aria-pressed', String(state === 'rec')); mic.innerHTML = state === 'rec' ? I.stop : state === 'busy' ? I.dots : I.mic; } }
  async function toggleMic() {
    if (rec) { rec.recorder.stop(); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { note('Microphone access was denied'); return; }
    const recorder = new MediaRecorder(stream), chunks = []; rec = { recorder };
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); rec = null; setMic('busy');
      try { const text = await api.transcribe(await toPcm(new Blob(chunks))); text ? insert(text) : note('No speech heard'); }
      catch (error) { note(error.message); } finally { setMic('idle'); sync(); }
    };
    recorder.start(); setMic('rec');
  }
  function sync() { if (!form || !send) return; const idle = !rec && mic?.dataset.state !== 'busy'; const show = stt && send.disabled && form.dataset.running !== 'true' && !prompt.value.trim(); form.classList.toggle('nx-mic-on', !!show || !idle); if (mic) mic.hidden = !(show || !idle); }
  if (api?.sttAvailable && send && group) {
    api.sttAvailable().then(ok => {
      stt = !!ok;
      if (!stt) { form.classList.add('nx-no-stt'); send.title = 'Type a prompt to send (offline dictation is not installed)'; return; }
      mic = document.createElement('button'); mic.type = 'button'; mic.className = 'button nx nx-mic'; mic.hidden = true; group.append(mic); setMic('idle');
      mic.addEventListener('click', toggleMic);
      const mo = new MutationObserver(sync); mo.observe(send, { attributes: true, attributeFilter: ['disabled'] });
      prompt.addEventListener('input', sync); sync();
      undo.push(() => { mo.disconnect(); prompt.removeEventListener('input', sync); rec?.recorder.stop(); mic.remove(); });
    }).catch(() => form.classList.add('nx-no-stt'));
  } else form?.classList.add('nx-no-stt');
  undo.push(() => form?.classList.remove('nx-mic-on', 'nx-no-stt'));

  return () => undo.forEach(f => f());
}
