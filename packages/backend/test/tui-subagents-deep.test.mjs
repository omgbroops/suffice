import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSubagentTracker } from '../src/tui/subagents.mjs';
import { itemProblem } from '../src/tui/model.mjs';

// synthetic home: <home>/.claude/projects/proj/<sid>.jsonl plus <sid>/subagents/agent-<id>.{jsonl,meta.json}
const mk = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-sub-'));
  const dir = path.join(home, '.claude', 'projects', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  const parent = path.join(dir, 'sess1.jsonl');
  fs.writeFileSync(parent, '');
  let n = 0;
  const L = (o, side) => JSON.stringify({ sessionId: 'sess1', isSidechain: !!side, uuid: 'u' + ++n, timestamp: new Date(1e12 + n * 1000).toISOString(), ...o }) + '\n';
  const use = (id, name, input, side) => L({ type: 'assistant', message: { id: 'm' + n, content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 10, output_tokens: 5 } } }, side);
  const res = (id, content, tur, side) => L({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] }, toolUseResult: tur }, side);
  const text = (t, side) => L({ type: 'assistant', message: { id: 'm' + n, content: [{ type: 'text', text: t }], usage: { input_tokens: 10, output_tokens: 5 } } }, side);
  const sub = path.join(dir, 'sess1', 'subagents');
  const child = (id, meta, lines = '') => {
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, `agent-${id}.meta.json`), JSON.stringify(meta));
    fs.appendFileSync(path.join(sub, `agent-${id}.jsonl`), lines);
  };
  const add = (s) => fs.appendFileSync(parent, s);
  return { home, parent, sub, L, use, res, text, child, add, done: () => fs.rmSync(home, { recursive: true, force: true }) };
};
const walk = (list, f) => { for (const i of list) { f(i); if (i.items) walk(i.items, f); } };
const until = (get, ok) => new Promise((resolve, reject) => { const to = setTimeout(() => reject(new Error('timeout')), 4000); const t = setInterval(() => { if (ok(get())) { clearTimeout(to); clearInterval(t); resolve(get()); } }, 20); });
const track = (parent) => { let last = []; const stop = createSubagentTracker({ fs }).attach(parent, (l) => { last = l; }); return { get: () => last, stop }; };


const open = (w, o) => createSubagentTracker({ fs }).open(w.parent, o);
const load = (w) => createSubagentTracker({ fs }).load(w.parent);
const meta = (type, desc, tool, x = {}) => ({ agentType: type, description: desc, toolUseId: tool, ...x });
const model = (w, id, text, m = 'claude-haiku-4-5', inT = 10, outT = 5) => w.L({ type: 'assistant', message: { id: 'mu' + id + w.L.length + Math.random(), model: m, content: [{ type: 'text', text }], usage: { input_tokens: inT, output_tokens: outT } } }, true);
const task = (w, id, desc, extra = {}) => w.use(id, 'Task', { subagent_type: 'Explore', description: desc, prompt: 'p', ...extra });
const ok = (list) => walk(list, (i) => assert.equal(itemProblem(i), null, JSON.stringify(i)));
// one parent with n finished children aa0..; returns the sandbox
const family = (n, extra = () => ({})) => {
  const w = mk();
  for (let i = 0; i < n; i++) {
    w.add(task(w, 'c' + i, 'D' + i, extra(i).input));
    w.child('a' + i, meta('Explore', 'D' + i, 'c' + i, extra(i).meta), w.text('hello ' + i, true));
    w.add(w.res('c' + i, 'done', { agentId: 'a' + i }));
  }
  return w;
};

