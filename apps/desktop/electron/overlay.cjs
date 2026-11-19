// Cursor overlay window: transparent, click-through, covers the display under the cursor, never takes focus until the person chooses to type.
// Tests set SUFFICE_TEST_SCREEN_IMAGE (a PNG path) so no real capture happens.
const fs = require('node:fs');
const { imageSizeFor, toScreenPoint } = require('./coords.cjs');
const alive = (w) => !!w && !w.isDestroyed?.();
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

function createOverlay({ BrowserWindow, screen, desktopCapturer, preloadPath, entryPath, hidden = false, env = process.env }) {
  let win = null, ready = null, queue = [], capture = null, bounds = null;
  const api = {
    window: () => (alive(win) ? win : null),
    isOpen: () => alive(win),
    lastCapture: () => capture,
    displayAt: (point) => screen.getDisplayNearestPoint(point),
    // Screenshot of the display under the point, sized by imageSizeFor. Returns { image: base64 png, capture: meta }.
    async grab(point) {
      const d = screen.getDisplayNearestPoint(point), want = imageSizeFor(d.bounds);
      let b64, got = want;
      if (env.SUFFICE_TEST_SCREEN_IMAGE) { const buf = fs.readFileSync(env.SUFFICE_TEST_SCREEN_IMAGE); b64 = buf.toString('base64'); got = pngSize(buf); }
      else {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: want });
        const s = sources.find((x) => x.display_id === String(d.id)) || sources[0];
        if (!s || s.thumbnail.isEmpty()) throw new Error('Could not capture the screen');
        got = s.thumbnail.getSize(); b64 = s.thumbnail.toPNG().toString('base64');
      }
      capture = { displayId: String(d.id), bounds: { ...d.bounds }, image: got };
      return { image: b64, capture };
    },
    open(point) {
      if (alive(win)) return win;
      const d = screen.getDisplayNearestPoint(point); bounds = d.bounds; queue = [];
      win = new BrowserWindow({
        ...bounds, show: false, frame: false, transparent: true, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, resizable: false,
        focusable: false, fullscreenable: false, minimizable: false, maximizable: false, title: 'Suffice overlay',
        webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      const w = win;
      w.setAlwaysOnTop?.(true, 'screen-saver');
      w.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      w.setIgnoreMouseEvents(true, { forward: true });
      w.setContentProtection?.(true); // the overlay never appears in its own screenshot
      w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      w.webContents.on('will-navigate', (e) => e.preventDefault());
      w.on('closed', () => { if (win === w) { win = null; ready = null; } });
      ready = new Promise((resolve) => w.webContents.once('did-finish-load', resolve));
      void w.loadFile(entryPath).then(() => { if (!hidden) w.showInactive(); });
      return w;
    },
    // Commands go to the overlay page once it has loaded: { type: 'show'|'listening'|'typing'|'text'|'notice'|'ring'|'reminder'|'done', ... }.
    async send(cmd) {
      const w = win; if (!alive(w)) return false;
      await ready; if (!alive(w) || w !== win) return false;
      w.webContents.send('suffice:overlay-cmd', cmd); return true;
    },
    // Typing needs the keyboard, so the window takes mouse + focus only for that.
    setTyping(on) {
      if (!alive(win)) return;
      win.setFocusable(on); win.setIgnoreMouseEvents(!on, { forward: true });
      if (on && !hidden) win.focus();
    },
    // Ring at a point given in screenshot pixels; returns the screen point used (or null when the point is off the image).
    async ring(point, label, meta = capture) {
      if (!meta) return null;
      const screenPoint = toScreenPoint(point, meta);
      if (!screenPoint) return null;
      const origin = alive(win) ? bounds : meta.bounds;
      await api.send({ type: 'ring', x: screenPoint.x - origin.x, y: screenPoint.y - origin.y, label: String(label || '').slice(0, 60), screen: screenPoint });
      return screenPoint;
    },
    close() { const w = win; win = null; ready = null; if (alive(w)) w.close(); },
  };
  return api;
}

module.exports = { createOverlay };
