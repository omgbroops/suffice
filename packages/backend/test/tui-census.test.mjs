// One test per record-shape class from the transcript census (fixtures are structure-only stand-ins).
// Shapes the census saw dropped, invalid or throwing in real transcripts are test.todo, not weakened asserts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClaudeMapper, mapperHealth } from '../src/tui/claude.mjs';
import { itemProblem } from '../src/tui/model.mjs';

const dir = new URL('./fixtures/tui-census/', import.meta.url);
const index = JSON.parse(fs.readFileSync(new URL('index.json', dir), 'utf8'));
const fixture = (n) => JSON.parse(fs.readFileSync(new URL(`${n}.json`, dir), 'utf8'));

const classes = new Map();
for (const e of index) {
  const c = e.cls.join(' ');
  if (!classes.has(c)) classes.set(c, []);
  classes.get(c).push(e);
}

for (const [cls, entries] of classes) {
  const ok = entries.filter((e) => e.ok);
  if (ok.length) {
    test(`census class ${cls}: ${ok.length} shapes map without throwing to valid items`, () => {
      for (const e of ok) {
        const m = createClaudeMapper({ includeSidechain: true });
        const st = m.newState();
        const items = m.mapLine(fixture(e.n), st);
        assert.equal(st.errors.count, 0, `shape ${e.n} threw`);
        for (const it of items) assert.equal(itemProblem(it), null, `shape ${e.n} item invalid`);
      }
    });
  }
  for (const e of entries.filter((x) => !x.ok)) test.todo(`census shape ${e.n} (real ${e.real}): ${e.shape.join(' ')}`);
}

// ---- dropped shapes (COVERAGE top table): each is mapped to state/items or counted in state.skipped ----
const mk = (o = {}) => { const m = createClaudeMapper(o); const st = m.newState(); return { m, st, feed: (rec) => m.mapLine({ timestamp: '2026-01-01T00:00:00.000Z', ...rec }, st) }; };
const modeRec = (mode) => ({ type: 'mode', mode, sessionId: 's1' });
const permRec = (permissionMode) => ({ type: 'permission-mode', permissionMode, sessionId: 's1' });
const fileAtt = (filename, extra = {}) => ({ type: 'attachment', uuid: `u-${filename}`, attachment: { type: 'file', filename, content: { type: 'text', file: {} } }, ...extra });

test('mode: first value sets state.uiMode with no notice', () => {
  const { feed, st } = mk();
  assert.deepEqual(feed(modeRec('normal')), []);
  assert.equal(st.uiMode, 'normal');
});
test('mode: a repeated value emits nothing and counts skipped.mode.unchanged', () => {
  const { feed, st } = mk();
  feed(modeRec('normal'));
  assert.deepEqual(feed(modeRec('normal')), []);
  assert.equal(st.skipped['mode.unchanged'], 1);
});
test('mode: a changed value updates state and emits no notice (view-mode axis)', () => {
  const { feed, st } = mk();
  feed(modeRec('normal'));
  assert.deepEqual(feed(modeRec('focus')), []);
  assert.equal(st.uiMode, 'focus');
  assert.equal(st.skipped['mode.unchanged'] ?? 0, 0);
});
test('mode: empty or missing value is counted as skipped.mode.empty and keeps state', () => {
  const { feed, st } = mk();
  feed(modeRec('normal'));
  feed({ type: 'mode' });
  feed(modeRec(''));
  assert.equal(st.skipped['mode.empty'], 2);
  assert.equal(st.uiMode, 'normal');
});
test('mode: does not touch the permission mode', () => {
  const { feed, st } = mk();
  feed(modeRec('normal'));
  assert.equal(st.mode, null);
});
test('mode: reaches meta.uiMode for the mode picker', () => {
  const { m, feed, st } = mk();
  feed(modeRec('normal'));
  assert.equal(m.meta(st).uiMode, 'normal');
});

