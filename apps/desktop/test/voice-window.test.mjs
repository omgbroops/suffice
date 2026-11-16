import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { createVoiceWindow } = createRequire(import.meta.url)('../electron/voice-window.cjs');

function fake() {
  const made = [];
  class BW {
    constructor(o) { this.o = o; this.shown = 0; this.destroyed = false; this.h = {}; this.bounds = { x: o.x, y: o.y, ...{ width: o.width, height: o.height } }; made.push(this); this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    on(e, f) { this.h[e] = f; } once(e, f) { this.h[e] = f; }
    showInactive() { this.shown++; } show() { this.shown++; }
    setAlwaysOnTop(v, l) { this.top = [v, l]; } loadFile(p, o) { this.loaded = [p, o]; return Promise.resolve(); }
    isDestroyed() { return this.destroyed; } getBounds() { return this.bounds; }
    close() { this.destroyed = true; this.h.closed?.(); }
  }
  const main = new BW({ x: 0, y: 0, width: 1440, height: 900 });
  main.bounds = { x: 0, y: 0, width: 1440, height: 900 };
  made.length = 0;
  const screen = { getDisplayMatching: () => ({ workArea: { x: 0, y: 25, width: 1920, height: 1055 } }), getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } }) };
  return { made, main, screen, BW };
}
const mk = (f, hidden = false) => createVoiceWindow({ BrowserWindow: f.BW, screen: f.screen, preloadPath: '/p/preload.cjs', entryPath: '/d/index.html', hidden, getMainWindow: () => f.main });

test('window options, position, load hash', () => {
  const f = fake(); const v = mk(f); v.open();
  const o = f.made[0].o;
  assert.deepEqual([o.width, o.height], [200, 220]);
  assert.deepEqual([o.x, o.y], [1920 - 200 - 24, 25 + 1055 - 220 - 24]);
  for (const [k, val] of Object.entries({ frame: false, transparent: true, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, fullscreenable: false, movable: true, show: false })) assert.equal(o[k], val, k);
  assert.deepEqual(o.webPreferences, { preload: '/p/preload.cjs', contextIsolation: true, nodeIntegration: false, sandbox: true });
  assert.deepEqual(f.made[0].top, [true, 'floating']);
  assert.deepEqual(f.made[0].loaded, ['/d/index.html', { hash: 'voice-orb' }]);
  assert.equal(f.made[0].shown, 1);
});
test('hidden mode never shows', () => {
  const f = fake(); mk(f, true).open(); assert.equal(f.made[0].shown, 0);
});
test('single instance, reopen after close', () => {
  const f = fake(); const v = mk(f);
  const a = v.open(); assert.equal(v.open(), a); assert.equal(f.made.length, 1); assert.ok(v.isOpen());
  v.close(); assert.ok(!v.isOpen()); assert.equal(v.window(), null);
  v.open(); assert.equal(f.made.length, 2);
});
test('remembered position is clamped on screen', () => {
  const f = fake(); const v = mk(f);
  const w = v.open(); w.bounds = { x: 500, y: 300, width: 200, height: 220 }; w.h.moved();
  v.close(); v.open(); assert.deepEqual([f.made[1].o.x, f.made[1].o.y], [500, 300]);
  const w2 = v.window(); w2.bounds = { x: 5000, y: -400, width: 200, height: 220 }; w2.h.moved();
  v.close(); v.open(); assert.deepEqual([f.made[2].o.x, f.made[2].o.y], [1720, 25]);
});
test('closing the main window closes the orb', () => {
  const f = fake(); const v = mk(f); v.open();
  f.main.h.closed(); assert.ok(!v.isOpen()); assert.ok(f.made[0].destroyed);
});
