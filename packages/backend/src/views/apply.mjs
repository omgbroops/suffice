// Pure row transforms the frontend can call too: filter, stable sort, group. Never mutates input.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const present = (v) => v !== undefined && v !== null && v !== '';
const OPF = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  lt: (a, b) => present(a) && a < b,
  gt: (a, b) => present(a) && a > b,
  contains: (a, b) => (typeof a === 'string' ? a.includes(String(b)) : Array.isArray(a) && a.includes(b)),
  in: (a, b) => Array.isArray(b) && b.includes(a),
};

export function applyView(spec, rows = spec?.data) {
  if (!isObj(spec)) throw new TypeError('applyView: spec must be an object');
  if (!Array.isArray(rows)) throw new TypeError('applyView: rows must be an array');
  const o = spec.options ?? {};
  let out = rows.filter((r) => (o.filters ?? []).every((f) => {
    if (!OPF[f.op]) throw new TypeError(`applyView: unknown filter op '${f.op}'`);
    return OPF[f.op](r?.[f.field], f.value);
  }));
  if (o.sort) {
    const { field, dir = 'asc' } = o.sort;
    const k = dir === 'desc' ? -1 : 1;
    // Array.prototype.sort is stable (Node >= 11); missing values go last in both directions
    out.sort((a, b) => {
      const x = a?.[field], y = b?.[field];
      if (!present(x) || !present(y)) return present(x) === present(y) ? 0 : present(x) ? -1 : 1;
      return x < y ? -k : x > y ? k : 0;
    });
  }
  const gf = o.groupBy ?? (spec.type === 'board' ? Object.entries(spec.fields ?? {}).find(([, f]) => f?.role === 'group')?.[0] : undefined);
  if (!gf) return { rows: out, groups: null };
  const map = new Map((o.groupOrder ?? (spec.type === 'board' ? o.columns : undefined) ?? []).map((k) => [k, []]));
  for (const r of out) {
    const v = r?.[gf];
    const key = present(v) ? v : null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const missing = map.get(null);
  map.delete(null);
  const groups = [...map].map(([key, g]) => ({ key, rows: g }));
  if (missing?.length) groups.push({ key: null, rows: missing });
  return { rows: out, groups };
}
