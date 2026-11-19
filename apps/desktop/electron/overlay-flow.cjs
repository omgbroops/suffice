// What happens around the overlay window: trigger (double-tap Option / Option+Space), hold-to-speak or tap-to-type, send to the thread, ring on the answer.
// Everything with a side effect is injected so a test drives the whole flow with fakes.
const { createDoubleTap, startKeySource } = require('./hotkey.cjs');
const FALLBACK = 'Option+Space';
const HOLD_MS = 250;

function createOverlayFlow({ overlay, status, transcribe, run, getThread, addReminder, parseReminder, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, cursor }) {
  let client = null, meta = null, image = null, busy = false, mode = 'idle', holdTimer = null, holding = false, opening = null;
  const say = (cmd) => overlay.send(cmd);
  const close = () => { clearTimer(holdTimer); holdTimer = null; holding = false; mode = 'idle'; client = null; busy = false; overlay.close(); };

  async function open() {
    const point = cursor();
    if (status() === 'granted') { try { ({ image, capture: meta } = await overlay.grab(point)); } catch { image = meta = null; } } else image = meta = null;
    overlay.open(point); mode = 'ready';
    await say({ type: 'show', x: point.x - overlay.displayAt(point).bounds.x, y: point.y - overlay.displayAt(point).bounds.y });
    if (!image) await say({ type: 'notice', text: status() === 'granted' ? 'Could not capture the screen' : 'Screen access is off. Allow it in System Settings, Privacy.' });
  }
  const toggle = () => { if (overlay.isOpen()) return close(); return (opening ??= open().finally(() => { opening = null; })); };

  async function submit(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    const reminder = parseReminder(text, now());
    if (reminder) {
      const r = addReminder({ text: reminder.text, dueAt: reminder.dueAt, threadId: getThread() });
      return say({ type: 'reminder', text: `Reminder set for ${new Date(r.dueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}: ${r.text}` });
    }
    busy = true; mode = 'busy'; overlay.setTyping(false);
    client = 'overlay:' + now();
    await say({ type: 'thinking', text });
    const note = meta ? `\n\n[Screenshot of display ${meta.displayId}, ${meta.image.width}x${meta.image.height} px. If you use the point tool, x,y are pixels in this image and displayId is ${meta.displayId}.]` : '';
    try { await run({ prompt: text + note, image, threadId: getThread(), clientId: client }); } catch (e) { await say({ type: 'notice', text: e.message || 'Something went wrong' }); }
    busy = false; mode = 'ready'; client = null; await say({ type: 'done' });
  }

  // Overlay open: Option held = speak, Option tapped = type. Closed: the double-tap detector listens.
  const detector = createDoubleTap({ onFire: () => void toggle() });
  function onKey(key, state, t) {
    if (!overlay.isOpen()) return detector.feed(key, state, t);
    if (key !== 'option' || mode === 'typing' || mode === 'busy') return;
    if (state === 'down') { if (holdTimer || holding) return; holdTimer = setTimer(() => { holdTimer = null; holding = true; mode = 'listening'; void say({ type: 'listening', on: true }); }, HOLD_MS); return; }
    if (holdTimer) { clearTimer(holdTimer); holdTimer = null; mode = 'typing'; overlay.setTyping(true); void say({ type: 'typing' }); return; }
    if (holding) { holding = false; mode = 'ready'; void say({ type: 'listening', on: false }); }
  }

  return {
    toggle, onKey, submit, close,
    isBusy: () => busy,
    clientId: () => client,
    async audio(audio, mimeType) {
      try { const { text } = await transcribe({ audio, mimeType }); if (text.trim()) await submit(text); else await say({ type: 'notice', text: 'Heard nothing' }); }
      catch (e) { await say({ type: 'notice', text: e.message || 'Could not transcribe' }); }
    },
    // Harness events for the overlay's own run: stream text, ring on a point result.
    onHarnessEvent(message) {
      if (!client || message.clientId !== client) return;
      if (message.event === 'text') void say({ type: 'text', text: message.text });
      if (message.event === 'tool_end' && !message.isError) {
        const p = message.result?.structuredContent;
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && typeof p.label === 'string' && typeof p.displayId === 'string' && meta && p.displayId === meta.displayId) void overlay.ring({ x: p.x, y: p.y }, p.label);
      }
    },
    // Source of key events: the Swift helper, with Option+Space as the fallback when it cannot run (no Accessibility permission, no binary).
    startKeys({ spawn, command, globalShortcut, onFallback = () => {} }) {
      let fallback = false;
      const source = command ? startKeySource({ spawn, command, onKey, onFallback: (why) => { if (fallback) return; fallback = true; globalShortcut.register(FALLBACK, () => void toggle()); onFallback(why); } }) : { stop() {} };
      if (!command) { fallback = true; globalShortcut.register(FALLBACK, () => void toggle()); }
      return { stop() { source.stop(); if (fallback) globalShortcut.unregister(FALLBACK); close(); } };
    },
  };
}

module.exports = { createOverlayFlow, FALLBACK, HOLD_MS };