test('permission-mode: first value sets state.mode with no notice', () => {
  const { feed, st } = mk();
  assert.deepEqual(feed(permRec('default')), []);
  assert.equal(st.mode, 'default');
});
test('permission-mode: change emits one valid mode_changed notice naming both modes', () => {
  const { feed, st } = mk();
  feed(permRec('default'));
  const out = feed(permRec('plan'));
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'mode_changed');
  assert.equal(itemProblem(out[0]), null);
  assert.match(out[0].text, /Manual/);
  assert.match(out[0].text, /Plan/);
  assert.equal(st.mode, 'plan');
});
test('permission-mode: repeat is counted as skipped.permission-mode.unchanged', () => {
  const { feed, st } = mk();
  feed(permRec('plan'));
  assert.deepEqual(feed(permRec('plan')), []);
  assert.equal(st.skipped['permission-mode.unchanged'], 1);
});
test('permission-mode: empty value is counted as skipped.permission-mode.empty', () => {
  const { feed, st } = mk();
  feed(permRec(''));
  assert.equal(st.skipped['permission-mode.empty'], 1);
  assert.equal(st.mode, null);
});
test('permission-mode: exposed on meta.mode', () => {
  const { m, feed, st } = mk();
  feed(permRec('auto'));
  assert.equal(m.meta(st).mode, 'auto');
});
test('permission-mode: a user line carrying the same value does not count as a skip', () => {
  const { feed, st } = mk();
  feed(permRec('plan'));
  feed({ type: 'user', uuid: 'u1', permissionMode: 'plan', message: { content: 'hi' } });
  assert.equal(st.skipped['permission-mode.unchanged'] ?? 0, 0);
});
test('permission-mode: A to B to A emits two notices', () => {
  const { feed } = mk();
  feed(permRec('default'));
  assert.equal(feed(permRec('plan')).length + feed(permRec('default')).length, 2);
});
test('permission-mode and mode move independently', () => {
  const { feed, st } = mk();
  feed(modeRec('normal')); feed(permRec('plan'));
  assert.equal(st.uiMode, 'normal'); assert.equal(st.mode, 'plan');
});

test('ai-title: sets state.title, no chat item', () => {
  const { feed, st } = mk();
  assert.deepEqual(feed({ type: 'ai-title', aiTitle: 'First' }), []);
  assert.equal(st.title, 'First');
});
test('ai-title: latest wins', () => {
  const { feed, st, m } = mk();
  feed({ type: 'ai-title', aiTitle: 'First' }); feed({ type: 'ai-title', aiTitle: 'Second' });
  assert.equal(st.title, 'Second');
  assert.equal(m.meta(st).title, 'Second');
});
test('ai-title: same title again is counted as skipped.ai-title.unchanged', () => {
  const { feed, st } = mk();
  feed({ type: 'ai-title', aiTitle: 'T' }); feed({ type: 'ai-title', aiTitle: 'T' });
  assert.equal(st.skipped['ai-title.unchanged'], 1);
});
test('ai-title: empty title is counted as skipped.ai-title.empty and keeps the old one', () => {
  const { feed, st } = mk();
  feed({ type: 'ai-title', aiTitle: 'T' }); feed({ type: 'ai-title', aiTitle: '' });
  assert.equal(st.skipped['ai-title.empty'], 1);
  assert.equal(st.title, 'T');
});

test('agent-name: sets the session agent name, no chat item', () => {
  const { feed, st, m } = mk();
  assert.deepEqual(feed({ type: 'agent-name', agentName: 'Planner', sessionId: 's1' }), []);
  assert.equal(st.agentName, 'Planner');
  assert.equal(m.meta(st).agentName, 'Planner');
});
test('agent-name: with an agentId it names that subagent, not the session', () => {
  const { feed, st, m } = mk({ includeSidechain: true });
  feed({ type: 'agent-name', agentName: 'Main' });
  feed({ type: 'agent-name', agentName: 'Reviewer', agentId: 'a1', isSidechain: true });
  assert.equal(st.agentName, 'Main');
  assert.deepEqual(st.agentNames, { a1: 'Reviewer' });
  assert.deepEqual(m.meta(st).agentNames, { a1: 'Reviewer' });
});
test('agent-name: latest wins per agent', () => {
  const { feed, st } = mk();
  feed({ type: 'agent-name', agentName: 'A' }); feed({ type: 'agent-name', agentName: 'B' });
  assert.equal(st.agentName, 'B');
});
test('agent-name: repeat is counted as skipped.agent-name.unchanged', () => {
  const { feed, st } = mk();
  feed({ type: 'agent-name', agentName: 'A' }); feed({ type: 'agent-name', agentName: 'A' });
  assert.equal(st.skipped['agent-name.unchanged'], 1);
});
test('agent-name: empty is counted as skipped.agent-name.empty', () => {
  const { feed, st } = mk();
  feed({ type: 'agent-name', agentName: '' });
  assert.equal(st.skipped['agent-name.empty'], 1);
});

