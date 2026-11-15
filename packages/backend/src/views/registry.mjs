// View type registry: each type declares the field roles it needs; validation returns paths, never throws.
const OPS = ['eq', 'ne', 'lt', 'gt', 'contains', 'in'];
const CHARTS = ['bar', 'line', 'area', 'pie'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v !== '';
const join = (a, b) => (a && b ? `${a}.${b}` : a || b);

const rolesOf = (s) => {
  const m = {};
  for (const [n, f] of Object.entries(isObj(s.fields) ? s.fields : {})) if (isObj(f) && str(f.role)) (m[f.role] ??= []).push(n);
  return m;
};
// one error per missing role group; a group is satisfied by any of its roles
const needs = (e, r, ...groups) => {
  for (const g of groups) if (!g.some((x) => r[x])) e('fields', `needs a field with role '${g.join("' or '")}'`);
};

function checkBase(s, e) {
  if (s.format !== 'suffice.view') e('format', "must be 'suffice.view'");
  if (s.v !== 1) e('v', 'must be 1');
  if (!str(s.type)) e('type', 'must be a non-empty string');
  if (!str(s.title)) e('title', 'must be a non-empty string');
  if (s.slot !== undefined && !str(s.slot)) e('slot', 'must be a non-empty string');
  if (s.actions !== undefined && !(Array.isArray(s.actions) && s.actions.every(str))) e('actions', 'must be an array of strings');
  if (s.fields !== undefined) {
    if (!isObj(s.fields)) e('fields', 'must be an object');
    else for (const [n, f] of Object.entries(s.fields)) {
      if (!isObj(f)) { e(`fields.${n}`, 'must be an object'); continue; }
      for (const k of ['label', 'role', 'format']) if (f[k] !== undefined && typeof f[k] !== 'string') e(`fields.${n}.${k}`, 'must be a string');
    }
  }
  const o = s.options;
  if (o === undefined) return;
  if (!isObj(o)) return e('options', 'must be an object');
  if (o.sort !== undefined) {
    if (!isObj(o.sort) || !str(o.sort.field)) e('options.sort', 'needs a string field');
    else if (o.sort.dir !== undefined && !['asc', 'desc'].includes(o.sort.dir)) e('options.sort.dir', "must be 'asc' or 'desc'");
  }
  if (o.groupBy !== undefined && !str(o.groupBy)) e('options.groupBy', 'must be a field name');
  if (o.groupOrder !== undefined && !Array.isArray(o.groupOrder)) e('options.groupOrder', 'must be an array');
  if (o.filters !== undefined) {
    if (!Array.isArray(o.filters)) e('options.filters', 'must be an array');
    else o.filters.forEach((f, i) => {
      if (!isObj(f) || !str(f.field)) e(`options.filters[${i}]`, 'needs a string field');
      else if (!OPS.includes(f.op)) e(`options.filters[${i}].op`, `must be one of ${OPS.join(', ')}`);
    });
  }
}

const kids = (s, e, sub) => {
  if (!Array.isArray(s.children) || !s.children.length) return e('children', 'needs at least one child view');
  s.children.forEach((c, i) => sub(c, `children[${i}]`));
};

const BUILTIN = {
  list: ['One line per record', (s, e, r) => needs(e, r, ['title'])],
  table: ['Rows and columns; options.columns, options.sort', (s, e) => {
    const c = s.options?.columns;
    if (!Array.isArray(c) || !c.length || !c.every(str)) e('options.columns', 'needs a non-empty array of field names');
    else if (isObj(s.fields)) c.forEach((n, i) => { if (!(n in s.fields)) e(`options.columns[${i}]`, `unknown field '${n}'`); });
  }],
  board: ['Columns by a group field; options.columns orders them', (s, e, r) => {
    if (!r.group && !str(s.options?.groupBy)) e('fields', "needs a field with role 'group'");
    if (s.options?.columns !== undefined && !Array.isArray(s.options.columns)) e('options.columns', 'must be an array');
  }],
  timeline: ['Items on a time axis; roles start and optional end, or date', (s, e, r) => needs(e, r, ['start', 'date'])],
  graph: ['Nodes and edges; roles source and target', (s, e, r) => {
    needs(e, r, ['source'], ['target']);
    if (isObj(s.data) && ![s.data.nodes, s.data.edges].every(Array.isArray)) e('data', 'needs nodes and edges arrays');
  }],
  tree: ['Nested records; role parent or children', (s, e, r) => needs(e, r, ['parent', 'children'])],
  calendar: ['Records on days; role date', (s, e, r) => needs(e, r, ['date'])],
  gallery: ['Tiles; role image or title', (s, e, r) => needs(e, r, ['image', 'title'])],
  canvas: ['Free-positioned items; roles x, y, w, h', (s, e, r) => needs(e, r, ['x'], ['y'], ['w'], ['h'])],
  detail: ['One record', (s, e) => { if (!isObj(s.data) && !str(s.slot)) e('data', 'needs one record object or a slot'); }],
  feed: ['Entries ordered by date', (s, e, r) => needs(e, r, ['date'])],
  chart: ['Value by category or time; options.kind bar, line, area or pie', (s, e, r) => {
    needs(e, r, ['value'], ['category', 'date']);
    if (!CHARTS.includes(s.options?.kind)) e('options.kind', `must be one of ${CHARTS.join(', ')}`);
  }],
  split: ['Children side by side', (s, e, r, sub) => kids(s, e, sub)],
  tabs: ['Children as tabs', (s, e, r, sub) => kids(s, e, sub)],
};

export function createViewRegistry() {
  const types = new Map(Object.entries(BUILTIN).map(([n, [describe, validate]]) => [n, { describe, validate }]));

  function check(s, prefix, errs) {
    const e = (p, message) => errs.push({ path: join(prefix, p), message });
    if (!isObj(s)) return e('', 'view must be an object');
    checkBase(s, e);
    const t = types.get(s.type);
    if (!t) { if (str(s.type)) e('type', `unknown view type '${s.type}'`); return; }
    t.validate(s, e, rolesOf(s), (c, p) => check(c, join(prefix, p), errs));
  }

  return {
    validate(spec) {
      const errors = [];
      check(spec, '', errors);
      return { ok: errors.length === 0, errors };
    },
    registerType(name, def) {
      if (typeof name !== 'string' || !/^[a-z0-9-]+:[a-z0-9-]+$/.test(name)) throw new TypeError(`registerType: '${name}' must be "<plugin>:<type>"`);
      if (!def || typeof def.validate !== 'function') throw new TypeError('registerType: validate must be a function');
      if (types.has(name)) throw new TypeError(`registerType: '${name}' already registered`);
      const validate = (s, e) => {
        const res = def.validate(s);
        const list = Array.isArray(res) ? res : res?.errors ?? [];
        for (const x of list) e(x?.path ?? '', x?.message ?? String(x));
        if (!Array.isArray(res) && res?.ok === false && !list.length) e('', 'invalid');
      };
      types.set(name, { describe: def.describe ?? '', validate });
    },
    types: () => [...types].map(([name, t]) => ({ name, describe: t.describe })),
  };
}