// 1. full transcript by id
test('transcript(id) returns every child item in file order', () => {
  const w = mk(); w.add(task(w, 'c1', 'One'));
  w.child('aa', meta('Explore', 'One', 'c1'), w.text('first', true) + w.use('x1', 'Read', { file_path: '/a' }, true) + w.res('x1', 'ok', {}, true) + w.text('last', true));
  const o = open(w, { watch: false });
  try { const t = o.transcript('aa'); assert.equal(t.filter((i) => i.kind !== 'usage').length, 3); assert.equal(t[0].text, 'first'); assert.equal(t.filter((i) => i.kind !== 'usage').at(-1).text, 'last'); ok(t); } finally { o.close(); w.done(); }
});
test('transcript keeps usage items so token views can use them', () => {
  const w = mk(); w.add(task(w, 'c1', 'One')); w.child('aa', meta('Explore', 'One', 'c1'), w.text('x', true));
  const o = open(w, { watch: false });
  try { assert.ok(o.transcript('aa').some((i) => i.kind === 'usage')); } finally { o.close(); w.done(); }
});
test('transcript of unknown id is an empty list', () => {
  const w = mk(); const o = open(w, { watch: false });
  try { assert.deepEqual(o.transcript('nope'), []); } finally { o.close(); w.done(); }
});
test('transcript ids are unique and ts are numbers', () => {
  const w = mk(); w.add(task(w, 'c1', 'One')); w.child('aa', meta('Explore', 'One', 'c1'), w.text('a', true) + w.text('b', true));
  const o = open(w, { watch: false });
  try { const t = o.transcript('aa'); assert.equal(new Set(t.map((i) => i.id)).size, t.length); assert.ok(t.every((i) => typeof i.ts === 'number')); } finally { o.close(); w.done(); }
});
test('transcript of a nested agent shows its own spawn item enriched', () => {
  const w = mk(); w.add(task(w, 'c1', 'Outer'));
  w.child('aa', meta('Explore', 'Outer', 'c1'), task(w, 'n1', 'Inner').replace(/"isSidechain":false/, '"isSidechain":true'));
  w.child('bb', meta('Explore', 'Inner', 'n1', { parentAgentId: 'aa' }), w.text('deep', true));
  const o = open(w, { watch: false });
  try { const sub = o.transcript('aa').find((i) => i.kind === 'subagent'); assert.equal(sub.items[0].text, 'deep'); ok(o.transcript('aa')); } finally { o.close(); w.done(); }
});
test('transcript grows live after more lines are appended', async () => {
  const w = mk(); w.add(task(w, 'c1', 'One')); w.child('aa', meta('Explore', 'One', 'c1'), w.text('one', true));
  let list = []; const o = open(w, { onUpdate: (l) => { list = l; } });
  try { await until(() => list, (l) => l[0]?.items.length === 1); fs.appendFileSync(path.join(w.sub, 'agent-aa.jsonl'), w.text('two', true)); await until(() => o.transcript('aa'), (t) => t.filter((i) => i.kind === 'assistant').length === 2); } finally { o.close(); w.done(); }
});

// 2. history from disk
test('load() reads a finished session with no watcher', () => {
  const w = family(2); const r = load(w);
  try { assert.equal(r.subagents.length, 2); assert.deepEqual(r.subagents.map((s) => s.status), ['ok', 'ok']); assert.equal(r.subagents[1].items[0].text, 'hello 1'); ok(r.subagents); } finally { w.done(); }
});
test('load() returns agents, groups, skipped and a transcript reader', () => {
  const w = family(1); const r = load(w);
  try { assert.equal(r.agents.length, 1); assert.deepEqual(r.groups, []); assert.equal(typeof r.skipped, 'number'); assert.equal(r.transcript('a0')[0].text, 'hello 0'); } finally { w.done(); }
});
test('load() on a session with no subagent folder is empty, not an error', () => {
  const w = mk(); w.add(w.text('hi'));
  try { const r = load(w); assert.deepEqual([r.subagents, r.agents, r.skipped], [[], [], 0]); } finally { w.done(); }
});
test('load() on a missing parent file is empty', () => {
  const w = mk(); fs.rmSync(w.parent);
  try { assert.deepEqual(load(w).subagents, []); } finally { w.done(); }
});
test('load() keeps result stats: tool count, tokens, duration', () => {
  const w = mk(); w.add(task(w, 'c1', 'One')); w.child('aa', meta('Explore', 'One', 'c1'), w.text('x', true)); w.add(w.res('c1', 'd', { agentId: 'aa', totalToolUseCount: 4, totalTokens: 99, totalDurationMs: 2500 }));
  try { const s = load(w).subagents[0]; assert.deepEqual([s.toolUses, s.tokens, s.durationMs], [4, 99, 2500]); } finally { w.done(); }
});
test('load() does not start timers or watchers (process can exit)', () => {
  const w = family(1); let watched = 0; const f = { ...fs, watch: () => { watched++; return { on() {}, close() {} }; } };
  try { createSubagentTracker({ fs: f }).load(w.parent); assert.equal(watched, 0); } finally { w.done(); }
});
test('load() finds children that only exist as files (no meta, no parent call)', () => {
  const w = mk(); fs.mkdirSync(w.sub, { recursive: true }); fs.writeFileSync(path.join(w.sub, 'agent-zz.jsonl'), w.text('lonely', true));
  try { const r = load(w); assert.equal(r.agents.length, 1); assert.equal(r.transcript('zz')[0].text, 'lonely'); } finally { w.done(); }
});
test('load() equals what the live tail ends with', async () => {
  const w = family(2); let live = []; const stop = createSubagentTracker({ fs }).attach(w.parent, (l) => { live = l; });
  try { await until(() => live, (l) => l.length === 2 && l.every((s) => s.items.length)); assert.deepEqual(JSON.parse(JSON.stringify(load(w).subagents)), JSON.parse(JSON.stringify(live))); } finally { stop(); w.done(); }
});

