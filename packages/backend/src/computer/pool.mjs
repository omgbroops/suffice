// §5: bounded pool, fair across agents (least-served first), per-surface caps, per-app serialisation.
export function createComputerPool({ make, max = 4, perSurface = {} }) {
  const queues = new Map(); // agentId -> [{spec,resolve,reject}]
  const order = [];
  const busy = new Set();
  const served = new Map();
  const per = {};
  const tails = new Map();
  let active = 0;

  const serialize = (key, fn) => {
    const next = (tails.get(key) ?? Promise.resolve()).then(fn);
    const tail = next.catch(() => {});
    tails.set(key, tail);
    tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return next;
  };

  const surf = (id) => queues.get(id)[0].spec.surface ?? 'browser';

  function pump() {
    while (active < max) {
      let pick = null;
      for (const id of order) {
        if (busy.has(id) || (per[surf(id)] ?? 0) >= (perSurface[surf(id)] ?? Infinity)) continue;
        if (pick === null || (served.get(id) ?? 0) < (served.get(pick) ?? 0)) pick = id;
      }
      if (pick === null) break;
      start(pick);
    }
  }

  function start(id) {
    const q = queues.get(id);
    const job = q.shift();
    if (!q.length) { queues.delete(id); order.splice(order.indexOf(id), 1); }
    const surface = job.spec.surface ?? 'browser';
    active++; per[surface] = (per[surface] ?? 0) + 1; busy.add(id); served.set(id, (served.get(id) ?? 0) + 1);
    (async () => make({ agentId: id, surface, serialize }).run(job.spec))().then(job.resolve, job.reject).finally(() => {
      active--; per[surface]--; busy.delete(id);
      if (!active && !order.length) served.clear();
      pump();
    });
  }

  return {
    run(spec) {
      return new Promise((resolve, reject) => {
        const id = spec.agentId;
        if (!queues.has(id)) queues.set(id, []);
        if (!order.includes(id)) order.push(id);
        queues.get(id).push({ spec, resolve, reject });
        pump();
      });
    },
  };
}

// §4.1: step trace published as a slot so the UI can show live progress; typed text never enters it.
export function defineComputerSlots(slots) {
  const handles = new Map();
  return {
    async publish(agentId, steps) {
      let h = handles.get(agentId);
      if (!h) {
        h = slots.define({ id: `computer:${agentId}:steps`, title: `Computer steps (${agentId})`, schema: { type: 'object', properties: { steps: { type: 'array' } }, required: ['steps'] } }, { steps: [] });
        handles.set(agentId, h);
      }
      return (await h).set(JSON.parse(JSON.stringify({ steps })));
    },
  };
}
