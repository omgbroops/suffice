// Real Claude Code subagent recordings (tools/tui-record/record-agents.mjs): hygiene, then the tracker and mapper run on each recorded transcript.
// test.todo entries are variants the current code handles wrongly; nothing here fixes them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSubagentTracker } from '../src/tui/subagents.mjs';
import { createClaudeMapper } from '../src/tui/claude.mjs';
import { itemProblem } from '../src/tui/model.mjs';

const D = fileURLToPath(new URL('./fixtures/tui-real/claude/variants/agents/', import.meta.url));
const T = path.join(D, 'transcripts');
const matrix = JSON.parse(fs.readFileSync(path.join(D, 'MATRIX.json'), 'utf8')).rows;
const txts = fs.readdirSync(D).filter((f) => f.endsWith('.txt'));

test('hygiene: every captured row has a plain file, no ESC bytes, no username, no email', () => {
  for (const r of matrix.filter((r) => r.captured)) assert.ok(fs.existsSync(path.join(D, r.file)), r.file);
  for (const r of matrix.filter((r) => !r.captured)) assert.ok(r.reason, r.scenario);
  assert.ok(txts.length >= 100, String(txts.length));
  for (const f of [...txts, 'MATRIX.json']) {
    const t = fs.readFileSync(path.join(D, f), 'utf8');
    assert.ok(!t.includes('\x1b'), f + ' has ESC');
    assert.ok(!/\/Users\/(?!USER\b)[^/\s"]+/.test(t) && !t.includes('abhayg'), f + ' has a username');
    assert.ok(!(t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).some((e) => e !== 'user@example.com'), f + ' has an email');
  }
  assert.ok(fs.readFileSync(path.join(D, 'RECORDS.txt'), 'utf8').includes('COMPLETION NOTICE'));
});

// copy one recorded scenario into a synthetic home so the tracker sees <dir>/<sid>.jsonl and <sid>/subagents/
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-va-test-'));
process.on('exit', () => fs.rmSync(home, { recursive: true, force: true }));
const load = (s) => {
  const dir = path.join(home, s, '.claude', 'projects', 'proj'); const sub = path.join(dir, s, 'subagents');
  fs.mkdirSync(sub, { recursive: true });
  fs.copyFileSync(path.join(T, s + '.jsonl'), path.join(dir, s + '.jsonl'));
  for (const f of fs.readdirSync(T).filter((f) => f.startsWith(s + '.agent-'))) fs.copyFileSync(path.join(T, f), path.join(sub, f.slice(s.length + 1)));
  return path.join(dir, s + '.jsonl');
};
const run = (s) => new Promise((resolve) => {
  let last = []; const stop = createSubagentTracker({ fs }).attach(load(s), (l) => { last = l; });
  setTimeout(() => { stop(); resolve(last); }, 400);
});
const walk = (list, f) => { for (const i of list) { f(i); if (i.items) walk(i.items, f); } };
const count = (s) => fs.readFileSync(path.join(T, s + '.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"name":"Agent"') || l.includes('"name":"Task"')).length;

const RIGHT = { 'fg-tools': 1, par2: 2, par3: 3, par5: 5, perm: 2, types: 4, question: 1, 'long-resume': 1, fail: 2 };
for (const [s, n] of Object.entries(RIGHT)) {
  test(`${s}: tracker lists ${n} agent(s) with valid items and non-negative counts`, async () => {
    const l = await run(s);
    assert.equal(l.length, n);
    assert.ok(l.length <= count(s));
    for (const a of l) { assert.ok(['ok', 'error', 'running'].includes(a.status), a.status); assert.ok(a.toolUses >= 0); assert.ok(a.type); }
    walk(l, (i) => assert.equal(itemProblem(i), null, JSON.stringify(i).slice(0, 200)));
    if (s === 'fail') assert.deepEqual(l.map((a) => a.status).sort(), ['error', 'running']);
    if (s === 'types') assert.ok(['Explore', 'Plan', 'general-purpose'].every((t) => l.some((a) => a.type === t)));
    if (s === 'fg-tools') assert.ok(l[0].items.length > 0 && l[0].toolUses > 0);
  });
}

test('bg-complete: launch result is async_launched and the tracker finds both agents with child items', async () => {
  const l = await run('bg-complete');
  assert.equal(l.length, 2); assert.ok(l.every((a) => a.items.length > 0));
});

test('task-notification: mapper records the task and emits no item; layout from the real record', () => {
  const m = createClaudeMapper(); const st = m.newState();
  const content = '<task-notification><task-id>a1</task-id><tool-use-id>toolu_1</tool-use-id><output-file>x</output-file><status>completed</status><summary>Agent "d" finished</summary><result>r</result><usage><subagent_tokens>1205</subagent_tokens><tool_uses>5</tool_uses><duration_ms>9234</duration_ms></usage></task-notification>';
  const items = m.mapLine({ type: 'user', uuid: 'n1', timestamp: '2026-01-01T00:00:00Z', origin: { kind: 'task-notification', producer: 'session-task' }, promptSource: 'system', turnOrigin: 'task_notification', message: { role: 'user', content } }, st) || [];
  assert.equal(st.tasks.a1.status, 'completed');
  assert.equal(items.filter((i) => i.kind === 'subagent').length, 0);
});

test('esc-kill: tracker still lists every launched agent', async () => {
  assert.equal((await run('esc-kill')).length, 3);
});

test('nested: one agent listed with its child items (no grandchild was produced)', async () => {
  const l = await run('nested'); assert.equal(l.length, 1); assert.ok(l[0].items.length > 0);
});

test.todo('/agents view cannot be parsed from the terminal (claude.mjs lists it terminal-only); not captured while an agent runs');
test.todo('nested grandchild depth 2 not verified: the recorded model run produced no grandchild');

// ---- fixed faults, on the real recordings. The saved notice bodies are "[scrubbed]", so real-shaped bodies are written into a copy of the real parent transcript.
const metaOf = (s) => fs.readdirSync(T).filter((f) => f.startsWith(s + '.agent-') && f.endsWith('.meta.json')).map((f) => ({ agentId: f.slice(s.length + 7, -10), ...JSON.parse(fs.readFileSync(path.join(T, f), 'utf8')) }));
const body = (o) => `<task-notification>\n<task-id>${o.id}</task-id>\n<tool-use-id>${o.tu}</tool-use-id>\n<output-file>/o/${o.id}.output</output-file>\n<status>${o.status ?? 'completed'}</status>\n<summary>${o.summary ?? 'Agent "d" finished'}</summary>\n<note>n</note>\n<result>${o.result ?? 'six lines'}</result>\n<usage><subagent_tokens>${o.tokens ?? 1205}</subagent_tokens><tool_uses>${o.uses ?? 5}</tool_uses><duration_ms>${o.ms ?? 9234}</duration_ms></usage>\n</task-notification>`;
const withNotices = (s, bodies) => { // replace the scrubbed notice bodies (in order) in the copied parent file
  const f = load(s); let k = 0;
  const lines = fs.readFileSync(f, 'utf8').split('\n').map((l) => {
    if (!l || !bodies[k]) return l;
    const o = JSON.parse(l);
    if (o.type === 'user' && o.origin?.kind === 'task-notification') { o.message.content = bodies[k++]; return JSON.stringify(o); }
    return l;
  });
  fs.writeFileSync(f, lines.join('\n')); return f;
};
const runFile = (f) => new Promise((resolve) => { let last = []; const stop = createSubagentTracker({ fs }).attach(f, (l) => { last = l; }); setTimeout(() => { stop(); resolve(last); }, 400); });
const mapAll = (s) => { const m = createClaudeMapper(); const st = m.newState(); const items = []; for (const l of fs.readFileSync(path.join(T, s + '.jsonl'), 'utf8').split('\n')) if (l) items.push(...(m.mapLine(JSON.parse(l), st) || [])); return { items, st }; };
const BG = ['bg-complete', 'bg-views', 'esc-kill', 'perm', 'par3', 'par5', 'fail', 'fg-tools', 'types', 'long-resume', 'nested', 'question', 'par2'];

// fault 1: a background launch is running until its notice arrives
for (const s of BG) {
  test(`${s}: a background agent with no applied notice is running, never ok`, async () => {
    const l = await run(s);
    for (const a of l) if (a.background) assert.ok(a.status !== 'ok' || a.notice, `${a.callId} ${a.status}`);
    assert.ok(l.every((a) => a.background === (metaOf(s).find((m) => m.toolUseId === a.callId)?.requestShape === 'background' || a.background)));
  });
}
test('bg-complete: both launched agents are background and running (notices scrubbed)', async () => {
  const l = await run('bg-complete');
  assert.deepEqual(l.map((a) => [a.background, a.status, a.endedAt]), [[true, 'running', 0], [true, 'running', 0]]);
});

// fault 2: the completion notice is applied by tool-use-id / task-id
test('bg-complete: a real-shaped notice marks only its agent done and attaches summary, result, usage', async () => {
  const [a, b] = metaOf('bg-complete');
  const l = await runFile(withNotices('bg-complete', [body({ id: a.agentId, tu: a.toolUseId, summary: 'counted', result: 'total 40', tokens: 777, uses: 4, ms: 5000 })]));
  const x = l.find((q) => q.callId === a.toolUseId); const y = l.find((q) => q.callId === b.toolUseId);
  assert.equal(x.status, 'ok'); assert.equal(x.notice.summary, 'counted'); assert.equal(x.result, 'total 40');
  assert.deepEqual([x.tokens, x.toolUses], [777, 4]); assert.ok(x.endedAt >= x.startedAt + 5000 && x.durationMs >= 5000);
  assert.equal(y.status, 'running'); assert.equal(y.result, '');
});
test('bg-complete: notice linked by tool-use-id alone (task-id unknown)', async () => {
  const [a] = metaOf('bg-complete');
  const l = await runFile(withNotices('bg-complete', [body({ id: 'zzz', tu: a.toolUseId })]));
  assert.equal(l.find((q) => q.callId === a.toolUseId).status, 'ok');
});
test('bg-complete: notice linked by task-id (agent id) alone', async () => {
  const [a] = metaOf('bg-complete');
  const l = await runFile(withNotices('bg-complete', [body({ id: a.agentId, tu: 'toolu_none' })]));
  assert.equal(l.find((q) => q.callId === a.toolUseId).status, 'ok');
});
test('bg-complete: status failed becomes error', async () => {
  const [a] = metaOf('bg-complete');
  assert.equal((await runFile(withNotices('bg-complete', [body({ id: a.agentId, tu: a.toolUseId, status: 'failed' })]))).find((q) => q.callId === a.toolUseId).status, 'error');
});
test('bg-complete: status killed becomes stopped', async () => {
  const [a] = metaOf('bg-complete');
  assert.equal((await runFile(withNotices('bg-complete', [body({ id: a.agentId, tu: a.toolUseId, status: 'killed' })]))).find((q) => q.callId === a.toolUseId).status, 'stopped');
});
test('bg-complete: notice for an unknown tool-use-id changes nothing', async () => {
  const l = await runFile(withNotices('bg-complete', [body({ id: 'q', tu: 'toolu_nope' })]));
  assert.ok(l.every((a) => a.status === 'running'));
});
test('bg-complete: both notices applied', async () => {
  const [a, b] = metaOf('bg-complete');
  const l = await runFile(withNotices('bg-complete', [body({ id: a.agentId, tu: a.toolUseId }), body({ id: b.agentId, tu: b.toolUseId, uses: 1, tokens: 50 })]));
  assert.deepEqual(l.map((q) => q.status), ['ok', 'ok']); assert.equal(l[1].tokens, 50);
});
test('notice usage with missing tags leaves the agent own counts', async () => {
  const [a] = metaOf('bg-complete');
  const l = await runFile(withNotices('bg-complete', [`<task-notification><task-id>${a.agentId}</task-id><tool-use-id>${a.toolUseId}</tool-use-id><status>completed</status></task-notification>`]));
  const x = l.find((q) => q.callId === a.toolUseId); assert.equal(x.status, 'ok'); assert.ok(x.toolUses > 0);
});
test('applied notice agents still satisfy itemProblem', async () => {
  const [a] = metaOf('bg-complete');
  const l = await runFile(withNotices('bg-complete', [body({ id: a.agentId, tu: a.toolUseId })]));
  walk(l, (i) => assert.equal(itemProblem(i), null));
});

// the notice is never a chat message
for (const s of ['bg-complete', 'bg-views', 'esc-kill']) {
  test(`${s}: no user item in the mapped chat comes from a task-notification`, () => {
    const { items } = mapAll(s);
    assert.ok(items.filter((i) => i.kind === 'user').every((i) => !/task-notification|scrubbed/.test(i.text)));
  });
}
test('mapper: real-shaped notice (origin task-notification) is no chat item and records the usage', () => {
  const m = createClaudeMapper(); const st = m.newState();
  const items = m.mapLine({ type: 'user', uuid: 'n', timestamp: '2026-01-01T00:00:00Z', origin: { kind: 'task-notification', producer: 'session-task', runId: 'r' }, message: { role: 'user', content: body({ id: 'a1', tu: 'toolu_1' }) } }, st) || [];
  assert.equal(items.length, 0);
  assert.deepEqual(st.tasks.a1.usage, { tokens: 1205, toolUses: 5, durationMs: 9234 }); assert.equal(st.tasks.a1.result, 'six lines'); assert.equal(st.tasks.a1.toolUseId, 'toolu_1');
});
test('mapper: origin task-notification with a scrubbed body is dropped, not shown as a user message', () => {
  const m = createClaudeMapper(); const st = m.newState();
  const items = m.mapLine({ type: 'user', uuid: 'n', timestamp: '2026-01-01T00:00:00Z', origin: { kind: 'task-notification' }, message: { role: 'user', content: '[scrubbed]' } }, st) || [];
  assert.equal(items.length, 0);
});
test('mapper: queue-operation carrying the notice text emits nothing', () => {
  const m = createClaudeMapper(); const st = m.newState();
  assert.equal((m.mapLine({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-01-01T00:00:00Z', content: body({ id: 'a1', tu: 't' }) }, st) || []).length, 0);
});

// fault 3: Esc by the user
test('esc-kill: every Esc-stopped agent is shown stopped with an end time', async () => {
  const l = await run('esc-kill');
  assert.equal(l.length, 3); assert.ok(l.every((a) => a.status === 'stopped' && a.endedAt > 0), JSON.stringify(l.map((a) => a.status)));
  walk(l, (i) => assert.equal(itemProblem(i), null));
});
test('esc-kill: the metas record stoppedByUser for all three', () => { assert.ok(metaOf('esc-kill').every((m) => m.stoppedByUser === true)); });
test('esc-kill: a later notice does not flip a stopped agent back to running', async () => {
  const [a] = metaOf('esc-kill'); const l = await runFile(withNotices('esc-kill', [body({ id: a.agentId, tu: a.toolUseId, status: 'killed' })]));
  assert.equal(l.find((q) => q.callId === a.toolUseId).status, 'stopped');
});
test('agents not stopped by the user are never stopped', async () => {
  for (const s of ['fg-tools', 'par3', 'fail']) assert.ok((await run(s)).every((a) => a.status !== 'stopped'), s);
});

// fault 4: a parent-screen prompt names its agent in the title
const realTitle = fs.readFileSync(path.join(D, 'subperm-find--01-bash-prompt.txt'), 'utf8').split('\n').find((l) => /· from the .+ agent/.test(l)).trim();
const open2 = (s) => createSubagentTracker({ fs }).open(load(s), { watch: false });
test('real prompt title reads "<Tool> · from the <type> agent"', () => { assert.match(realTitle, /^Bash command · from the general-purpose agent$/); });
test('bg-views: the one running general-purpose agent gets the real prompt', () => {
  const o = open2('bg-views'); try { const p = o.attributePrompt({ type: 'permission', title: realTitle, body: 'find /tmp', options: [], selected: 0 }); assert.equal(p.subagentId, metaOf('bg-views')[0].agentId); assert.equal(p.subagentType, 'general-purpose'); } finally { o.close(); }
});
test('bg-complete: two running agents of one type are not guessed', () => {
  const o = open2('bg-complete'); try { assert.equal(o.attributePrompt({ type: 'permission', title: realTitle, body: 'x', options: [], selected: 0 }).subagentId, null); } finally { o.close(); }
});
test('bg-views: a prompt naming another agent type is not attributed', () => {
  const o = open2('bg-views'); try { assert.equal(o.attributePrompt({ type: 'permission', title: 'Create file · from the builder agent', body: '', options: [], selected: 0 }).subagentId, null); } finally { o.close(); }
});
test('bg-views: a title without "from the" is not attributed by heuristic', () => {
  const o = open2('bg-views'); try { assert.equal(o.attributePrompt({ type: 'permission', title: 'Bash command', body: '', options: [], selected: 0 }).subagentId, null); } finally { o.close(); }
});
test('perm: finished agents are never blamed for the real prompt', () => {
  const o = open2('perm'); try { assert.equal(o.attributePrompt({ type: 'permission', title: realTitle, body: '', options: [], selected: 0 }).subagentId, null); } finally { o.close(); }
});
test('prompt fields survive attribution', () => {
  const o = open2('bg-views'); try { const p = o.attributePrompt({ promptId: 'p9', type: 'permission', title: realTitle, body: 'b', options: ['Yes'], selected: 0 }); assert.deepEqual([p.promptId, p.body, p.options], ['p9', 'b', ['Yes']]); } finally { o.close(); }
});
