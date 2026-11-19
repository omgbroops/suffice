import { writeFileSync } from 'node:fs';
import { cdpControl, nativeControl } from './snapshot.mjs';

// Browser-tool shaped adapter (same methods the computer loop calls) over a ref control; lines use the loop's `[ref=eN]` form.
// wc: Electron webContents (loadURL, getURL, debugger). Domain policy is the caller's (will-navigate on wc).
export function cdpBrowser(wc, opts) {
  const dbg = wc.debugger; const control = cdpControl(dbg, opts);
  const send = (m, p) => dbg.sendCommand(m, p);
  const wrap = (f) => async (...a) => { try { return await f(...a); } catch (e) { return { ok: false, reason: 'error', error: String(e?.message ?? e) }; } };
  const key = { Enter: [13, '\r'], Tab: [9, ''], Escape: [27, ''], PageDown: [34, ''], PageUp: [33, ''] };
  const res = (r) => (r.ok ? { ok: true, text: r.text } : r);
  return {
    open: wrap(async (_id, url) => { await wc.loadURL(url); /* attach needs a loaded target */ if (!dbg.isAttached()) { dbg.attach('1.3'); await send('Accessibility.enable'); } return { ok: true, text: url }; }),
    snapshot: wrap(async () => {
      const o = await control.observe();
      const lines = o.text.split('\n').slice(1).map((l) => { const m = /^@(e\d+) (\S+)(?: (.*?))?( \[[^\]]*\])?$/.exec(l); return m ? `- ${m[2]} "${m[3] ?? ''}"${m[4] ?? ''} [ref=${m[1]}]` : l; });
      return { ok: true, text: lines.join('\n') };
    }),
    get: wrap(async (_id, what) => (what === 'url' ? { ok: true, text: wc.getURL() } : { ok: false, reason: 'invalid_arg', error: `get ${what}` })),
    screenshot: wrap(async (_id, path) => { writeFileSync(path, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); return { ok: true, text: path }; }),
    click: wrap(async (_id, ref) => res(await control.act({ action: 'click', ref }))),
    fill: wrap(async (_id, ref, text) => res(await control.act({ action: 'fill', ref, text }))),
    type: wrap(async (_id, text) => { await send('Input.insertText', { text: String(text) }); return { ok: true }; }),
    press: wrap(async (_id, k) => {
      if (k === 'PageDown' || k === 'PageUp') { await send('Runtime.evaluate', { expression: `scrollBy(0,${k === 'PageUp' ? -600 : 600})` }); return { ok: true }; }
      const [code, text] = key[k] ?? [0, k.length === 1 ? k : ''];
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, windowsVirtualKeyCode: code, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: code });
      return { ok: true };
    }),
    wait: wrap(async (_id, { ms = 500 } = {}) => { await new Promise((f) => setTimeout(f, Math.min(ms, 5000))); return { ok: true }; }),
    close: wrap(async () => { if (wc.debugger.isAttached()) wc.debugger.detach(); return { ok: true }; }),
  };
}

// Desktop-tool shaped adapter (what the loop's surface:'desktop' calls) over ax-snapshot via nativeControl. exec(file,args)->stdout.
export function nativeDesktop(exec, bin, opts) {
  const control = nativeControl(exec, bin, opts);
  const wrap = (f) => async (...a) => { try { return await f(...a); } catch (e) { return { ok: false, reason: 'error', error: String(e?.message ?? e) }; } };
  const res = (r) => (r.ok ? { ok: true, text: r.text } : r);
  return {
    snapshot: wrap(async () => {
      const o = await control.observe();
      const children = o.text.split('\n').slice(1).map((l) => /^(@e\d+) (\S+)(?: (.*?))?( \[[^\]]*\])?$/.exec(l)).filter(Boolean)
        .map((m) => ({ ref: m[1], role: m[2], name: m[3] ?? '', states: (m[4] ?? '').replace(/[[\],]/g, ' ').trim().split(/\s+/).filter(Boolean) }));
      return { ok: true, data: { snapshot_id: o.step, tree: { children } } };
    }),
    screenshot: wrap(async () => { const p = (await control.observe({ screenshot: true })).shot; return p ? { ok: true, text: p } : { ok: false, reason: 'error', error: 'no screenshot' }; }),
    click: wrap(async (_id, ref) => res(await control.act({ action: 'click', ref }))),
    type: wrap(async (_id, ref, text) => res(await control.act({ action: 'type', ref, text }))),
    scroll: wrap(async (_id, ref, dir) => res(await control.act({ action: 'scroll', ref, dir }))),
  };
}
