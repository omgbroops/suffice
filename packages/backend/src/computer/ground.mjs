// §4.2: ground a target by cheapest rung first: cache, rule, then the model; deeper snapshot once if unsure.
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const NONE = { element: null, rung: null };
const slim = (els) => els.map((e) => ({ ref: e.ref, role: e.role, name: e.name, label: String(e.name ?? ''), ...(e.value !== undefined ? { value: e.value } : {}) }));

export async function ground({ target, elements = [], cached = [], ask, threshold = 0.6, deeper } = {}) {
  if (!target) return null;
  if (typeof target === 'string' && target.startsWith('@')) {
    const e = elements.find((x) => x.ref === target);
    return e ? { element: e, rung: 'exact' } : NONE;
  }
  const match = (sel, strict) => elements.filter((e) => (!sel.role || e.role === sel.role) && (strict ? norm(e.name) === norm(sel.name) : norm(e.name).includes(norm(sel.name))));
  for (const sel of cached) { const h = match(sel, true); if (h.length === 1) return { element: h[0], rung: 'cache' }; }
  const sel = typeof target === 'string' ? { name: target } : target;
  const eq = match(sel, true);
  if (eq.length === 1) return { element: eq[0], rung: 'rule' };
  if (eq.length === 0) { const sub = match(sel, false); if (sub.length === 1) return { element: sub[0], rung: 'rule' }; }
  if (!ask) return NONE;
  const instruction = typeof target === 'string' ? target : `${target.role ?? ''} ${target.name ?? ''}`.trim();
  let list = elements;
  for (let i = 0; i < 2; i++) {
    const r = await ask('computer.ground', { instruction, elements: slim(list) });
    const e = list.find((x) => x.ref === r?.ref);
    if (e && (r.confidence ?? 1) >= threshold) return { element: e, rung: 'model' };
    if (i === 0 && deeper) list = await deeper(); else break;
  }
  return NONE;
}