test('file attachment: attaches to the user item it follows, name only from the path', () => {
  const { feed } = mk();
  feed({ type: 'user', uuid: 'u1', message: { content: 'look' } });
  const out = feed(fileAtt('/x/y/a.txt'));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'user');
  assert.deepEqual(out[0].attachments.map((a) => [a.type, a.name]), [['file', 'a.txt']]);
  assert.equal(itemProblem(out[0]), null);
});
test('file attachment: arriving before its user message is held and attached to the next one', () => {
  const { feed, st } = mk();
  assert.deepEqual(feed(fileAtt('/x/b.txt')), []);
  assert.equal(st.pendingAtt.length, 1);
  const out = feed({ type: 'user', uuid: 'u2', message: { content: 'hi' } });
  assert.equal(out[0].attachments[0].name, 'b.txt');
  assert.equal(st.pendingAtt.length, 0);
});
test('file attachment: a second file adds to the same user item', () => {
  const { feed } = mk();
  feed({ type: 'user', uuid: 'u1', message: { content: 'look' } });
  feed(fileAtt('/x/a.txt'));
  const out = feed(fileAtt('/x/c.txt'));
  assert.deepEqual(out[0].attachments.map((a) => a.name), ['a.txt', 'c.txt']);
});
test('file attachment: duplicate is counted as skipped.attachment.file.dup', () => {
  const { feed, st } = mk();
  feed({ type: 'user', uuid: 'u1', message: { content: 'look' } });
  feed(fileAtt('/x/a.txt'));
  assert.deepEqual(feed(fileAtt('/x/a.txt')), []);
  assert.equal(st.skipped['attachment.file.dup'], 1);
});
test('file attachment: duplicate while pending is counted too', () => {
  const { feed, st } = mk();
  feed(fileAtt('/x/a.txt')); feed(fileAtt('/x/a.txt'));
  assert.equal(st.pendingAtt.length, 1);
  assert.equal(st.skipped['attachment.file.dup'], 1);
});
test('file attachment: no filename is counted as skipped.attachment.file.nameless', () => {
  const { feed, st } = mk();
  assert.deepEqual(feed({ type: 'attachment', attachment: { type: 'file' } }), []);
  assert.equal(st.skipped['attachment.file.nameless'], 1);
});
test('file attachment: only name, type and path are carried (no file content)', () => {
  const { feed } = mk();
  feed({ type: 'user', uuid: 'u1', message: { content: 'x' } });
  const [it] = feed(fileAtt('/x/a.txt'));
  assert.deepEqual(Object.keys(it.attachments[0]).sort(), ['name', 'path', 'type']);
});
test('sidechain file attachment: dropped from the main chat and counted when sidechains are off', () => {
  const { feed, st } = mk();
  assert.deepEqual(feed(fileAtt('/x/a.txt', { isSidechain: true, agentId: 'a1' })), []);
  assert.equal(st.sidechainSkipped, 1);
  assert.equal(st.pendingAtt.length, 0);
});
test('sidechain file attachment: lands on the subagent transcript, flagged sidechain, when sidechains are on', () => {
  const { feed } = mk({ includeSidechain: true });
  feed({ type: 'user', uuid: 'u1', isSidechain: true, agentId: 'a1', message: { content: 'sub task' } });
  const out = feed(fileAtt('/x/a.txt', { isSidechain: true, agentId: 'a1' }));
  assert.equal(out.length, 1);
  assert.equal(out[0].sidechain, true);
  assert.equal(out[0].attachments[0].name, 'a.txt');
});

