import test from 'node:test';
import assert from 'node:assert/strict';
import { selectContext } from '../src/context-policy.mjs';

const text = value => [{ type: 'text', text: value }];
const user = value => ({ role: 'user', content: value, timestamp: 1 });
const assistant = value => ({ role: 'assistant', content: text(value), timestamp: 2 });
function toolGroup(id, value = id) {
  return [{ role: 'assistant', content: [{ type: 'toolCall', id, name: 'file_read', arguments: { path: value } }], timestamp: 3 },
    { role: 'toolResult', toolCallId: id, toolName: 'file_read', content: text(value), isError: false, timestamp: 4 }];
}
function transcript() {
  return [{ role: 'system', sections: { instructions: 'Repair code' }, toolsAdded: [{ name: 'file_read' }], timestamp: 0 },
    user('Initial repair task'), ...toolGroup('old', 'old evidence'), assistant('historical conclusion'),
    ...toolGroup('new', 'recent evidence'), assistant('latest conclusion')];
}

test('working context protects early contract and recent evidence even when selection abstains', async () => {
  const initial = user('Read README and repair');
  const contract = toolGroup('contract', 'README full contract');
  const old = toolGroup('discard', 'obsolete search');
  const code = toolGroup('code', 'current source');
  const edit = toolGroup('edit', 'applied change and test');
  const original = [initial, ...contract, ...old, ...code, ...edit];
  const result = await selectContext(original, { mode: 'llm', firstGroups: 1, recentGroups: 2, maxCharacters: 0,
    select: async state => { assert.equal(state.candidates.length, 1); return { selectedIds: [] }; } });
  assert.deepEqual(result.messages, [initial, ...contract, ...code, ...edit]);
  assert.equal(result.telemetry.removedMessages, 2);
});

test('none returns full context and never mutates the transcript', async () => {
  const original = transcript(), before = JSON.stringify(original);
  const result = await selectContext(original, { mode: 'none' });
  assert.deepEqual(result.messages, original);
  assert.notEqual(result.messages, original);
  assert.equal(result.telemetry.status, 'unchanged');
  assert.equal(JSON.stringify(original), before);
});

test('deterministic replacement keeps initial task, system state and complete recent groups', async () => {
  const original = transcript(), before = JSON.stringify(original);
  const result = await selectContext(original, { mode: 'deterministic', recentGroups: 2, maxCharacters: 0 });
  assert.deepEqual(result.messages, [original[0], original[1], ...original.slice(5)]);
  assert.equal(JSON.stringify(original), before);
  assert.equal(result.telemetry.removedMessages, 3);
  assert.equal(result.telemetry.status, 'selected');
  assert.equal(result.telemetry.budgetExceeded, true); // Protected evidence takes precedence.
});

test('deterministic budget selects relevant historical group before irrelevant newer group', async () => {
  const initial = user('Fix the parser');
  const relevant = assistant('parser handling evidence');
  const irrelevant = assistant('unrelated cosmetic evidence');
  const latest = assistant('next step');
  const budget = JSON.stringify([initial, relevant, latest]).length;
  const messages = [initial, relevant, irrelevant, latest];
  const first = await selectContext(messages, { mode: 'deterministic', objective: 'parser', recentGroups: 1, maxCharacters: budget });
  const second = await selectContext(messages, { mode: 'deterministic', objective: 'parser', recentGroups: 1, maxCharacters: budget });
  assert.deepEqual(first.messages, [initial, relevant, latest]);
  assert.deepEqual(first.telemetry.selectedGroupIds, ['g1']);
  assert.deepEqual(first, second);
});

test('LLM callback sees closed historical groups and replaces rather than appends context', async () => {
  const messages = transcript();
  let request;
  const result = await selectContext(messages, { mode: 'llm', objective: 'repair parser', recentGroups: 1,
    select: async state => { request = state; return { selectedIds: ['g2'] }; } });
  assert.equal(request.objective, 'repair parser');
  assert.deepEqual(request.candidates.map(group => group.id), ['g2', 'g4', 'g5']);
  assert.equal(request.candidates[0].messages.length, 2);
  assert.deepEqual(result.messages, [messages[0], messages[1], messages[2], messages[3], messages[7]]);
  assert.equal(result.telemetry.selectorCalled, true);
  assert.deepEqual(result.telemetry.selectedGroupIds, ['g2']);
});

test('callback receives isolated evidence and cannot mutate original transcript', async () => {
  const messages = transcript(), before = JSON.stringify(messages);
  await selectContext(messages, { mode: 'llm', select: async state => {
    state.candidates[0].messages[0].content[0].arguments.path = 'changed';
    return { selectedIds: [] };
  } });
  assert.equal(JSON.stringify(messages), before);
});

