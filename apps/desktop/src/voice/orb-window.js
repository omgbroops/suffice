// The minimized voice view: its own small always-on-top window holding one orb and
// three round controls. It draws nothing of its own state; the main window relays the
// state and levels, and this window sends back control presses.
import './orb-window.css';
import { createOrb } from './orb.js';

const glyph = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const MIC = glyph('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>');
const MIC_OFF = glyph('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/>');
const END = glyph('<path d="m6 6 12 12M6 18 18 6"/>');
const GROW = glyph('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>');

export function mountOrbWindow(api = window.sufficeDesktop) {
  document.documentElement.classList.add('voice-orb-window');
  const root = document.querySelector('#app');
  const button = (action, label, html) => `<button type="button" class="orb-control" data-action="${action}" aria-label="${label}" title="${label}">${html}</button>`;
  root.innerHTML = `<canvas class="orb" aria-hidden="true"></canvas><div class="orb-controls" role="group" aria-label="Voice conversation">${button('mute', 'Mute microphone', MIC)}${button('end', 'End voice conversation', END)}${button('expand', 'Back to Suffice', GROW)}</div>`;
  const orb = createOrb(root.querySelector('.orb')), mute = root.querySelector('[data-action="mute"]');
  root.addEventListener('click', event => { const control = event.target.closest('[data-action]'); if (control) void api?.voiceRelay?.({ type: 'control', action: control.dataset.action }); });
  api?.onVoiceRelay?.(message => {
    if (message?.type === 'level') orb.setLevel(Math.max(message.mic || 0, message.agent || 0));
    else if (message?.type === 'state') {
      if (message.tones) orb.setPalette(message.tones);
      orb.setState(message.state === 'heard' ? 'hearing' : message.state);
      root.dataset.state = message.state;
      const label = message.muted ? 'Unmute microphone' : 'Mute microphone';
      mute.innerHTML = message.muted ? MIC_OFF : MIC; mute.setAttribute('aria-label', label); mute.title = label; mute.setAttribute('aria-pressed', String(!!message.muted));
    } else if (message?.type === 'ended') void api?.voiceWindow?.('close');
  });
  void api?.voiceRelay?.({ type: 'control', action: 'ready' });
}
