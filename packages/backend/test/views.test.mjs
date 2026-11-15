import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewRegistry, inferFields, suggestViews, generate, applyView, viewsFromSlot } from '../src/views/index.mjs';

const mk = (type, extra = {}) => ({ format: 'suffice.view', v: 1, type, title: 'T', ...extra });
const role = (r) => ({ role: r });
const reg = createViewRegistry();

const CASES = {
  list: [{ fields: { a: role('title') } }, {}, 'fields'],
  table: [{ options: { columns: ['a'], sort: { field: 'a', dir: 'asc' } } }, { options: {} }, 'options.columns'],
  board: [{ fields: { s: role('group') }, options: { columns: ['x'] } }, {}, 'fields'],
  timeline: [{ fields: { s: role('start'), e: role('end') } }, { fields: { x: role('title') } }, 'fields'],
  graph: [{ fields: { s: role('source'), t: role('target') } }, { fields: { s: role('source') } }, 'fields'],
  tree: [{ fields: { p: role('parent') } }, {}, 'fields'],
  calendar: [{ fields: { d: role('date') } }, {}, 'fields'],
  gallery: [{ fields: { i: role('image') } }, {}, 'fields'],
  chart: [{ fields: { v: role('value'), c: role('category') }, options: { kind: 'bar' } }, { fields: { v: role('value'), c: role('category') }, options: { kind: 'donut' } }, 'options.kind'],
  canvas: [{ fields: { x: role('x'), y: role('y'), w: role('w'), h: role('h') } }, { fields: { x: role('x'), y: role('y'), w: role('w') } }, 'fields'],
  detail: [{ data: { a: 1 } }, { data: [1] }, 'data'],
  feed: [{ fields: { d: role('date') } }, {}, 'fields'],
  split: [{ children: [mk('list', { fields: { a: role('title') } })] }, { children: [] }, 'children'],
  tabs: [{ children: [mk('list', { fields: { a: role('title') } })] }, {}, 'children'],
};
for (const [type, [good, bad, path]] of Object.entries(CASES)) {
  test(`built-in ${type}: valid and invalid`, () => {
    assert.deepEqual(reg.validate(mk(type, good)), { ok: true, errors: [] });
    const r = reg.validate(mk(type, bad));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.path === path), JSON.stringify(r.errors));
  });
}

test('base checks, nested paths, unknown type', () => {
  assert.equal(reg.validate({}).ok, false);
  assert.ok(reg.validate(mk('nope')).errors.some((e) => e.path === 'type'));
  const r = reg.validate(mk('tabs', { children: [mk('list')] }));
  assert.ok(r.errors.some((e) => e.path === 'children[0].fields'));
  assert.equal(reg.validate(mk('list', { fields: { a: role('title') }, options: { filters: [{ field: 'a', op: 'like' }] } })).ok, false);
});

test('plugin types are namespaced', () => {
  const r = createViewRegistry();
  assert.throws(() => r.registerType('radar', { validate: () => [] }), TypeError);
  assert.throws(() => r.registerType('list', { validate: () => [] }), TypeError);
  r.registerType('acme:radar', { validate: (s) => (s.options?.ok ? [] : ['needs ok']), describe: 'radar' });
  assert.throws(() => r.registerType('acme:radar', { validate: () => [] }), TypeError);
  assert.equal(r.validate(mk('acme:radar', { options: { ok: true } })).ok, true);
  const bad = r.validate(mk('acme:radar'));
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0].message, 'needs ok');
  assert.ok(r.types().some((t) => t.name === 'acme:radar' && t.describe === 'radar'));
  assert.equal(r.types().filter((t) => !t.name.includes(':')).length, 14);
});

test('inferFields: each kind', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: `r${i + 1}`, flag: i % 2 === 0, n: i * 3, when: `2026-02-0${i + 1}`, ts: 1700000000000 + i * 1000,
    link: `https://x.io/p/${i}`, img: `https://x.io/i/${i}.png?w=1`, state: ['a', 'b', 'a', 'b', 'c', 'a', 'b', 'c'][i],
    parent: i ? 'r1' : null, note: `note ${i}`,
  }));
  const f = inferFields(rows);
  const kinds = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.kind]));
  assert.deepEqual(kinds, { id: 'id', flag: 'boolean', n: 'number', when: 'date', ts: 'date', link: 'url', img: 'image', state: 'enum', parent: 'relation', note: 'string' });
  assert.equal(f.parent.role, 'parent');
  assert.equal(f.state.role, 'group');
  assert.equal(f.n.role, 'value');
  assert.equal(f.note.role, 'title');
  assert.equal(f.img.role, 'image');
});

