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