// 3. parallel
test('four running subagents each keep their own state', () => {
  const w = mk(); for (let i = 0; i < 4; i++) { w.add(task(w, 'c' + i, 'D' + i)); w.child('a' + i, meta('Explore', 'D' + i, 'c' + i), w.text('t' + i, true)); }
  try { const l = load(w).subagents; assert.equal(l.length, 4); assert.ok(l.every((s) => s.status === 'running')); assert.deepEqual(l.map((s) => s.items[0].text), ['t0', 't1', 't2', 't3']); } finally { w.done(); }
});
test('parallel mix of running, done and failed', () => {
  const w = mk(); for (let i = 0; i < 3; i++) { w.add(task(w, 'c' + i, 'D' + i)); w.child('a' + i, meta('Explore', 'D' + i, 'c' + i), w.text('t', true)); }
  w.add(w.res('c1', 'fine', { agentId: 'a1' })); w.add(w.L({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'c2', is_error: true, content: 'boom' }] } }));
  try { assert.deepEqual(load(w).subagents.map((s) => s.status), ['running', 'ok', 'error']); } finally { w.done(); }
});
test('order is the parent call order, not child file order', () => {
  const w = mk(); w.add(task(w, 'c1', 'First') + task(w, 'c2', 'Second') + task(w, 'c3', 'Third'));
  w.child('zz', meta('Explore', 'Third', 'c3'), w.text('z', true)); w.child('aa', meta('Explore', 'First', 'c1'), w.text('a', true)); w.child('mm', meta('Explore', 'Second', 'c2'), w.text('m', true));
  try { assert.deepEqual(load(w).subagents.map((s) => s.description), ['First', 'Second', 'Third']); } finally { w.done(); }
});
test('order stays stable when a later child finishes first', async () => {
  const w = mk(); w.add(task(w, 'c1', 'A') + task(w, 'c2', 'B') + task(w, 'c3', 'C'));
  let list = []; const o = open(w, { onUpdate: (l) => { list = l; } });
  try { w.add(w.res('c3', 'd', {})); await until(() => list, (l) => l[2]?.status === 'ok'); assert.deepEqual(list.map((s) => s.description), ['A', 'B', 'C']); w.add(w.res('c1', 'd', {})); await until(() => list, (l) => l[0].status === 'ok'); assert.deepEqual(list.map((s) => s.description), ['A', 'B', 'C']); } finally { o.close(); w.done(); }
});
test('live: a running child flips to done without touching its siblings', async () => {
  const w = mk(); w.add(task(w, 'c1', 'A') + task(w, 'c2', 'B') + task(w, 'c3', 'C'));
  let list = []; const o = open(w, { onUpdate: (l) => { list = l; } });
  try { w.add(w.res('c2', 'd', {})); await until(() => list, (l) => l[1]?.status === 'ok'); assert.deepEqual(list.map((s) => s.status), ['running', 'ok', 'running']); } finally { o.close(); w.done(); }
});
test('agents() lists parallel agents sorted by start then id', () => {
  const w = family(3);
  try { assert.deepEqual(load(w).agents.map((a) => a.agentId), ['a0', 'a1', 'a2']); } finally { w.done(); }
});
test('each parallel agent counts only its own usage', () => {
  const w = mk(); for (let i = 0; i < 3; i++) { w.add(task(w, 'c' + i, 'D' + i)); w.child('a' + i, meta('Explore', 'D' + i, 'c' + i), model(w, i, 't', 'm', 100 * (i + 1), i + 1)); }
  try { assert.deepEqual(load(w).subagents.map((s) => [s.inputTokens, s.outputTokens]), [[100, 1], [200, 2], [300, 3]]); } finally { w.done(); }
});

