// Voice conversation view, modelled on how Codex presents voice: a slim strip directly
// above the composer (one status word, two small level meters, mute and stop on the
// right), while everything said lands in the thread as ordinary messages. The composer
// stays a normal text box; typing supersedes the spoken answer. All behaviour lives in
// conversation.js; this file only draws.
import './voice.css';
import { threadViewState } from '../thread-view-state.js';
import { createVoiceConversation } from './conversation.js';
import { createOrb } from './orb.js';
import { icon } from '../ui.js';

const glyph = paths => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const MIC = glyph('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>');
const MIC_OFF = glyph('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/>');
const SHRINK = glyph('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>');
const GROW = glyph('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>');
const BARS = 6;

// Dev and test switches: a URL parameter wins over a saved value.
function setting(name, fallback) {
  const key = 'suffice-' + name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  try { return new URLSearchParams(location.search).get(name) || localStorage.getItem(key) || fallback; } catch { return fallback; }
}
const plain = text => String(text || '').replace(/[`*_#>]+/g, '').replace(/\s+/g, ' ').trim();

// The orb takes its three tones from the wallpaper in use, so it belongs to any background.
function wallpaperTones() {
  try {
    const source = document.querySelector('canvas.atmosphere');
    if (!source || !source.width || source.hidden) return null;
    const probe = document.createElement('canvas'); probe.width = probe.height = 24;
    const context = probe.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, 24, 24);
    const data = context.getImageData(0, 0, 24, 24).data, pixels = [];
    for (let i = 0; i < data.length; i += 4) pixels.push([data[i], data[i + 1], data[i + 2]]);
    pixels.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
    const at = q => pixels[Math.floor(q * (pixels.length - 1))], bright = at(0.97);
    return { top: at(0.25), base: at(0.6), cloud: bright.map(v => Math.round(v + (255 - v) * 0.35)) };
  } catch { return null; }
}

export function connectVoice({ form, prompt, toast = () => {}, api = window.sufficeDesktop }) {
  if (!form || !prompt) return null;
  const el = (tag, className, attrs = {}) => { const node = document.createElement(tag); node.className = className; for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };

  const startButton = el('button', 'button button--ghost voice-start', { type: 'button', 'aria-label': 'Start voice conversation', title: 'Start voice conversation', 'aria-pressed': 'false' });
  startButton.innerHTML = MIC;
  form.querySelector('.send-group')?.before(startButton);

  const strip = el('div', 'voice-strip', { role: 'group', 'aria-label': 'Voice conversation' }); strip.hidden = true;
  const left = el('div', 'voice-strip-status'), right = el('div', 'voice-strip-controls');
  const orbCanvas = el('canvas', 'voice-orb', { 'aria-hidden': 'true' });
  const word = el('span', 'voice-word', { role: 'status', 'aria-live': 'polite' });
  const meter = (source, label) => {
    const node = el('span', 'voice-meter', { 'data-source': source, 'aria-hidden': 'true' }), name = el('span', 'voice-meter-label');
    name.textContent = label; node.append(name);
    for (let i = 0; i < BARS; i++) node.append(el('i', 'voice-bar'));
    return node;
  };
  const micMeter = meter('mic', 'mic'), agentMeter = meter('agent', 'suffice');
  left.append(orbCanvas, word, micMeter, agentMeter);
  const mute = el('button', 'voice-control voice-mute', { type: 'button', 'aria-pressed': 'false' }); mute.textContent = 'Mute';
  const fullButton = el('button', 'voice-control voice-expand', { type: 'button' }); fullButton.textContent = 'Full';
  const stopButton = el('button', 'voice-control voice-stop', { type: 'button' }); stopButton.textContent = 'Stop';
  right.append(mute, fullButton, stopButton);
  strip.append(left, right);
  form.before(strip);

  // Full voice: a call view over the workspace. One calm orb, one word, three round
  // controls. The thread keeps filling in behind it.
  const workspace = form.closest('.workspace');
  const full = el('div', 'voice-full', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Voice conversation' }); full.hidden = true;
  const fullCanvas = el('canvas', 'voice-orb', { 'aria-hidden': 'true' }), fullWord = el('div', 'voice-word', { role: 'status', 'aria-live': 'polite' });
  const round = (className, label, html) => { const node = el('button', `voice-round ${className}`, { type: 'button', 'aria-label': label, title: label }); node.innerHTML = html; return node; };
  const fullMute = round('voice-full-mute', 'Mute microphone', MIC), fullEnd = round('voice-full-end', 'End voice conversation', icon('close')), fullMini = round('voice-full-mini', 'Minimize to a floating orb', SHRINK);
  const fullControls = el('div', 'voice-full-controls'); fullControls.append(fullMute, fullEnd, fullMini);
  full.append(fullCanvas, fullWord, fullControls);
  workspace?.append(full);
  const fullOrb = createOrb(fullCanvas, { palette: wallpaperTones() || undefined });
  let mode = 'inline', tones = wallpaperTones();
  function setMode(next) {
    const was = mode; mode = next;
    full.hidden = next !== 'full';
    if (conversation) form.dataset.voice = next;
    if (next === 'full') fullMute.focus({ preventScroll: true });
    // Only a change into or out of the floating orb touches its window; Escape repeats stay renderer-only.
    if (next === 'mini') { void api?.voiceWindow?.('open'); relay(); } else if (was === 'mini') void api?.voiceWindow?.('close');
  }
  // The floating orb lives in its own small window; it only mirrors state and sends back control presses.
  function relay(extra) {
    if (mode !== 'mini' || !conversation) return;
    void api?.voiceRelay?.(extra || { type: 'state', state: strip.dataset.state || 'connecting', muted: !!conversation.muted, tones });
  }
  api?.onVoiceRelay?.(message => {
    if (message?.type !== 'control' || !conversation) return;
    // The orb window asks for the current state once it has loaded.
    if (message.action === 'ready') { relay(); return; }
    if (message.action === 'mute') toggleMute(); else if (message.action === 'end') stop(); else if (message.action === 'expand') setMode('full');
  });

  const orb = createOrb(orbCanvas, { palette: wallpaperTones() || undefined });
  const retone = () => setTimeout(() => { const next = wallpaperTones(); if (next) { tones = next; orb.setPalette(next); fullOrb.setPalette(next); relay(); } }, 600);
  for (const name of ['suffice-wallpaper', 'suffice-preference', 'suffice-theme-change']) document.addEventListener(name, retone);

  const history = () => { const workspace = form.closest('.workspace'); return workspace?.classList.contains('thread-view') ? workspace.querySelector('.thread-transcript .thread-messages') : null; };
  const levels = { mic: Array(BARS).fill(0), agent: Array(BARS).fill(0) };
  let conversation = null, liveReply = null, spokenUser = null;

  function drawMeter(node, values) {
    const bars = node.querySelectorAll('.voice-bar');
    values.forEach((value, i) => { bars[i].style.transform = `scaleY(${(0.14 + 0.86 * value).toFixed(3)})`; bars[i].dataset.on = String(value > 0.02); });
  }
  // Everything said becomes an ordinary message in the thread: no voice bubbles, no partial echo of the user.
  function addMessage(role, text) {
    const list = history(); if (!list) return null;
    const node = el('article', `thread-message thread-${role}`, { 'data-voice': 'true' });
    if (role === 'assistant') { const p = document.createElement('p'); p.textContent = text; node.append(p); } else node.textContent = text;
    list.append(node); return node;
  }

  function onEvent(event) {
    if (event.type === 'state') {
      const state = event.state === 'interrupted' ? 'heard' : event.state;
      strip.dataset.state = state; form.dataset.voiceState = state;
      word.textContent = state === 'error' || state === 'ended' ? '' : state;
      orb.setState(state === 'heard' ? 'hearing' : state); fullOrb.setState(state === 'heard' ? 'hearing' : state);
      fullWord.textContent = word.textContent; full.dataset.state = state; relay();
      if (state === 'muted') { levels.mic.fill(0); drawMeter(micMeter, levels.mic); }
    } else if (event.type === 'level') {
      levels.mic.push(conversation?.muted ? 0 : event.mic || 0); levels.mic.shift(); levels.agent.push(event.agent || 0); levels.agent.shift();
      drawMeter(micMeter, levels.mic); drawMeter(agentMeter, levels.agent);
      const loud = Math.max(event.mic || 0, event.agent || 0); orb.setLevel(loud); fullOrb.setLevel(loud);
      relay({ type: 'level', mic: event.mic || 0, agent: event.agent || 0 });
    } else if (event.type === 'transcript') {
      const text = plain(event.text); if (!text) return;
      if (event.role === 'user') { if (event.final) spokenUser = addMessage('user', text); return; }
      if (!liveReply || !liveReply.isConnected) liveReply = addMessage('assistant', text); else liveReply.firstElementChild.textContent = text;
      if (event.final) liveReply = null;
    } else if (event.type === 'delegated') {
      // The request is now a real message in the thread, so the spoken copy is dropped.
      if (event.mode === 'start') { spokenUser?.remove(); spokenUser = null; }
    } else if (event.type === 'error') toast(event.message);
    // Notices such as "Voice conversation started." are not shown: the strip already says so.
    else if (event.type === 'ended') close();
  }

  function close() {
    conversation = null; liveReply = null; spokenUser = null;
    strip.hidden = true; delete strip.dataset.state; delete form.dataset.voiceState; delete form.dataset.voice;
    startButton.setAttribute('aria-pressed', 'false'); startButton.setAttribute('aria-label', 'Start voice conversation'); startButton.title = 'Start voice conversation';
    mute.setAttribute('aria-pressed', 'false'); mute.textContent = 'Mute';
    orb.setState('idle'); fullOrb.setState('idle'); full.hidden = true; mode = 'inline'; void api?.voiceWindow?.('close');
    fullMute.innerHTML = MIC; fullMute.setAttribute('aria-label', 'Mute microphone'); fullMute.title = 'Mute microphone';
    delete window.__sufficeVoice;
  }
  const canStart = () => form.modelsDisabled ? { ok: false, reason: 'Enable a model in Settings, Models, first.' } : form.dataset.requireProject === 'true' ? { ok: false, reason: 'Choose a project above the composer first.' } : { ok: true };
  async function start() {
    if (conversation) return;
    const kind = setting('voiceProvider', 'openai-realtime');
    let deviceId; try { deviceId = localStorage.getItem('suffice-voice-device') || undefined; } catch {}
    const current = conversation = createVoiceConversation({
      kind, onEvent,
      providerDeps: { deviceId, autoplay: setting('voiceAutoplay', 'true') !== 'false', speed: Number(setting('voiceSpeed', '1')) || 1 },
      app: {
        canStart,
        // Work goes through the same path as typing, so the transcript, tool rows and approvals behave as usual.
        // The check repeats here: a provider can be removed after the call began, and the run would be rejected with no one told.
        submit: text => { const check = canStart(); if (!check.ok) { addMessage('assistant', check.reason); toast(check.reason); throw new Error(check.reason); } prompt.value = text; prompt.dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit(); },
        steer: async text => { prompt.value = text; prompt.dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit(); },
        abort: () => api?.abort?.(threadViewState.id),
        isRunning: () => form.dataset.running === 'true',
        onHarnessEvent: callback => api?.onEvent?.(callback) || (() => {}),
        lastReply: () => [...document.querySelectorAll('.thread-messages .thread-assistant:not([data-voice])')].at(-1)?.textContent?.trim() || '',
      },
    });
    strip.hidden = false; form.dataset.voice = 'on';
    startButton.setAttribute('aria-pressed', 'true'); startButton.setAttribute('aria-label', 'Stop voice conversation'); startButton.title = 'Stop voice conversation';
    // Test and demo hook; only present with the offline provider.
    if (kind === 'fake') window.__sufficeVoice = { conversation: current, emit: event => current.emit?.(event), orb };
    try { await current.start(); } catch (error) { toast(error?.message || 'Voice could not start.'); if (conversation === current) close(); }
  }
  function stop() { const current = conversation; if (!current) return; Promise.resolve(current.stop()).catch(() => {}).finally(() => { if (conversation === current) close(); }); }
  function toggleMute() {
    if (!conversation) return;
    conversation.toggleMute();
    mute.setAttribute('aria-pressed', String(conversation.muted)); mute.textContent = conversation.muted ? 'Unmute' : 'Mute';
    const label = conversation.muted ? 'Unmute microphone' : 'Mute microphone';
    fullMute.innerHTML = conversation.muted ? MIC_OFF : MIC; fullMute.setAttribute('aria-label', label); fullMute.title = label; fullMute.setAttribute('aria-pressed', String(conversation.muted));
    relay();
  }

  startButton.addEventListener('click', () => (conversation ? stop() : void start()));
  stopButton.addEventListener('click', stop); fullEnd.addEventListener('click', stop);
  fullButton.addEventListener('click', () => setMode('full')); fullMute.addEventListener('click', toggleMute); fullMini.addEventListener('click', () => setMode('mini'));
  // Focus cycle for the open call view: its buttons, then any toast buttons (the toast sits outside the view).
  const trapTab = event => {
    const items = [...full.querySelectorAll('button:not([disabled])'), ...document.querySelectorAll('.toast button:not([disabled])')], i = items.indexOf(document.activeElement);
    event.preventDefault(); items.at(i < 0 ? (event.shiftKey ? -1 : 0) : (i + (event.shiftKey ? -1 : 1)) % items.length).focus({ preventScroll: true });
  };
  full.addEventListener('keydown', event => {
    if (event.key === 'Tab') trapTab(event);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMode('inline'); prompt.focus({ preventScroll: true }); }
  });
  // Tab from outside (focus already left) and clicks outside both return to the inline strip; the call continues.
  document.addEventListener('keydown', event => { if (event.key !== 'Tab' || mode !== 'full' || full.contains(document.activeElement)) return; if (document.activeElement?.closest?.('.toast')) return trapTab(event); event.preventDefault(); fullMute.focus({ preventScroll: true }); }, true);
  document.addEventListener('pointerdown', event => { if (mode === 'full' && !full.contains(event.target) && !event.target.closest?.('.toast')) setMode('inline'); }, true);
  mute.addEventListener('click', toggleMute);
  // Typing supersedes the spoken answer; the conversation itself continues.
  prompt.addEventListener('input', event => { if (conversation && event.isTrusted) conversation.notifyTyped(); });
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === 'm') { event.preventDefault(); if (conversation) stop(); else void start(); }
    else if (key === 'u' && conversation) { event.preventDefault(); toggleMute(); }
  }, true);

  return { start, stop, toggle: () => (conversation ? stop() : void start()), full: async () => { if (!conversation) await start(); if (conversation) setMode('full'); }, minimize: async () => { if (!conversation) await start(); if (conversation) setMode('mini'); }, get active() { return !!conversation; }, get mode() { return mode; } };
}
