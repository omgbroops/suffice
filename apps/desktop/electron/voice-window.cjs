// Plumbing for the floating voice orb window and the voice-only IPC trust and relay rules.
const SIZE = { width: 200, height: 220 }, MARGIN = 24;
const RELAY_TYPES = ['state', 'caption', 'level', 'control', 'ended'];
const RELAY_MAX_BYTES = 8 * 1024;
const alive = (w) => !!w && !w.isDestroyed?.();
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function createVoiceWindow({ BrowserWindow, screen, preloadPath, entryPath, hidden = false, getMainWindow = () => null }) {
  let orb = null, saved = null;
  const area = () => {
    const main = getMainWindow();
    const b = alive(main) ? main.getBounds() : undefined;
    return (b ? screen.getDisplayMatching(b) : screen.getPrimaryDisplay()).workArea;
  };
  const place = () => {
    const a = area();
    const p = saved || { x: a.x + a.width - SIZE.width - MARGIN, y: a.y + a.height - SIZE.height - MARGIN };
    return { x: clamp(p.x, a.x, a.x + a.width - SIZE.width), y: clamp(p.y, a.y, a.y + a.height - SIZE.height) };
  };
  const api = {
    isOpen: () => alive(orb),
    window: () => (alive(orb) ? orb : null),
    open() {
      if (alive(orb)) return orb;
      orb = new BrowserWindow({
        ...SIZE, ...place(), show: false, frame: false, transparent: true, hasShadow: false, alwaysOnTop: true,
        skipTaskbar: true, resizable: false, fullscreenable: false, movable: true, title: 'Suffice voice',
        webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      const w = orb;
      w.setAlwaysOnTop?.(true, 'floating');
      w.webContents?.setWindowOpenHandler?.(() => ({ action: 'deny' }));
      w.webContents?.on?.('will-navigate', (e) => e.preventDefault());
      w.on('moved', () => { if (alive(w)) { const b = w.getBounds(); saved = { x: b.x, y: b.y }; } });
      w.on('closed', () => { if (orb === w) orb = null; });
      if (!hidden) w.showInactive();
      void w.loadFile(entryPath, { hash: 'voice-orb' });
      const main = getMainWindow();
      main?.once?.('closed', () => api.close());
      return w;
    },
    close() { const w = orb; orb = null; if (alive(w)) w.close(); },
  };
  return api;
}

// Who sent an IPC call: 'main', 'orb', or null. Compares against each window's own main frame only.
function createVoiceHub({ getMainWindow, voiceWindow }) {
  const isFrame = (w, frame) => alive(w) && !!frame && frame === w.webContents.mainFrame;
  return {
    senderOf(event, { allowVoiceWindow = false } = {}) {
      const frame = event?.senderFrame;
      if (isFrame(getMainWindow(), frame)) return 'main';
      if (allowVoiceWindow && isFrame(voiceWindow.window(), frame)) return 'orb';
      return null;
    },
    windowAction(who, action) {
      if (action === 'close') { voiceWindow.close(); return true; }
      if (action === 'open' && who === 'main') { voiceWindow.open(); return true; }
      throw new Error('Invalid voice window action');
    },
    relay(who, message) {
      if (!message || typeof message !== 'object' || Array.isArray(message) || Object.getPrototypeOf(message) !== Object.prototype) throw new Error('Invalid voice message');
      if (!RELAY_TYPES.includes(message.type)) throw new Error('Invalid voice message type');
      let json;
      try { json = JSON.stringify(message); } catch { throw new Error('Invalid voice message'); }
      if (Buffer.byteLength(json) >= RELAY_MAX_BYTES) throw new Error('Voice message is too large');
      const target = who === 'main' ? voiceWindow.window() : getMainWindow();
      if (alive(target)) target.webContents.send('suffice:voice-relay', JSON.parse(json));
      return true;
    },
  };
}

module.exports = { createVoiceWindow, createVoiceHub, RELAY_TYPES, RELAY_MAX_BYTES };