// 4. model, tokens, times
test('model name and token totals come from child usage lines', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), model(w, 1, 'x', 'claude-sonnet-5-5', 100, 20) + model(w, 2, 'y', 'claude-sonnet-5-5', 50, 10));
  try { const s = load(w).subagents[0]; assert.deepEqual([s.model, s.inputTokens, s.outputTokens, s.tokens], ['claude-sonnet-5-5', 150, 30, 180]); } finally { w.done(); }
});
test('unknown model and tokens are zero or empty, never undefined', () => {
  const w = mk(); w.add(task(w, 'c1', 'A'));
  try { const s = load(w).subagents[0]; assert.deepEqual([s.model, s.inputTokens, s.outputTokens, s.tokens, s.startedAt > 0, s.endedAt, s.durationMs], ['', 0, 0, 0, true, 0, 0]); } finally { w.done(); }
});
test('model falls back to the meta file', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1', { model: 'claude-opus-4-8' }), w.text('x', true).replace('"usage"', '"u"'));
  try { const s = load(w).subagents[0]; assert.equal(typeof s.model, 'string'); } finally { w.done(); }
});
test('every numeric stat is a finite number on every agent', () => {
  const w = family(3); w.add(task(w, 'cx', 'running'));
  try { for (const a of load(w).agents) for (const k of ['startedAt', 'endedAt', 'durationMs', 'toolUses', 'tokens', 'inputTokens', 'outputTokens']) assert.ok(Number.isFinite(a[k]), k + ' ' + a[k]); } finally { w.done(); }
});
test('duration is end minus start for a finished child', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), w.text('x', true)); w.add(w.res('c1', 'd', { agentId: 'aa', totalDurationMs: 7000 }));
  try { const s = load(w).subagents[0]; assert.equal(s.durationMs, 7000); assert.equal(s.endedAt - s.startedAt, 7000); } finally { w.done(); }
});
test('without totalDurationMs the end falls back to the last child line', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), w.text('x', true) + w.text('y', true)); w.add(w.res('c1', 'd', {}));
  try { const s = load(w).subagents[0]; assert.ok(s.durationMs >= 0); assert.ok(s.endedAt >= s.startedAt); } finally { w.done(); }
});
test('running child has duration 0 and endedAt 0', () => {
  const w = mk(); w.add(task(w, 'c1', 'A'));
  try { const s = load(w).subagents[0]; assert.deepEqual([s.durationMs, s.endedAt], [0, 0]); } finally { w.done(); }
});
test('items with new stat fields still satisfy itemProblem', () => {
  const w = family(2);
  try { ok(load(w).subagents); ok(load(w).agents); } finally { w.done(); }
});

// 5. background
// real shape (RECORDS.txt): origin.kind task-notification, tags task-id, tool-use-id, output-file, status, summary, note, result, usage
const note = (w, id, status, summary = 'all done', tu = 'c1') => w.L({ type: 'user', origin: { kind: 'task-notification', producer: 'session-task', runId: 'r1' }, promptSource: 'system', turnOrigin: 'task_notification', message: { role: 'user', content: `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>${tu}</tool-use-id>\n<output-file>/o</output-file>\n<status>${status}</status>\n<summary>${summary}</summary>\n<result>r</result>\n<usage><subagent_tokens>900</subagent_tokens><tool_uses>3</tool_uses><duration_ms>5000</duration_ms></usage>\n</task-notification>` } });
const bgFixture = (n) => { const w = mk(); w.add(task(w, 'c1', 'Bg', { run_in_background: true })); w.child('aa', meta('Explore', 'Bg', 'c1'), w.text('working', true)); w.add(w.res('c1', 'Async agent launched', { agentId: 'aa', isAsync: true })); if (n) w.add(n(w)); return w; };
test('background launch result does not end the subagent', () => {
  const w = bgFixture(); try { const s = load(w).subagents[0]; assert.deepEqual([s.background, s.status, s.notice], [true, 'running', null]); } finally { w.done(); }
});
test('completion notice marks a background subagent done and attaches the summary', () => {
  const w = bgFixture((x) => note(x, 'aa', 'completed', 'found 3 bugs')); try { const s = load(w).subagents[0]; assert.deepEqual([s.status, s.notice.summary, s.notice.status], ['ok', 'found 3 bugs', 'ok']); assert.ok(s.endedAt > s.startedAt); } finally { w.done(); }
});
test('failed notice marks a background subagent as error', () => {
  const w = bgFixture((x) => note(x, 'aa', 'failed', 'crashed')); try { assert.equal(load(w).subagents[0].status, 'error'); } finally { w.done(); }
});
test('notice for another task does not touch this one', () => {
  const w = bgFixture((x) => note(x, 'other', 'completed', 'all done', 'cX')); try { assert.equal(load(w).subagents[0].status, 'running'); } finally { w.done(); }
});
test('foreground subagent is not marked background', () => {
  const w = family(1); try { assert.deepEqual([load(w).subagents[0].background, load(w).subagents[0].notice], [false, null]); } finally { w.done(); }
});
test('background notice can link by tool-use-id', () => {
  const w = bgFixture((x) => x.L({ type: 'user', message: { content: '<task-notification><tool-use-id>c1</tool-use-id><status>completed</status><summary>s</summary></task-notification>' } }));
  try { assert.equal(load(w).subagents[0].status, 'ok'); } finally { w.done(); }
});
test('live: notice arriving later flips running to ok', async () => {
  const w = bgFixture(); let list = []; const o = open(w, { onUpdate: (l) => { list = l; } });
  try { await until(() => list, (l) => l[0]?.status === 'running'); w.add(note(w, 'aa', 'completed')); await until(() => list, (l) => l[0].status === 'ok'); assert.equal(list[0].notice.summary, 'all done'); } finally { o.close(); w.done(); }
});

