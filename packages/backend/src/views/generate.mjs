// View generation: infer field kinds and roles from rows (or a slot's JSON Schema), then build valid specs.
import { createViewRegistry } from './registry.mjs';

const builtin = createViewRegistry();
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const IMG = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const REF = /(^|_)(id|parent|ref|source|target|from|to)$|Id$|parent/i;
const TITLE = /^(title|name|label|subject)$/i;
// shortcut: any integer in the 2000-2100 epoch range counts as a date, so a bare count near 1e9 misreads; upgrade with a name hint if it bites
const isDate = (v) => (typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v))) || (Number.isInteger(v) && ((v >= 9.46e11 && v <= 4.1e12) || (v >= 9.46e8 && v <= 4.1e9)));

function kindOf(name, vals, idSet) {
  if (!vals.length) return 'string';
  const all = (f) => vals.every(f);
  if (all((v) => typeof v === 'boolean')) return 'boolean';
  if (name === 'id') return 'id';
  if (all(isDate)) return 'date';
  if (idSet && all((v) => (typeof v === 'string' || REF.test(name)) && idSet.has(v))) return 'relation';
  if (all((v) => typeof v === 'number')) return 'number';
  if (!all((v) => typeof v === 'string')) return 'string';
  if (all((v) => /^https?:\/\/\S+$/.test(v))) return all((v) => IMG.test(v.split(/[?#]/)[0])) ? 'image' : 'url';
  if (/_id$|Id$/.test(name)) return 'id';
  const d = new Set(vals).size;
  return d <= 8 && d * 2 <= vals.length ? 'enum' : 'string';
}

const BASE = { string: 'text', number: 'value', boolean: 'flag', url: 'link', image: 'image', enum: 'group', id: 'id' };
const GEOM = { x: 'x', y: 'y', w: 'w', width: 'w', h: 'h', height: 'h' };

function assign(kinds) {
  const out = {}, fixed = new Set();
  for (const [name, kind] of Object.entries(kinds)) {
    let role = kind === 'date' ? (/end|finish|until/i.test(name) ? 'end' : /start|begin/i.test(name) ? 'start' : 'date') : kind === 'relation' ? (/parent/i.test(name) ? 'parent' : 'ref') : BASE[kind];
    const ov = kind === 'date' ? undefined
      : /^(source|from|src)$/i.test(name) ? 'source' : /^(target|to|dst)$/i.test(name) ? 'target' : /^parent(_?id)?$/i.test(name) ? 'parent'
      : kind === 'number' ? GEOM[name.toLowerCase()] : undefined;
    if (ov) { role = ov; fixed.add(name); }
    out[name] = { kind, role };
  }
  const names = Object.keys(out);
  const cand = names.filter((n) => !fixed.has(n) && ['string', 'enum'].includes(kinds[n]));
  if (!names.some((n) => out[n].role === 'title')) {
    const t = cand.find((n) => TITLE.test(n)) ?? cand.find((n) => kinds[n] === 'string');
    if (t) out[t].role = 'title';
  }
  return out;
}

const needRows = (rows, who) => {
  if (!Array.isArray(rows) || !rows.every(isObj)) throw new TypeError(`${who}: rows must be an array of objects`);
};

export function inferFields(rows) {
  needRows(rows, 'inferFields');
  const sample = rows.slice(0, 500);
  const ids = sample.map((r) => r.id).filter((v) => v != null);
  const idSet = ids.length ? new Set(ids) : null;
  const names = [...new Set(sample.flatMap(Object.keys))];
  return assign(Object.fromEntries(names.map((n) => [n, kindOf(n, sample.map((r) => r[n]).filter((v) => v != null), idSet)])));
}

const miss = (type, ...roles) => {
  throw Object.assign(new Error(`views.generate(${type}): no field with role '${roles.join("' or '")}'`), { missing: true });
};
const namesOf = (inf, role) => Object.keys(inf).filter((n) => inf[n].role === role);

function gen(type, inf, rows, h = {}) {
  const pick = (...roles) => {
    for (const r of roles) {
      if (h.roles?.[r]) return h.roles[r];
      const ns = namesOf(inf, r);
      if (ns.length) return r === 'group' ? ns.find((n) => /status|state|stage/i.test(n)) ?? ns[0] : ns[0];
    }
  };
  const must = (...roles) => pick(...roles) ?? miss(type, ...roles);
  const f = {}, o = {};
  const use = (n, role) => { if (n) f[n] = { label: n, role }; };
  const spec = { format: 'suffice.view', v: 1, type, title: h.title ?? type[0].toUpperCase() + type.slice(1) };
  if (h.slot) spec.slot = h.slot;
  switch (type) {
    case 'list': use(pick('title') ?? Object.keys(inf)[0] ?? miss(type, 'title'), 'title'); break;
    case 'table': {
      const cols = Object.keys(inf);
      if (!cols.length) miss(type, 'column');
      for (const n of cols) use(n, inf[n].role);
      o.columns = cols;
      break;
    }
    case 'board': {
      const g = must('group');
      use(g, 'group'); use(pick('title'), 'title');
      o.groupBy = g;
      o.columns = [...new Set(rows.map((r) => r[g]).filter((v) => v != null))];
      break;
    }
    case 'timeline': use(must('start', 'date'), 'start'); use(pick('end'), 'end'); use(pick('title'), 'title'); break;
    case 'calendar': use(must('date', 'start'), 'date'); use(pick('title'), 'title'); break;
    case 'feed': use(must('date', 'start'), 'date'); use(pick('title'), 'title'); break;
    case 'graph': {
      let s = pick('source'), t = pick('target');
      if (!s || !t) { const rel = pick('ref'), id = pick('id'); if (rel && id) { s = id; t = rel; } }
      use(s ?? miss(type, 'source'), 'source'); use(t ?? miss(type, 'target'), 'target');
      break;
    }
    case 'tree': { const p = pick('parent'); use(p ?? must('children'), p ? 'parent' : 'children'); use(pick('title'), 'title'); break; }
    case 'gallery': {
      const i = pick('image'), t = pick('title');
      if (!i && !t) miss(type, 'image', 'title');
      use(i, 'image'); use(t, 'title');
      break;
    }
    case 'chart': {
      use(must('value'), 'value');
      const d = pick('date', 'start'), c = d ? undefined : pick('category', 'group', 'title');
      if (!d && !c) miss(type, 'category', 'date');
      use(d, 'date'); use(c, 'category');
      o.kind = h.kind ?? (d ? 'line' : 'bar');
      break;
    }
    case 'canvas': for (const r of ['x', 'y', 'w', 'h']) use(must(r), r); break;
    case 'detail':
      for (const n of Object.keys(inf)) use(n, inf[n].role);
      if (rows[0]) spec.data = rows[0];
      else if (!h.slot) throw Object.assign(new Error('views.generate(detail): needs one record'), { missing: true });
      break;
    case 'split': case 'tabs':
      if (!Array.isArray(h.children) || !h.children.length) throw Object.assign(new Error(`views.generate(${type}): missing children`), { missing: true });
      spec.children = h.children;
      break;
    default: throw new TypeError(`generate: no generator for view type '${type}'`);
  }
  if (Object.keys(f).length) spec.fields = f;
  const opts = { ...o, ...h.options };
  if (Object.keys(opts).length) spec.options = opts;
  const r = builtin.validate(spec);
  if (!r.ok) throw new Error(`views.generate(${type}): invalid spec: ${r.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
  return spec;
}

export function generate(type, rows, hints = {}) {
  if (typeof type !== 'string') throw new TypeError('generate: type must be a string');
  needRows(rows, 'generate');
  return gen(type, inferFields(rows), rows, hints);
}

const RANK = ['gallery', 'board', 'timeline', 'calendar', 'graph', 'tree', 'chart', 'feed', 'table', 'list'];
const fieldOf = (s, r) => Object.keys(s.fields ?? {}).find((n) => s.fields[n].role === r);
const REASON = {
  gallery: (s) => `shows ${fieldOf(s, 'image') ?? fieldOf(s, 'title')} as tiles`,
  board: (s) => `groups records into columns by ${s.options.groupBy}`,
  timeline: (s) => `places records on a time axis by ${fieldOf(s, 'start')}${fieldOf(s, 'end') ? ` to ${fieldOf(s, 'end')}` : ''}`,
  calendar: (s) => `places records on days by ${fieldOf(s, 'date')}`,
  graph: (s) => `links ${fieldOf(s, 'source')} to ${fieldOf(s, 'target')}`,
  tree: (s) => `nests records under ${fieldOf(s, 'parent') ?? fieldOf(s, 'children')}`,
  chart: (s) => `plots ${fieldOf(s, 'value')} by ${fieldOf(s, 'date') ?? fieldOf(s, 'category')}`,
  feed: (s) => `lists entries in order of ${fieldOf(s, 'date')}`,
  table: () => 'every field as a column',
  list: () => 'one line per record',
  detail: () => 'a single record',
};

function suggest(inf, rows, { max = 5, slot, title } = {}) {
  const out = [];
  for (const t of rows.length === 1 ? ['detail', ...RANK] : RANK) {
    if (t === 'gallery' && !namesOf(inf, 'image').length) continue; // a title alone does not make tiles worth proposing
    try {
      const spec = gen(t, inf, rows, { slot, title });
      out.push({ spec, reason: REASON[t](spec) });
    } catch (e) { if (!e.missing) throw e; }
  }
  return out.slice(0, max);
}

export function suggestViews(rows, { max = 10 } = {}) {
  needRows(rows, 'suggestViews');
  return suggest(inferFields(rows), rows, { max });
}

export function viewsFromSlot(def) {
  if (!isObj(def) || typeof def.id !== 'string' || !isObj(def.schema)) throw new TypeError('viewsFromSlot: expected a SlotDef with id and schema');
  if (def.sensitivity === 'secret') throw new TypeError('viewsFromSlot: secret slots are never sent to a UI reader');
  const list = def.schema.type === 'array';
  const item = list ? def.schema.items : def.schema;
  if (!isObj(item) || !isObj(item.properties)) throw new TypeError('viewsFromSlot: schema must describe an object or an array of objects');
  const kinds = {};
  for (const [n, p] of Object.entries(item.properties)) {
    const t = isObj(p) ? p : {};
    kinds[n] = n === 'id' ? 'id'
      : Array.isArray(t.enum) ? 'enum'
      : t.type === 'boolean' ? 'boolean'
      : t.type === 'integer' || t.type === 'number' ? (/(^|_)(ts|time|timestamp|at|date)$|At$/.test(n) ? 'date' : 'number')
      : t.format === 'date' || t.format === 'date-time' ? 'date'
      : t.format === 'uri' || t.format === 'url' ? (/image|img|thumb|avatar/i.test(n) ? 'image' : 'url')
      : /_id$|Id$/.test(n) ? 'id' : 'string';
  }
  const inf = assign(kinds), h = { slot: def.id, title: def.title };
  if (!list) return gen('detail', inf, [], h);
  const top = suggest(inf, [], { max: 1, ...h })[0];
  if (!top) throw new Error('viewsFromSlot: schema has no usable fields');
  return top.spec;
}
