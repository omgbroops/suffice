// Floating ask bar: a small always-on-top window opened by a global shortcut, plus the screen-capture and permission rules.
// Tests set SUFFICE_TEST_SCREEN_STATUS (granted|denied|not-determined) and SUFFICE_TEST_SCREEN_IMAGE (a PNG path) so no real capture or macOS prompt happens.
const fs = require('node:fs');
const ACCELERATOR = 'Control+Alt+Space';
const WIDTH = 680, TOP_MIN = 48, MIN_HEIGHT = 96, MAX_HEIGHT = 600;
const SETTINGS_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
const alive = (w) => !!w && !w.isDestroyed?.();

function createAskBar({ BrowserWindow, screen, globalShortcut, desktopCapturer, systemPreferences, shell, preloadPath, entryPath, hidden = false, env = process.env, platform = process.platform }) {
  let bar = null, registered = false, capturing = false;
  let stub = env.SUFFICE_TEST_SCREEN_STATUS || null; // shortcut: test stub only; real runs read the OS status each time
  const status = () => stub || (platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted');
  const cursorDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  async function grab() {
    if (env.SUFFICE_TEST_SCREEN_IMAGE) return fs.readFileSync(env.SUFFICE_TEST_SCREEN_IMAGE).toString('base64');
    const d = cursorDisplay(), width = Math.min(1600, d.size.width), height = Math.round(width * d.size.height / d.size.width);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    const source = sources.find((s) => s.display_id === String(d.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error('Could not capture the screen');
    return source.thumbnail.toPNG().toString('base64');
  }

  const api = {
    accelerator: ACCELERATOR,
    status,
    isOpen: () => alive(bar),
    window: () => (alive(bar) ? bar : null),
    isRegistered: () => registered,
    // request=false only reports; request=true asks macOS (first time) or sends the person to System Settings (denied).
    async capture(request = false) {
      let s = status();
      if (s !== 'granted' && request) {
        capturing = true;
        try {
          if (s === 'not-determined') {
            if (stub) stub = 'granted'; else await grab().catch(() => null); // the capture attempt is what raises the system prompt
            s = status();
          } else await shell.openExternal(SETTINGS_PANE).catch(() => {});
        } finally { capturing = false; if (alive(bar) && !hidden) bar.focus(); }
      }
      if (s !== 'granted') return { status: s };
      return { status: 'granted', image: await grab() };
    },
    setEnabled(on) {
      if (on && !registered) registered = globalShortcut.register(ACCELERATOR, () => api.toggle());
      if (!on) { if (registered) globalShortcut.unregister(ACCELERATOR); registered = false; api.close(); }
      return registered;
    },
    toggle() { return alive(bar) ? api.close() : api.open(); },
    open() {
      if (alive(bar)) { if (!hidden) { bar.show(); bar.focus(); } return bar; }
      const a = cursorDisplay().workArea;
      bar = new BrowserWindow({
        width: WIDTH, height: MIN_HEIGHT, x: Math.round(a.x + (a.width - WIDTH) / 2), y: Math.round(a.y + Math.max(TOP_MIN, a.height * 0.16)),
        show: false, frame: false, transparent: true, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, resizable: false,
        fullscreenable: false, minimizable: false, maximizable: false, title: 'Suffice ask',
        webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      const w = bar;
      w.setContentProtection?.(true); // keeps the bar itself out of the screenshot it takes
      w.setAlwaysOnTop?.(true, 'floating');
      w.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      w.webContents.on('will-navigate', (e) => e.preventDefault());
      w.on('blur', () => { if (!hidden && !capturing && bar === w) api.close(); });
      w.on('closed', () => { if (bar === w) bar = null; });
      w.once('ready-to-show', () => { if (!hidden) { w.show(); w.focus(); } });
      void w.loadFile(entryPath, { hash: 'ask-bar' });
      return w;
    },
    resize(height) {
      if (!alive(bar) || !Number.isFinite(height)) return;
      bar.setSize(WIDTH, Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height))));
    },
    close() { const w = bar; bar = null; if (alive(w)) w.close(); },
  };
  return api;
}

module.exports = { createAskBar, ACCELERATOR };