// 6. nesting
const chain = (depth) => {
  const w = mk(); w.add(task(w, 't0', 'L1'));
  for (let d = 1; d <= depth; d++) {
    const lines = d < depth ? task(w, 't' + d, 'L' + (d + 1)).replace(/"isSidechain":false/, '"isSidechain":true') : w.text('leaf', true);
    w.child('g' + d, meta('Explore', 'L' + d, 't' + (d - 1), d > 1 ? { parentAgentId: 'g' + (d - 1) } : {}), lines);
  }
  return w;
};
test('three levels: depth and parent links are right', () => {
  const w = chain(3); try { const a = load(w).agents; assert.deepEqual(a.map((x) => [x.agentId, x.parentId, x.depth]), [['g1', null, 1], ['g2', 'g1', 2], ['g3', 'g2', 3]]); } finally { w.done(); }
});
test('four levels: tree nests four deep and reaches the leaf', () => {
  const w = chain(4); try { const t = load(w).subagents[0]; assert.equal(t.items[0].items[0].items[0].items[0].text, 'leaf'); assert.equal(load(w).agents.at(-1).depth, 4); ok(load(w).subagents); } finally { w.done(); }
});
test('parent link also derives from the spawning transcript when meta has no parentAgentId', () => {
  const w = mk(); w.add(task(w, 'c1', 'Outer').replace('', ''));
  w.child('aa', meta('Explore', 'Outer', 'c1'), task(w, 'n1', 'Inner').replace(/"isSidechain":false/, '"isSidechain":true')); w.child('bb', meta('Explore', 'Inner', 'n1'), w.text('x', true));
  try { assert.equal(load(w).agents.find((a) => a.agentId === 'bb').parentId, 'aa'); } finally { w.done(); }
});
test('cycle in parentAgentId does not crash or loop', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1', { parentAgentId: 'bb' }), w.text('x', true)); w.child('bb', meta('Explore', 'B', 'n1', { parentAgentId: 'aa' }), w.text('y', true));
  try { const a = load(w).agents; assert.equal(a.length, 2); assert.ok(a.some((x) => x.cycle)); assert.ok(a.every((x) => Number.isFinite(x.depth))); } finally { w.done(); }
});
test('an agent that names itself as parent is treated as a root', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1', { parentAgentId: 'aa' }), w.text('x', true));
  try { const a = load(w).agents[0]; assert.deepEqual([a.parentId, a.depth], [null, 1]); } finally { w.done(); }
});
test('missing parent agent: child is kept as an orphan root', () => {
  const w = mk(); w.child('bb', meta('Explore', 'B', 'n9', { parentAgentId: 'ghost' }), w.text('y', true));
  try { const a = load(w).agents[0]; assert.deepEqual([a.parentId, a.depth, a.orphan], [null, 1, true]); } finally { w.done(); }
});
test('self-referencing spawn (child file spawns its own id) stops at max depth', () => {
  const w = mk(); w.add(task(w, 'c1', 'A'));
  w.child('aa', meta('Explore', 'A', 'c1'), task(w, 'n1', 'Loop').replace(/"isSidechain":false/, '"isSidechain":true'));
  w.add(w.res('c1', 'd', { agentId: 'aa' }));
  fs.appendFileSync(path.join(w.sub, 'agent-aa.jsonl'), w.res('n1', 'd', { agentId: 'aa' }, true));
  try { const r = load(w); assert.equal(r.subagents.length, 1); assert.ok(JSON.stringify(r.subagents).length < 5e6); } finally { w.done(); }
});

