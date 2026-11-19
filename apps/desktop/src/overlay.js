// The overlay page: a small pill at the cursor (listening / typing / reply) and a pulsing ring where the model pointed.
import './tokens.css';
import './overlay.css';
import { createMic } from './overlay-mic.js';

const MIC = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15"/></svg>';
// Damped spring sampled into a CSS linear() easing: overshoots, then settles.
export function springEasing(stiffness = 220, damping = 12, steps = 28, duration = 0.7) {
  const w = Math.sqrt(stiffness), z = damping / (2 * w), wd = w * Math.sqrt(1 - z * z), pts = [];
  for (let i = 0; i <= steps; i++) { const t = (i / steps) * duration; pts.push((1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t))).toFixed(3)); }
  return `linear(${pts.join(',')})`;
}
const SPRING = springEasing();

export function mountOverlay(api = window.sufficeDesktop?.overlay) {
  const root = document.getElementById('overlay');
  let pill, line, hint, field, input, anchor = { x: 40, y: 40 }, reply = '', mic = null;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  function place() {
    const w = pill.offsetWidth || 300, h = pill.offsetHeight || 60;
    pill.style.left = Math.max(8, Math.min(anchor.x + 18, innerWidth - w - 8)) + 'px';
    pill.style.top = Math.max(8, Math.min(anchor.y + 18, innerHeight - h - 8)) + 'px';
  }
  function build(x, y) {
    root.replaceChildren(); anchor = { x, y };
    pill = el('div', 'ov-card'); pill.dataset.mode = 'ready'; pill.setAttribute('role', 'status');
    const status = el('div', 'ov-status'); const glyph = el('span', 'ov-glyph'); glyph.innerHTML = MIC; glyph.setAttribute('aria-hidden', 'true');
    hint = el('span', 'ov-hint', 'Hold Option to speak, tap to type'); status.append(glyph, hint);
    line = el('div', 'ov-text'); line.hidden = true;
    field = el('div', 'ov-field'); field.hidden = true; input = el('input'); input.placeholder = 'Ask about your screen'; input.setAttribute('aria-label', 'Ask about your screen'); field.append(input);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); api.close(); }
      if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); const text = input.value; input.value = ''; field.hidden = true; api.submit(text); }
    });
    pill.append(status, line, field); root.append(pill); place();
  }
  const setMode = (mode, text) => { pill.dataset.mode = mode; if (text !== undefined) hint.textContent = text; place(); };
  const show = (text, cls = '') => { line.hidden = !text; line.className = 'ov-text ' + cls; line.textContent = text; place(); };

  function ring(x, y, label) {
    const r = el('div', 'ov-mark'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.dataset.role = 'ring';
    const l = el('div', 'ov-mark-label', label); l.dataset.role = 'ring-label'; root.append(r, l);
    const place = () => { l.style.left = Math.min(x + 40, innerWidth - l.offsetWidth - 8) + 'px'; l.style.top = Math.max(8, y - 12) + 'px'; };
    place();
    const spring = { duration: 700, easing: SPRING, fill: 'forwards' };
    r.animate([{ transform: 'scale(2.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], spring);
    l.animate([{ transform: 'translateX(-8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], spring);
    // Two echoes pulse outward after the landing, then the ring rests until the next answer.
    for (const delay of [500, 900]) r.animate([{ boxShadow: '0 0 0 0 color-mix(in srgb, var(--text-strong) 40%, transparent)' }, { boxShadow: '0 0 0 22px transparent' }], { duration: 900, delay, easing: 'cubic-bezier(.23,1,.32,1)' });
    setTimeout(() => { for (const n of [r, l]) n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => n.remove()); }, 7000);
    root.dataset.ring = `${x},${y}`;
  }

  mic = createMic({ getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c), Recorder: MediaRecorder, onAudio: (buf, type) => api.audio(buf, type), onError: () => show('Microphone is not available', 'ov-notice') });
  api.onCommand((c) => {
    if (c.type === 'show') { build(c.x, c.y); reply = ''; }
    else if (!pill) return;
    else if (c.type === 'listening') { if (c.on) { setMode('listening', 'Listening'); mic.start(); } else { setMode('ready', 'Hold Option to speak, tap to type'); mic.stop(); } }
    else if (c.type === 'typing') { field.hidden = false; setMode('typing', 'Enter to send, Esc to close'); place(); input.focus(); }
    else if (c.type === 'thinking') { reply = ''; field.hidden = true; setMode('busy', c.text.slice(0, 80)); show(''); }
    else if (c.type === 'text') { reply += c.text; show(reply); }
    else if (c.type === 'notice' || c.type === 'reminder') { show(c.text, 'ov-notice'); }
    else if (c.type === 'done') setMode('ready', 'Hold Option to speak, tap to type');
    else if (c.type === 'ring') ring(c.x, c.y, c.label);
  });
  return { springEasing };
}
if (window.sufficeDesktop?.overlay) mountOverlay();
