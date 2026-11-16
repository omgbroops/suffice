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

test('child file appears after the parent call, grows live, then the result closes it', async () => {
  const w = mk();
  w.add(w.use('c1', 'Task', { subagent_type: 'Explore', description: 'Look around', prompt: 'p' }));
  const t = track(w.parent);
  try {
    let l = await until(t.get, (x) => x.length === 1);
    assert.equal(l[0].status, 'running'); assert.deepEqual(l[0].items, []); assert.equal(l[0].description, 'Look around'); assert.equal(l[0].type, 'Explore');
    w.child('aa', { agentType: 'Explore', description: 'Look around', toolUseId: 'c1' }, w.use('x1', 'Read', { file_path: '/p/a.js' }, true));
    l = await until(t.get, (x) => x[0].items.length === 1);
    assert.equal(l[0].toolUses, 1); assert.equal(l[0].lastAction, l[0].items[0].title); assert.ok(l[0].childTranscriptPath);
    fs.appendFileSync(path.join(w.sub, 'agent-aa.jsonl'), w.res('x1', 'ok', {}, true) + w.text('Found it.\nmore', true));
    l = await until(t.get, (x) => x[0].items.length === 2);
    assert.equal(l[0].lastAction, 'Found it.'); assert.equal(l[0].items[1].sidechain, true);
    w.add(w.res('c1', 'done', { agentId: 'aa', totalToolUseCount: 7, totalTokens: 1234, totalDurationMs: 9000 }));
    l = await until(t.get, (x) => x[0].status === 'ok');
    assert.deepEqual([l[0].toolUses, l[0].tokens, l[0].endedAt - l[0].startedAt], [7, 1234, 9000]);
    walk(l, (i) => assert.equal(itemProblem(i), null, JSON.stringify(i)));
  } finally { t.stop(); w.done(); }
});

test('two parallel children link by meta toolUseId', async () => {
  const w = mk();
  w.add(w.use('c1', 'Task', { subagent_type: 'Explore', description: 'One', prompt: 'p' }) + w.use('c2', 'Task', { subagent_type: 'Plan', description: 'Two', prompt: 'p' }));
  w.child('aa', { agentType: 'Explore', description: 'One', toolUseId: 'c1' }, w.text('from one', true));
  w.child('bb', { agentType: 'Plan', description: 'Two', toolUseId: 'c2' }, w.text('from two', true) + w.use('y', 'Bash', { command: 'ls' }, true));
  const t = track(w.parent);
  try {
    const l = await until(t.get, (x) => x.length === 2 && x.every((s) => s.items.length));
    assert.deepEqual(l.map((s) => s.items[0].text ?? s.items[0].title), ['from one', 'from two']);
    assert.equal(l[1].items.length, 2);
    walk(l, (i) => assert.equal(itemProblem(i), null));
  } finally { t.stop(); w.done(); }
});

test('nested subagent: child file holds its own Task, grandchild links by toolUseId', async () => {
  const w = mk();
  w.add(w.use('c1', 'Task', { subagent_type: 'general-purpose', description: 'Outer', prompt: 'p' }));
  w.child('aa', { agentType: 'general-purpose', description: 'Outer', toolUseId: 'c1', spawnDepth: 1 }, w.use('n1', 'Task', { subagent_type: 'Explore', description: 'Inner', prompt: 'p' }, true));
  w.child('bb', { agentType: 'Explore', description: 'Inner', toolUseId: 'n1', spawnDepth: 2, parentAgentId: 'aa' }, w.use('z', 'Grep', { pattern: 'x' }, true));
  const t = track(w.parent);
  try {
    const l = await until(t.get, (x) => x[0]?.items[0]?.items?.length === 1);
    assert.equal(l[0].items[0].kind, 'subagent'); assert.equal(l[0].items[0].description, 'Inner'); assert.equal(l[0].items[0].items[0].kind, 'tool');
    walk(l, (i) => assert.equal(itemProblem(i), null));
  } finally { t.stop(); w.done(); }
});

test('missing child transcript: items empty, summary from the parent result', async () => {
  const w = mk();
  w.add(w.use('c1', 'Task', { subagent_type: 'Explore', description: 'Gone', prompt: 'p' }) + w.res('c1', 'result', { agentId: 'zz', totalToolUseCount: 4, totalTokens: 500, totalDurationMs: 2000 }));
  const t = track(w.parent);
  try {
    const l = await until(t.get, (x) => x[0]?.status === 'ok');
    assert.deepEqual([l[0].items, l[0].toolUses, l[0].tokens, l[0].childTranscriptPath], [[], 4, 500, undefined]);
    assert.equal(itemProblem(l[0]), null);
  } finally { t.stop(); w.done(); }
});

test('a half-written line waits for its newline; a failed result is error', async () => {
  const w = mk();
  w.add(w.use('c1', 'Task', { subagent_type: 'Explore', description: 'D', prompt: 'p' }));
  const line = w.text('whole', true);
  w.child('aa', { agentType: 'Explore', description: 'D', toolUseId: 'c1' }, line.slice(0, 30));
  const t = track(w.parent);
  try {
    await until(t.get, (x) => x.length === 1);
    assert.deepEqual(t.get()[0].items, []);
    fs.appendFileSync(path.join(w.sub, 'agent-aa.jsonl'), line.slice(30));
    await until(t.get, (x) => x[0].items.length === 1);
    w.add(w.L({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'boom', is_error: true }] } }));
    assert.equal((await until(t.get, (x) => x[0].status === 'error'))[0].status, 'error');
  } finally { t.stop(); w.done(); }
});