// 7. groups
const grouped = () => family(5, (i) => ({ meta: { group: 'review', phase: i < 3 ? 'scan' : 'fix' } }));
test('subagents sharing a group form one block with phase counts', () => {
  const w = grouped(); try { const g = load(w).groups; assert.equal(g.length, 1); assert.deepEqual([g[0].group, g[0].total, g[0].ok], ['review', 5, 5]); assert.deepEqual(g[0].phases.map((p) => [p.phase, p.total]), [['scan', 3], ['fix', 2]]); assert.equal(g[0].agentIds.length, 5); } finally { w.done(); }
});
test('phase counts split running, ok and error', () => {
  const w = mk(); for (let i = 0; i < 3; i++) { w.add(task(w, 'c' + i, 'D' + i)); w.child('a' + i, meta('Explore', 'D' + i, 'c' + i, { group: 'wf', phase: 'p1' }), w.text('t', true)); }
  w.add(w.res('c0', 'ok', {})); w.add(w.L({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'c1', is_error: true, content: 'x' }] } }));
  try { const p = load(w).groups[0].phases[0]; assert.deepEqual([p.total, p.ok, p.error, p.running], [3, 1, 1, 1]); } finally { w.done(); }
});
test('two groups keep first-seen order and agents without a group are left out', () => {
  const w = family(4, (i) => ({ meta: i === 3 ? {} : { group: i === 1 ? 'b' : i === 0 ? 'b' : 'a' } }));
  try { const g = load(w).groups; assert.deepEqual(g.map((x) => [x.group, x.total]), [['b', 2], ['a', 1]]); } finally { w.done(); }
});
test('group label can come from the Task input', () => {
  const w = family(2, () => ({ input: { group: 'fromInput', phase: 'p' } })); try { assert.equal(load(w).groups[0].total, 2); assert.equal(load(w).groups[0].group, 'fromInput'); } finally { w.done(); }
});
test('no labels: no groups', () => { const w = family(3); try { assert.deepEqual(load(w).groups, []); } finally { w.done(); } });
test('group agents carry group and phase fields', () => {
  const w = grouped(); try { assert.deepEqual([load(w).agents[0].group, load(w).agents[0].phase, load(w).agents[4].phase], ['review', 'scan', 'fix']); } finally { w.done(); }
});

// 8. permission prompts
const permFixture = () => { const w = mk(); w.add(task(w, 'c1', 'A') + task(w, 'c2', 'B')); w.child('aa', meta('Explore', 'A', 'c1'), w.use('x1', 'Read', { file_path: '/p/a.js' }, true)); w.child('bb', meta('Explore', 'B', 'c2'), w.use('x2', 'Bash', { command: 'rm -rf build' }, true)); return w; };
test('permission prompt titled from the <type> agent: two of that type, the one running the named tool', () => {
  const w = permFixture(); const o = open(w, { watch: false });
  try { const p = o.attributePrompt({ promptId: 'p1', type: 'permission', title: 'Bash command · from the Explore agent', body: 'rm -rf build', options: [], selected: 0 }); assert.deepEqual([p.subagentId, p.parentCallId, p.subagentType], ['bb', 'c2', 'Explore']); assert.equal(p.promptId, 'p1'); } finally { o.close(); w.done(); }
});
test('prompt naming the agent id wins over tool matching', () => {
  const w = permFixture(); const o = open(w, { watch: false });
  try { assert.equal(o.attributePrompt({ promptId: 'p', type: 'permission', title: 'agent aa wants Bash', options: [], selected: 0 }).subagentId, 'aa'); } finally { o.close(); w.done(); }
});
test('single running agent of the named type gets the prompt', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), w.use('x1', 'Edit', { file_path: '/q' }, true));
  const o = open(w, { watch: false }); try { assert.equal(o.attributePrompt({ promptId: 'p', type: 'permission', title: 'Edit file · from the Explore agent', options: [], selected: 0 }).subagentId, 'aa'); } finally { o.close(); w.done(); }
});
test('prompt without a "from the" title and two candidates is not guessed', () => {
  const w = permFixture(); const o = open(w, { watch: false });
  try { assert.equal(o.attributePrompt({ promptId: 'p', type: 'permission', title: 'Do you want to proceed?', options: [], selected: 0 }).subagentId, null); } finally { o.close(); w.done(); }
});
test('prompt with no running subagent keeps its fields and null subagent', () => {
  const w = family(1); const o = open(w, { watch: false });
  try { const p = o.attributePrompt({ promptId: 'p', type: 'permission', title: 'x', options: [], selected: 0 }); assert.deepEqual([p.subagentId, p.parentCallId, p.title], [null, null, 'x']); } finally { o.close(); w.done(); }
});
test('finished subagent is never blamed for a prompt', () => {
  const w = permFixture(); w.add(w.res('c1', 'd', {})); w.add(w.res('c2', 'd', {})); const o = open(w, { watch: false });
  try { assert.equal(o.attributePrompt({ promptId: 'p', type: 'permission', title: 'Allow Bash?', options: [], selected: 0 }).subagentId, null); } finally { o.close(); w.done(); }
});