test('task_status: new task goes to meta.backgroundTasks', () => {
  const { feed, st, m } = mk();
  const out = feed({ type: 'attachment', uuid: 'u1', attachment: { type: 'task_status', taskId: 't1', description: 'build', status: 'running' } });
  assert.deepEqual(out, []);
  assert.deepEqual(m.meta(st).backgroundTasks, [{ id: 't1', label: 'build', status: 'running' }]);
});
test('task_status: status change updates the task', () => {
  const { feed, st } = mk();
  const rec = (status) => ({ type: 'attachment', uuid: 'u1', attachment: { type: 'task_status', taskId: 't1', description: 'build', status } });
  feed(rec('running')); feed(rec('completed'));
  assert.equal(st.tasks.t1.status, 'completed');
  assert.equal(st.skipped['attachment.task_status.unchanged'] ?? 0, 0);
});
test('task_status: identical repeat is counted as skipped.attachment.task_status.unchanged', () => {
  const { feed, st } = mk();
  const r = { type: 'attachment', uuid: 'u1', attachment: { type: 'task_status', taskId: 't1', description: 'build', status: 'running' } };
  feed(r); feed(r);
  assert.equal(st.skipped['attachment.task_status.unchanged'], 1);
});
test('task_status sidechain: skipped from the main chat and counted when sidechains are off', () => {
  const { feed, st } = mk();
  feed({ type: 'attachment', isSidechain: true, attachment: { type: 'task_status', taskId: 't1', status: 'running' } });
  assert.equal(st.sidechainSkipped, 1);
  assert.deepEqual(st.tasks, {});
});

test('cost-state: updates costUsd; the same value again is counted as skipped.cost-state.unchanged', () => {
  const { feed, st } = mk();
  feed({ type: 'cost-state', totalCostUSD: 1.5 }); feed({ type: 'cost-state', totalCostUSD: 1.5 });
  assert.equal(st.costUsd, 1.5);
  assert.equal(st.skipped['cost-state.unchanged'], 1);
});
test('cost-state: a non-number is counted as skipped and keeps the old cost', () => {
  const { feed, st } = mk();
  feed({ type: 'cost-state', totalCostUSD: 2 }); feed({ type: 'cost-state', totalCostUSD: 'x' });
  assert.equal(st.costUsd, 2);
  assert.equal(st.skipped['cost-state.unchanged'], 1);
});

test('user string: empty text is counted as skipped.user.empty, no item', () => {
  const { feed, st } = mk();
  assert.deepEqual(feed({ type: 'user', uuid: 'u1', message: { content: '' } }), []);
  assert.equal(st.skipped['user.empty'], 1);
});
test('user string: whitespace-only text is counted as skipped.user.empty', () => {
  const { feed, st } = mk();
  feed({ type: 'user', uuid: 'u1', message: { content: '  \n ' } });
  assert.equal(st.skipped['user.empty'], 1);
});
test('user string: empty local-command-stdout is counted as skipped.user.empty-stdout', () => {
  const { feed, st } = mk();
  assert.deepEqual(feed({ type: 'user', uuid: 'u1', message: { content: '<local-command-stdout></local-command-stdout>' } }), []);
  assert.equal(st.skipped['user.empty-stdout'], 1);
});
test('user string: normal text still becomes a user item', () => {
  const { feed } = mk();
  assert.equal(feed({ type: 'user', uuid: 'u1', message: { content: 'hello' } })[0].text, 'hello');
});

