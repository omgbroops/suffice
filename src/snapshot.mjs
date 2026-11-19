// Ref snapshots: an accessibility tree becomes '@e1 button Save [disabled]' lines; actions name a ref, not pixels.
// Clean-room; the ref idea follows Playwright MCP (Apache-2.0, github.com/microsoft/playwright-mcp), agent-browser and agent-desktop (Apache-2.0, github.com/vercel-labs).
const DECOR = new Set(['none', 'presentation', 'generic', 'InlineTextBox', 'LineBreak', 'separator', 'image-decorative', 'AXGroup', 'AXUnknown', 'AXSplitter']);
const norm = (r) => String(r ?? '').replace(/^AX/, '').replace(/^./, (c) => c.toLowerCase());
export const EXPIRED = 'ref expired, re-snapshot';

// Depth-first; decorative nodes without a name vanish and their children move up. shortcut: depth is not printed, upgrade if agents need nesting.
export function renderSnapshot(root, { maxChars = 4000, maxNodes = 300 } = {}) {
  const lines = []; const refs = new Map(); let used = 0; let cut = 0;
  const walk = (n) => {
    if (!n) return;
    const name = String(n.name ?? '').replace(/\s+/g, ' ').trim();
    const role = norm(n.role);
    if (!(DECOR.has(n.role) || DECOR.has(role)) || name) {
      if (!role || (!name && !(n.actions?.length) && !(n.states?.length) && n.value === undefined && /^(text|staticText|paragraph|group|list|listitem|row|cell)$/.test(role))) { /* empty container */ } else {
        const ref = `@e${refs.size + 1}`;
        const line = [ref, role, name.slice(0, 120), n.value !== undefined && n.value !== '' ? `value=${JSON.stringify(String(n.value).slice(0, 80))}` : '', n.states?.length ? `[${n.states.join(' ')}]` : ''].filter(Boolean).join(' ');
        if (refs.size >= maxNodes || used + line.length + 1 > maxChars) cut++; else { refs.set(ref, n); lines.push(line); used += line.length + 1; }
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  if (cut) lines.push(`… truncated, ${cut} more elements`);
  return { text: lines.join('\n'), refs, truncated: cut };
}

// Chrome DevTools Accessibility.getFullAXTree nodes -> tree. Ignored nodes promote their children.
export function fromCdp(nodes) {
  const by = new Map(nodes.map((n) => [n.nodeId, n]));
  const conv = (id) => {
    const n = by.get(id); if (!n) return [];
    const kids = (n.childIds ?? []).flatMap(conv);
    if (n.ignored) return kids;
    const states = (n.properties ?? []).filter((p) => ['disabled', 'checked', 'expanded', 'selected', 'focused', 'required', 'readonly'].includes(p.name) && p.value?.value && p.value.value !== 'false').map((p) => (p.value.value === true ? p.name : `${p.name}=${p.value.value}`));
    return [{ id: n.backendDOMNodeId, role: n.role?.value, name: n.name?.value ?? '', ...(n.value?.value !== undefined ? { value: n.value.value } : {}), states, actions: ['press'], children: kids }];
  };
  const out = nodes.length ? conv(nodes[0].nodeId) : [];
  return out.length === 1 ? out[0] : { role: 'RootWebArea', name: '', children: out };
}

// One control per surface. source.tree() -> tree; backend.{press,setValue,scroll,clickAt}(node,...) -> {ok}.
// Refs live for one snapshot; a newer snapshot expires the older step's refs.
export function createRefControl({ source, backend, opts }) {
  let step = 0; let cur = null;
  const snapshot = async () => { const r = renderSnapshot(await source.tree(), opts); cur = r; step++; return { step, text: r.text, refs: r.refs.size, truncated: r.truncated }; };
  // The screenshot comes back only when asked for or when the snapshot is empty.
  const observe = async ({ screenshot = false } = {}) => {
    const s = await snapshot();
    const shot = (screenshot || !s.refs) && source.screenshot ? await source.screenshot() : null;
    return { ...s, text: `snapshot ${s.step}\n${s.text}`, ...(shot ? { shot } : {}) };
  };
  const act = async ({ action, ref, text, dir, snapshot: at }) => {
    const node = cur && (at === undefined || at === step) ? cur.refs.get(ref) : null;
    if (!node) return { ok: false, reason: 'stale_ref', error: EXPIRED, text: '' };
    const b = node.bounds; const centre = b && [b.x + b.w / 2, b.y + b.h / 2];
    let r;
    try {
      if (action === 'click') r = backend.press ? await backend.press(node) : { ok: false };
      else if (action === 'type' || action === 'fill') r = await backend.setValue?.(node, String(text ?? ''));
      else if (action === 'scroll') r = await backend.scroll?.(node, dir ?? 'down');
      else return { ok: false, reason: 'invalid_arg', error: `unknown action ${action}`, text: '' };
      if (!r?.ok && action === 'click' && centre && backend.clickAt) r = await backend.clickAt(...centre); // fallback: moves the real pointer
    } catch (e) {
      const m = String(e?.message ?? e);
      return /no node|not find node|detached|could not find|not attached/i.test(m) ? { ok: false, reason: 'stale_ref', error: EXPIRED, text: '' } : { ok: false, reason: 'action_failed', error: m, text: '' };
    }
    return r?.ok ? { ok: true, text: `${action} ${ref}`, node: node.id } : { ok: false, reason: 'action_failed', error: r?.error ?? 'action failed', text: '' };
  };
  return { snapshot, observe, act, step: () => step };
}

// Electron webContents.debugger. No window, no pointer: the click runs as el.click() in the page.
export function cdpControl(dbg, opts) {
  const send = (m, p) => dbg.sendCommand(m, p);
  const call = async (node, fn, ...args) => {
    const { object } = await send('DOM.resolveNode', { backendNodeId: node.id });
    await send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn, arguments: args.map((value) => ({ value })) });
    return { ok: true };
  };
  return createRefControl({
    opts,
    source: { tree: async () => fromCdp((await send('Accessibility.getFullAXTree')).nodes), screenshot: async () => (await send('Page.captureScreenshot', { format: 'png' })).data },
    backend: {
      press: (n) => call(n, 'function(){this.click()}'),
      setValue: (n, t) => call(n, 'function(t){this.focus();this.value=t;this.dispatchEvent(new Event("input",{bubbles:true}));this.dispatchEvent(new Event("change",{bubbles:true}))}', t),
      scroll: (n, d) => call(n, 'function(d){this.scrollBy(0,d==="up"?-400:400)}', d),
    },
  });
}

// macOS: apps/desktop/native/ax-snapshot.swift, run by `exec(file, args) -> stdout`. Node ids are child-index paths.
export function nativeControl(exec, bin, opts) {
  const run = async (...a) => { try { return JSON.parse(await exec(bin, a)); } catch (e) { return { ok: false, error: String(e?.message ?? e) }; } };
  return createRefControl({
    opts,
    source: { tree: async () => (await run('snapshot')).tree ?? { children: [] }, screenshot: async () => (await run('screenshot')).path },
    backend: {
      press: (n) => run('press', n.id), setValue: (n, t) => run('set', n.id, t), scroll: (n, d) => run('scroll', n.id, d),
      clickAt: (x, y) => run('click', String(Math.round(x)), String(Math.round(y))),
    },
  });
}

export const tokensOfText = (s) => Math.ceil(String(s).length / 4);
export const tokensOfImage = (w, h) => Math.ceil((w * h) / 750); // Anthropic vision docs: tokens = width*height/750

// Flat elements the loop already holds (refs from the browser tool) -> the same line format, capped.
export function formatElements(els, { maxChars = 600 } = {}) {
  const out = []; let used = 0;
  for (const e of els) {
    const l = [e.ref, norm(e.role), String(e.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60), e.value !== undefined && e.value !== '' ? `value=${JSON.stringify(String(e.value).slice(0, 40))}` : ''].filter(Boolean).join(' ');
    if (used + l.length + 1 > maxChars) { out.push('… truncated'); break; }
    out.push(l); used += l.length + 1;
  }
  return out.join('\n');
}