// 9. malformed input
test('malformed line in a child is skipped and counted, later lines still load', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), w.text('before', true) + '{not json\n' + w.text('after', true));
  try { const r = load(w); assert.equal(r.skipped, 1); assert.deepEqual(r.transcript('aa').filter((i) => i.kind === 'assistant').map((i) => i.text), ['before', 'after']); } finally { w.done(); }
});
test('truncated last line is counted in load(), no throw', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), w.text('ok', true) + '{"type":"assistant","mess');
  try { const r = load(w); assert.equal(r.skipped, 1); assert.equal(r.subagents[0].items.length, 1); } finally { w.done(); }
});
test('truncated last line is not counted while live (it is still being written)', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), w.text('ok', true) + '{"type":"assis');
  const o = open(w, { watch: false }); const live = createSubagentTracker({ fs }).open(w.parent, { watch: true });
  try { assert.equal(live.skipped(), 0); assert.equal(o.skipped(), 1); } finally { live.close(); o.close(); w.done(); }
});
test('empty child file is counted as skipped', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), '');
  try { const r = load(w); assert.equal(r.skipped, 1); assert.equal(r.subagents[0].items.length, 0); assert.equal(r.subagents[0].status, 'running'); } finally { w.done(); }
});
test('missing meta file: child still shown, counted as skipped', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.add(w.res('c1', 'd', { agentId: 'aa' })); fs.mkdirSync(w.sub, { recursive: true }); fs.writeFileSync(path.join(w.sub, 'agent-aa.jsonl'), w.text('x', true));
  try { const r = load(w); assert.equal(r.skipped, 1); assert.equal(r.subagents[0].items.length, 1); } finally { w.done(); }
});
test('corrupt meta json does not throw and is counted', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); fs.mkdirSync(w.sub, { recursive: true }); fs.writeFileSync(path.join(w.sub, 'agent-aa.meta.json'), '{bad'); fs.writeFileSync(path.join(w.sub, 'agent-aa.jsonl'), w.text('x', true));
  try { assert.ok(load(w).skipped >= 1); } finally { w.done(); }
});
test('a line that parses but is not an object does not throw', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), 'null\n42\n"str"\n[]\n' + w.text('ok', true));
  try { const r = load(w); assert.equal(r.subagents[0].items.length, 1); assert.equal(typeof r.skipped, 'number'); } finally { w.done(); }
});
test('garbage in the parent file does not throw', () => {
  const w = mk(); w.add('garbage\n{"x":\n' + task(w, 'c1', 'A'));
  try { const r = load(w); assert.equal(r.subagents.length, 1); assert.ok(r.skipped >= 2); } finally { w.done(); }
});
test('clean session reports zero skipped', () => { const w = family(3); try { assert.equal(load(w).skipped, 0); } finally { w.done(); } });
test('binary junk in a child file does not throw', () => {
  const w = mk(); w.add(task(w, 'c1', 'A')); w.child('aa', meta('Explore', 'A', 'c1'), Buffer.from([0xff, 0xfe, 0, 10]).toString('latin1'));
  try { assert.doesNotThrow(() => load(w)); } finally { w.done(); }
});