test('LLM malformed, unknown, duplicate, injected summaries, missing and failed selections fail open', async () => {
  const messages = transcript();
  const callbacks = [undefined, async () => { throw new Error('offline'); }, async () => null,
    async () => ({ selectedIds: ['unknown'] }), async () => ({ selectedIds: ['g2', 'g2'] }),
    async () => ({ selectedIds: [], summary: 'invented history' }), async () => ({ selectedIds: [2] }),
    async () => ({ selectedIds: ['g7'] })]; // Protected group is not a candidate.
  for (const select of callbacks) {
    const result = await selectContext(messages, { mode: 'llm', recentGroups: 1, select });
    assert.deepEqual(result.messages, messages);
    assert.equal(result.telemetry.status, 'fail_open');
  }
});

test('threshold compaction prunes only above threshold and adds no invented content', async () => {
  const messages = transcript(), thresholdCharacters = JSON.stringify(messages).length;
  const below = await selectContext(messages, { mode: 'compaction', thresholdCharacters, recentGroups: 2 });
  assert.deepEqual(below.messages, messages);
  assert.equal(below.telemetry.thresholdTriggered, false);
  const above = await selectContext(messages, { mode: 'compaction', thresholdCharacters: thresholdCharacters - 1, recentGroups: 2 });
  assert.deepEqual(above.messages, [messages[0], messages[1], ...messages.slice(5)]);
  assert.equal(above.telemetry.thresholdTriggered, true);
  assert.equal(above.telemetry.removedCharacters, thresholdCharacters - JSON.stringify(above.messages).length);
  assert.ok(above.messages.every(message => messages.includes(message)));
});

test('tool group selection retains every result including errors and parallel calls', async () => {
  const calls = { role: 'assistant', content: [
    { type: 'toolCall', id: 'a', name: 'read', arguments: {} },
    { type: 'toolCall', id: 'b', name: 'read', arguments: {} }] };
  const a = { role: 'toolResult', toolCallId: 'a', content: text('a'), isError: true };
  const b = { role: 'toolResult', toolCallId: 'b', content: text('b'), isError: false };
  const messages = [user('task'), calls, a, b, assistant('newest')];
  const result = await selectContext(messages, { mode: 'llm', recentGroups: 1,
    select: async () => ({ selectedIds: ['g1'] }) });
  assert.deepEqual(result.messages, messages);
  assert.deepEqual(result.telemetry.selectedGroupIds, ['g1']);
});

test('pending live tool call is protected even with zero recent groups', async () => {
  const live = toolGroup('pending')[0];
  const messages = [user('task'), assistant('history'), live];
  const result = await selectContext(messages, { mode: 'compaction', thresholdCharacters: 0, recentGroups: 0 });
  assert.deepEqual(result.messages, [messages[0], live]);
  assert.deepEqual(result.telemetry.protectedGroupIds, ['g2']);
});

test('pending live group does not displace a required recent complete group', async () => {
  const live = toolGroup('pending')[0];
  const messages = [user('task'), assistant('old history'), ...toolGroup('recent'), live];
  const result = await selectContext(messages, { mode: 'compaction', thresholdCharacters: 0, recentGroups: 1 });
  assert.deepEqual(result.messages, [messages[0], ...messages.slice(2)]);
  assert.deepEqual(result.telemetry.protectedGroupIds, ['g2', 'g4']);
});

test('orphan, duplicate, unmatched and incomplete historical tools fail open without invoking selector', async () => {
  const a = toolGroup('a');
  const invalid = [[user('task'), a[1]], [user('task'), ...a, ...a],
    [user('task'), a[0], { ...a[1], toolCallId: 'unknown' }],
    [user('task'), a[0], assistant('later')], [user('task'), ...a, a[1]]];
  for (const messages of invalid) {
    const result = await selectContext(messages, { mode: 'llm', select: async () => assert.fail('must not call') });
    assert.deepEqual(result.messages, messages);
    assert.equal(result.telemetry.status, 'fail_open');
    assert.equal(result.telemetry.selectorCalled, false);
  }
});

test('later user instructions, system changes and Pi custom messages remain pinned', async () => {
  const messages = [user('initial task'), assistant('old answer'),
    { role: 'system', toolsRemoved: ['file_read'], timestamp: 10 }, user('additional constraint'),
    { role: 'custom', content: 'extension evidence', customType: 'status', timestamp: 11 }, assistant('recent')];
  const result = await selectContext(messages, { mode: 'compaction', thresholdCharacters: 0, recentGroups: 1 });
  assert.deepEqual(result.messages, messages.filter((_, index) => index !== 1));
});

test('empty input and configuration validation', async () => {
  assert.deepEqual((await selectContext([], { mode: 'deterministic' })).messages, []);
  await assert.rejects(selectContext([], { mode: 'unknown' }), /Unknown context/);
  await assert.rejects(selectContext([], { recentGroups: -1 }), /recentGroups/);
  await assert.rejects(selectContext([], { maxCharacters: Infinity }), /maxCharacters/);
});