const tasks = ['todo', 'doing', 'done', 'todo', 'done', 'doing'].map((status, i) => ({ id: `t${i}`, title: `Task ${i}`, status, start: `2026-03-0${i + 1}`, end: `2026-03-0${i + 2}` }));
const links = [['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'd'], ['d', 'e'], ['e', 'b']].map(([source, target], i) => ({ source, target, weight: i + 1 }));
const files = [[null, 'root'], ['f0', 'src'], ['f0', 'docs'], ['f1', 'a.js'], ['f1', 'b.js'], ['f2', 'c.md']].map(([parent, name], i) => ({ id: `f${i}`, name, parent, size: 10 * i }));
const series = Array.from({ length: 6 }, (_, i) => ({ t: 1700000000000 + i * 86400000, v: i * i }));
const photos = Array.from({ length: 5 }, (_, i) => ({ title: `Photo ${i}`, image: `https://x.io/${i}.jpg` }));
const types = (rows, o) => suggestViews(rows, o).map((s) => s.spec.type);

test('suggestViews fits the data and never misses a role', () => {
  const t = types(tasks);
  for (const x of ['board', 'timeline', 'calendar', 'table', 'list']) assert.ok(t.includes(x), x);
  for (const x of ['graph', 'tree', 'chart', 'gallery']) assert.ok(!t.includes(x), x);
  assert.ok(types(links).includes('graph'));
  assert.ok(!types(links).includes('board'));
  assert.ok(types(files).includes('tree'));
  assert.ok(!types(files).includes('graph'));
  const s = types(series);
  assert.ok(s.includes('chart'));
  for (const x of ['board', 'graph', 'tree', 'gallery']) assert.ok(!s.includes(x), x);
  assert.equal(types(photos)[0], 'gallery');
  assert.ok(!types(photos).includes('board'));
  assert.equal(types(tasks, { max: 2 }).length, 2);
  for (const rows of [tasks, links, files, series, photos]) for (const { spec, reason } of suggestViews(rows, { max: 20 })) {
    assert.deepEqual(reg.validate(spec), { ok: true, errors: [] }, spec.type);
    assert.ok(reason.length > 0);
  }
  assert.equal(suggestViews([{ a: 1 }], { max: 20 })[0].spec.type, 'detail');
});

test('generate builds one spec or names the missing role', () => {
  const b = generate('board', tasks, { title: 'Work' });
  assert.equal(b.title, 'Work');
  assert.equal(b.options.groupBy, 'status');
  assert.deepEqual(b.options.columns, ['todo', 'doing', 'done']);
  assert.equal(generate('chart', series).options.kind, 'line');
  assert.equal(generate('list', series).type, 'list');
  assert.throws(() => generate('board', series), /group/);
  assert.throws(() => generate('gallery', series), /image/);
  assert.throws(() => generate('timeline', links), /start/);
  assert.throws(() => generate('tabs', tasks), /children/);
  assert.throws(() => generate('nope', tasks), TypeError);
  assert.throws(() => generate('board', 'x'), TypeError);
  assert.equal(generate('tabs', tasks, { children: [generate('table', tasks)] }).children.length, 1);
});

const rows3 = [
  { id: 1, k: 'b', n: 2, tag: ['x'] }, { id: 2, k: 'a', n: 2 }, { id: 3, k: 'b', n: 1, tag: ['y', 'x'] }, { id: 4, n: 3 },
];
const view = (options, extra = {}) => mk('table', { options: { columns: ['id'], ...options }, ...extra });
const ids = (r) => r.rows.map((x) => x.id);

test('applyView sort is stable, missing last, input untouched', () => {
  const snap = JSON.stringify(rows3);
  Object.freeze(rows3);
  assert.deepEqual(ids(applyView(view({ sort: { field: 'n' } }), rows3)), [3, 1, 2, 4]);
  assert.deepEqual(ids(applyView(view({ sort: { field: 'n', dir: 'desc' } }), rows3)), [4, 1, 2, 3]);
  assert.deepEqual(ids(applyView(view({ sort: { field: 'k' } }), rows3)), [2, 1, 3, 4]);
  assert.deepEqual(ids(applyView(view({ sort: { field: 'k', dir: 'desc' } }), rows3)), [1, 3, 2, 4]);
  assert.equal(JSON.stringify(rows3), snap);
  assert.equal(applyView(view({}), rows3).groups, null);
});

test('applyView filter operators', () => {
  const f = (op, value, field = 'n') => ids(applyView(view({ filters: [{ field, op, value }] }), rows3));
  assert.deepEqual(f('eq', 2), [1, 2]);
  assert.deepEqual(f('ne', 2), [3, 4]);
  assert.deepEqual(f('lt', 3), [1, 2, 3]);
  assert.deepEqual(f('gt', 1), [1, 2, 4]);
  assert.deepEqual(f('lt', 3, 'zz'), []);
  assert.deepEqual(f('contains', 'x', 'tag'), [1, 3]);
  assert.deepEqual(f('contains', 'b', 'k'), [1, 3]);
  assert.deepEqual(f('in', ['a', 'b'], 'k'), [1, 2, 3]);
  assert.throws(() => f('like', 1), TypeError);
});

test('applyView groups: explicit order, missing bucket last', () => {
  const g = applyView(view({ groupBy: 'k', groupOrder: ['z', 'b'] }), rows3).groups;
  assert.deepEqual(g.map((x) => x.key), ['z', 'b', 'a', null]);
  assert.deepEqual(g.map((x) => x.rows.map((r) => r.id)), [[], [1, 3], [2], [4]]);
  const board = mk('board', { fields: { k: role('group') }, options: { columns: ['a', 'b'] } });
  assert.deepEqual(applyView(board, rows3).groups.map((x) => x.key), ['a', 'b', null]);
  assert.throws(() => applyView(view({}), 'x'), TypeError);
});

test('viewsFromSlot proposes a spec from a JSON Schema', () => {
  const runs = viewsFromSlot({ id: 'runs:list', title: 'Runs', schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, status: { enum: ['run', 'done'] }, startedAt: { type: 'string', format: 'date-time' } } } } });
  assert.equal(runs.type, 'board');
  assert.equal(runs.slot, 'runs:list');
  assert.equal(runs.title, 'Runs');
  assert.equal(reg.validate(runs).ok, true);
  const tl = viewsFromSlot({ id: 'run:7:timeline', title: 'Timeline', schema: { type: 'array', items: { type: 'object', properties: { ts: { type: 'integer' }, type: { type: 'string' } } } } });
  assert.equal(tl.type, 'timeline');
  const one = viewsFromSlot({ id: 'settings:main', title: 'S', schema: { type: 'object', properties: { a: { type: 'string' } } } });
  assert.equal(one.type, 'detail');
  assert.equal(reg.validate(one).ok, true);
  assert.throws(() => viewsFromSlot({ id: 'k:s', title: 'x', sensitivity: 'secret', schema: { type: 'object', properties: {} } }), TypeError);
  assert.throws(() => viewsFromSlot({ id: 'k:s', title: 'x', schema: { type: 'string' } }), TypeError);
});

test('produced specs carry no presentation', () => {
  const specs = [];
  for (const rows of [tasks, links, files, series, photos]) specs.push(...suggestViews(rows, { max: 20 }).map((s) => s.spec));
  specs.push(viewsFromSlot({ id: 'a:b', title: 'B', schema: { type: 'array', items: { type: 'object', properties: { s: { enum: ['x'] } } } } }));
  assert.ok(specs.length > 10);
  const walk = (v, path) => {
    if (typeof v === 'string') {
      assert.ok(!v.includes('<'), `${path}: ${v}`);
      assert.ok(!/^#[0-9a-f]{3,8}$/i.test(v) && !/^(rgb|hsl)a?\(/i.test(v), `${path}: ${v}`);
    } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      assert.ok(!/^(style|class|className|color|css)$/i.test(k), `${path}.${k}`);
      walk(x, `${path}.${k}`);
    }
  };
  specs.forEach((s, i) => walk(s, `spec${i}`));
});
