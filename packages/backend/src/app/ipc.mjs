// Transport-neutral IPC bridge: handle(message) -> {ok,result}|{ok:false,error}; pushes go to the sender given to subscribe().
//
// Registration points (not edited here; apps/desktop belongs to another change):
//  1. apps/desktop/electron/worker.mjs:26 receive({id,action,payload}) throws 'Unknown harness action' at :59 for anything
//     but 'run'. Add before :59: if (/^(flow|slots)\./.test(action)) return bridge.handle({type: action, ...payload});
//     and bridge.subscribe((m) => send({event: 'slot', ...m})) next to the createThreadRouter wiring at :111-114.
//  2. apps/desktop/electron/thread-router.mjs:27 dispatcher: its else-if chain (:30-55) ends in
//     'Unknown harness action' at :55; a flow.*/slots.* branch goes before it, replying through :57-58.
// Not checked: preload.cjs, so whether the renderer can call these is unverified.
const str = (v) => typeof v === 'string' && v.length > 0;
const bad = (m) => { throw new TypeError(m); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createIpcBridge(backend) {
  const reader = backend.reader();
  let send = () => {};
  const subs = new Map(); // selector -> unsubscribe

  const ops = {
    'flow.start': (m) => {
      if (!str(m.workflow)) bad('workflow: expected a non-empty string');
      if (m.args !== undefined && (m.args === null || typeof m.args !== 'object')) bad('args: expected an object');
      return { runId: backend.startRun(m.workflow, m.args ?? {}) };
    },
    'flow.cancel': (m) => { if (!str(m.runId)) bad('runId: expected a non-empty string'); return backend.cancelRun(m.runId); },
    'flow.resume': async (m) => { if (!str(m.runId)) bad('runId: expected a non-empty string'); return { runId: await backend.resumeRun(m.runId) }; },
    'flow.list': () => backend.listRuns(),
    'slots.catalog': () => reader.catalog(),
    'slots.read': (m) => {
      if (!str(m.id)) bad('id: expected a non-empty string');
      return reader.read(m.id) ?? bad(`no readable slot: ${m.id}`);
    },
    'slots.subscribe': (m) => {
      if (!str(m.selector)) bad('selector: expected a non-empty string');
      subs.get(m.selector)?.(); // replace, never double-push
      subs.set(m.selector, reader.subscribe(m.selector, (id, value, version) => send({ type: 'slot', id, version, value })));
      return true;
    },
    'slots.unsubscribe': (m) => {
      if (!str(m.selector)) bad('selector: expected a non-empty string');
      const off = subs.get(m.selector);
      subs.delete(m.selector);
      off?.();
      return !!off;
    },
    // optional modules: a disabled or failed one answers with its reason instead of throwing a TypeError on undefined
    ...(() => {
      const mod = (name, api) => api ?? bad(`${name} unavailable: ${backend.capabilities?.()[name]?.reason ?? 'disabled'}`);
      const S = () => mod('sessions', backend.sessions), H = () => mod('history', backend.history), K = () => mod('byok', backend.byok);
      const sid = (m) => { if (!str(m.id)) bad('id: expected a non-empty string'); return m.id; };
      const prov = (m) => { if (!str(m.provider)) bad('provider: expected a non-empty string'); return m.provider; };
      const entry = (m) => { if (!isObj(m.entry) || !str(m.entry.source) || !str(m.entry.path)) bad('entry: expected {source, path}'); return m.entry; };
      const opts = (m) => { if (m.opts !== undefined && !isObj(m.opts)) bad('opts: expected an object'); return m.opts ?? {}; };
      const agentArgs = (m) => {
        if (!str(m.agent)) bad('agent: expected a non-empty string');
        if (m.cwd !== undefined && !str(m.cwd)) bad('cwd: expected a non-empty string');
        if (m.args !== undefined && !(Array.isArray(m.args) && m.args.every((a) => typeof a === 'string'))) bad('args: expected an array of strings');
        return { agent: m.agent, ...(m.cwd && { cwd: m.cwd }), ...(m.args && { args: m.args }), ...(m.cols && { cols: m.cols }), ...(m.rows && { rows: m.rows }) };
      };
      return {
        'sessions.start': (m) => S().start(agentArgs(m)),
        'sessions.list': () => S().list(),
        'sessions.stop': async (m) => { await S().stop(sid(m)); return true; },
        'sessions.send': async (m) => {
          if (typeof m.text !== 'string') bad('text: expected a string');
          await S().send(sid(m), m.text, { enter: m.enter !== false });
          return true;
        },
        'sessions.resume': (m) => { if (!str(m.sessionId)) bad('sessionId: expected a non-empty string'); return S().resume({ ...agentArgs(m), sessionId: m.sessionId }); },
        'sessions.attachCommand': async (m) => { const id = sid(m); const r = (await S().list()).find((x) => x.id === id); return r?.attachCommand ?? bad(`unknown session: ${id}`); },
        'sessions.terminal': () => { mod('termbridge', backend.terminal && backend.capabilities?.().termbridge?.ok ? backend.terminal : null); return backend.terminal(); },
        'history.scan': async (m) => H().scan(opts(m)),
        'history.list': (m) => H().list(opts(m)),
        'history.search': (m) => { if (!str(m.query)) bad('query: expected a non-empty string'); return H().search(m.query, opts(m)); },
        'history.find': (m) => H().find(m.query, opts(m)),
        'history.read': (m) => H().read(entry(m)),
        'keys.set': (m) => {
          if (!str(m.key)) bad('key: expected a non-empty string');
          if (m.baseUrl !== undefined && !str(m.baseUrl)) bad('baseUrl: expected a non-empty string');
          K().keys.set(prov(m), m.key, { baseUrl: m.baseUrl }); return true;
        },
        'keys.has': (m) => K().keys.has(prov(m)),
        'keys.remove': (m) => K().keys.remove(prov(m)),
        'keys.list': () => K().keys.list(),
        'keys.test': (m) => K().test(prov(m), { baseUrl: m.baseUrl }),
        'models.run': (m) => {
          if (typeof m.prompt !== 'string') bad('prompt: expected a string');
          if (!str(m.model)) bad('model: expected a non-empty string');
          if (m.schema !== undefined && !isObj(m.schema)) bad('schema: expected an object');
          return K().runner({ provider: prov(m), model: m.model, maxTokens: m.maxTokens, system: m.system, baseUrl: m.baseUrl }).run({ prompt: m.prompt, schema: m.schema });
        },
      };
    })(),
  };

  return {
    async handle(message) {
      try {
        if (!message || typeof message !== 'object' || Array.isArray(message)) bad('message: expected an object');
        const op = Object.hasOwn(ops, message.type) ? ops[message.type] : bad(`unknown message type: ${String(message.type)}`);
        return { ok: true, result: await op(message) };
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
    },
    subscribe(fn) { if (typeof fn !== 'function') bad('send: expected a function'); send = fn; },
  };
}