test('replayed assistant text line is counted as skipped.dup.assistant', () => {
  const { feed, st } = mk();
  const r = { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } };
  assert.equal(feed(r).length, 1);
  assert.deepEqual(feed(r), []);
  assert.equal(st.skipped['dup.assistant'], 1);
});
test('replayed thinking line is counted as skipped.dup.thinking', () => {
  const { feed, st } = mk();
  const r = { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hm' }] } };
  feed(r); feed(r);
  assert.equal(st.skipped['dup.thinking'], 1);
});
test('replayed api_error system line is counted as skipped.dup.notice', () => {
  const { feed, st } = mk();
  const r = { type: 'system', subtype: 'api_error', uuid: 'e1', error: { message: 'boom' } };
  feed(r); feed(r);
  assert.equal(st.skipped['dup.notice'], 1);
});
test('mapperHealth exposes skipped counts next to dropped', () => {
  const { feed, st } = mk();
  feed(modeRec('normal')); feed(modeRec('normal'));
  assert.deepEqual(mapperHealth(st).skipped, { 'mode.unchanged': 1 });
  assert.ok('dropped' in mapperHealth(st));
});
test('state.skipped exists on a fresh state and on an older persisted state after mapLine', () => {
  const { m, st } = mk();
  assert.deepEqual(st.skipped, {});
  const old = { ...m.newState() }; delete old.skipped; delete old.agentNames;
  m.mapLine({ type: 'mode', mode: 'normal' }, old);
  assert.equal(old.uiMode, 'normal');
  m.mapLine({ type: 'mode', mode: 'normal' }, old);
  assert.equal(old.skipped['mode.unchanged'], 1);
});

// No silent drops: every census fixture, fed once into a fresh state, must produce an item,
// change state, or add to dropped / skipped / sidechainSkipped.
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
const sig = (s) => JSON.stringify([s.title, s.agentName, s.agentNames, s.costUsd, s.uiMode, s.fileHistory, s.results.size, s.calls.size, s.emitted.size,
  s.queue.length, s.pendingAtt.length, s.tasks, s.model, s.mode, s.cwd, s.branch, s.sessionId, s.ctxTokens]);
for (const includeSidechain of [false, true]) {
  test(`census fixtures: zero silent drops over every shape, one feed each (includeSidechain=${includeSidechain})`, () => {
    const silent = [];
    for (const e of index) {
      const m = createClaudeMapper({ includeSidechain });
      const st = m.newState();
      for (let pass = 0; pass < 1; pass++) {
        const before = [sig(st), sum(st.dropped), sum(st.skipped), st.sidechainSkipped];
        const out = m.mapLine(fixture(e.n), st);
        assert.equal(st.errors.count, 0, `shape ${e.n} threw`);
        const after = [sig(st), sum(st.dropped), sum(st.skipped), st.sidechainSkipped];
        if (!out.length && JSON.stringify(before) === JSON.stringify(after)) silent.push(`${e.n}#${pass}`);
      }
    }
    assert.deepEqual(silent, [], 'shape#pass of silently dropped fixtures');
  });
}
test('census fixtures: every produced item is valid and skipped keys are plain names', () => {
  for (const e of index) {
    const m = createClaudeMapper({ includeSidechain: true });
    const st = m.newState();
    for (let i = 0; i < 2; i++) for (const it of m.mapLine(fixture(e.n), st)) assert.equal(itemProblem(it), null, `shape ${e.n}`);
    for (const k of Object.keys(st.skipped)) assert.match(k, /^[a-z_.-]+$/i);
  }
});

test('census index is non-empty', () => assert.ok(index.length > 0));

// Hygiene: only structure may be stored. Every string in every generated JSON file (keys and values) must be a <...>
// placeholder or short, with no whitespace, slash, backslash, @ or owner name. LABELS are this tool's own fixed strings.
const LABELS = new Set(['2026-01-01T00:00:00.000Z']);
const bad = (s) => !/^<[^<>]*>$/.test(s) && !LABELS.has(s) && (s.length > 60 || /[\s/\\@]/.test(s) || /abhay|godavarthy/i.test(s));
test('census generated JSON holds structure only (no long, spaced, pathy or owner-named strings)', () => {
  const counts = {};
  const walk = (v, field) => {
    if (typeof v === 'string') { if (bad(v)) counts[field] = (counts[field] || 0) + 1; }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, field));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (bad(k)) counts[`${field}.<key-name>`] = (counts[`${field}.<key-name>`] || 0) + 1; walk(x, field); }
  };
  const files = [...fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [new URL(f, dir), f === 'index.json' ? 'index' : 'fixture']),
    [new URL('../tools/tui-census/SIGNATURES.json', import.meta.url), 'signatures']];
  for (const [u, field] of files) if (fs.existsSync(u)) walk(JSON.parse(fs.readFileSync(u, 'utf8')), field);
  assert.deepEqual(counts, {}, 'offending string counts by file kind');
});
