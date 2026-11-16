import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceConversation} from '../src/voice/conversation.js';
import {registerVoiceProvider} from '../src/voice/provider.js';

let stub;
registerVoiceProvider('stub', (deps) => {
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  stub = {calls, deps, start: async () => { calls.push(['start']); }, stop: async () => { calls.push(['stop']); deps.emit({type: 'ended', reason: 'requested'}); },
    setMuted: rec('setMuted'), interrupt: rec('interrupt'), sendToolResult: rec('sendToolResult'), sendProgress: rec('sendProgress'),
    finishTask: rec('finishTask'), steerAck: rec('steerAck'), suppressSpeech: rec('suppressSpeech')};
  return stub;
});

function rig({canStart = {ok: true}, running = false, reply = 'All done.', steer, kind = 'stub', providerDeps} = {}) {
  let time = 0, nid = 1;
  const tm = new Map();
  const timers = {now: () => time, setTimer: (fn, ms) => { const id = nid++; tm.set(id, {fn, due: time + ms}); return id; }, clearTimer: (id) => tm.delete(id)};
  const advance = (ms) => {
    const end = time + ms;
    for (;;) {
      const n = [...tm].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!n) break;
      tm.delete(n[0]); time = n[1].due; n[1].fn();
    }
    time = end;
  };
  const events = [], submitted = [], steered = [];
  let harness = null, isRunning = running;
  const app = {
    canStart: () => canStart,
    submit: (t) => { submitted.push(t); isRunning = true; },
    steer: steer || (async (t) => { steered.push(t); }),
    abort: async () => {},
    isRunning: () => isRunning,
    onHarnessEvent: (cb) => { harness = cb; return () => { harness = null; }; },
    lastReply: () => reply,
  };
  const conv = createVoiceConversation({kind, providerDeps, app, onEvent: (e) => events.push(e), timers});
  const feed = (e) => harness?.(e);
  const prov = (e) => stub.deps.emit(e);
  const calls = (name) => stub.calls.filter((c) => c[0] === name);
  return {conv, events, submitted, steered, advance, feed, prov, calls, timers, get harness() { return harness; }, setRunning: (v) => { isRunning = v; }};
}
const call = (r, id, name, args = {}) => r.prov({type: 'tool_call', id, name, args});
const tick = () => new Promise((x) => setTimeout(x, 0));

test('canStart false emits its sentence as an error and does not start', async () => {
  const r = rig({canStart: {ok: false, reason: 'Open a project first.'}});
  stub = null;
  await r.conv.start();
  assert.deepEqual(r.events, [{type: 'error', message: 'Open a project first.'}]);
  assert.equal(r.conv.active, false);
  assert.equal(stub, null);
});

test('start and stop emit the notices, shown states and ended with a reason', async () => {
  const r = rig();
  await r.conv.start();
  assert.equal(r.conv.active, true);
  assert.deepEqual(r.events.slice(0, 2), [{type: 'notice', text: 'Voice conversation started.'}, {type: 'state', state: 'connecting', detail: undefined}]);
  r.prov({type: 'state', state: 'listening'});
  r.advance(400);
  assert.equal(r.conv.state, 'listening');
  await r.conv.stop();
  assert.equal(r.conv.active, false);
  assert.deepEqual(r.events.slice(-3), [{type: 'state', state: 'ended', detail: undefined}, {type: 'notice', text: 'Voice conversation ended.'}, {type: 'ended', reason: 'requested'}]);
  assert.equal(r.harness, null);
});

test('ended with reason error omits the ended notice', async () => {
  const r = rig();
  await r.conv.start();
  r.prov({type: 'ended', reason: 'error'});
  assert.ok(!r.events.some((e) => e.type === 'notice' && /ended/.test(e.text)));
  assert.deepEqual(r.events.at(-1), {type: 'ended', reason: 'error'});
});

test('transcripts: partials and finals; levels are mic and agent, about ten per second', async () => {
  const r = rig();
  await r.conv.start();
  r.prov({type: 'user_partial', text: 'hel'});
  r.prov({type: 'user_final', text: 'hello'});
  r.prov({type: 'agent_partial', text: 'Hi'});
  r.prov({type: 'agent_final', text: 'Hi there.'});
  assert.deepEqual(r.events.filter((e) => e.type === 'transcript'), [
    {type: 'transcript', role: 'user', text: 'hel', final: false}, {type: 'transcript', role: 'user', text: 'hello', final: true},
    {type: 'transcript', role: 'assistant', text: 'Hi', final: false}, {type: 'transcript', role: 'assistant', text: 'Hi there.', final: true}]);
  for (let i = 0; i < 40; i++) { r.prov({type: 'level', input: 0.5, output: 0.25}); r.advance(25); }
  const levels = r.events.filter((e) => e.type === 'level');
  assert.ok(levels.length >= 9 && levels.length <= 11, String(levels.length));
  assert.deepEqual(levels[0], {type: 'level', mic: 0.5, agent: 0.25});
});

test('background_agent with no running task starts one through app.submit', async () => {
  const r = rig();
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'add a test'});
  await tick();
  assert.deepEqual(r.submitted, ['add a test']);
  assert.deepEqual(r.events.find((e) => e.type === 'delegated'), {type: 'delegated', prompt: 'add a test', mode: 'start'});
  assert.equal(r.calls('sendToolResult').length, 0); // the tool call stays open until the task finishes
});

test('background_agent while a task runs steers it, acknowledges, and never submits', async () => {
  const r = rig();
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'first'});
  call(r, 'c2', 'background_agent', {prompt: 'also use vitest'});
  await tick();
  assert.deepEqual(r.submitted, ['first']);
  assert.deepEqual(r.steered, ['also use vitest']);
  assert.deepEqual(r.calls('steerAck'), [['steerAck', 'c2']]);
  assert.deepEqual(r.events.filter((e) => e.type === 'delegated').map((e) => e.mode), ['start', 'steer']);
  // a task started elsewhere in the app also counts as running
  const q = rig({running: true});
  await q.conv.start();
  call(q, 'c9', 'background_agent', {prompt: 'next'});
  await tick();
  assert.deepEqual(q.submitted, []);
  assert.deepEqual(q.steered, ['next']);
});

test('a failed steer answers the tool call with a plain sentence', async () => {
  const r = rig({running: true, steer: async () => { throw new Error('This chat is no longer running'); }});
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'x'});
  await tick();
  assert.equal(r.calls('steerAck').length, 0);
  assert.match(r.calls('sendToolResult')[0][2], /could not be steered: This chat is no longer running/);
});

test('progress mirror: tool lines and completed assistant text, one message per 2 s, never reasoning', async () => {
  const r = rig();
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'go'});
  await tick();
  r.feed({event: 'reasoning', text: 'secret thoughts'});
  r.feed({event: 'tool_start', id: 't1', name: 'read_file'});
  assert.deepEqual(r.calls('sendProgress'), [['sendProgress', 'Running read_file']]);
  r.feed({event: 'text', text: 'Looking at '});
  r.feed({event: 'text', text: 'the login code.'});
  assert.equal(r.calls('sendProgress').length, 1);
  r.feed({event: 'tool_start', id: 't2', name: 'edit_file'}); // inside the 2 s window: queued
  assert.equal(r.calls('sendProgress').length, 1);
  r.advance(1999);
  assert.equal(r.calls('sendProgress').length, 1);
  r.advance(1);
  assert.deepEqual(r.calls('sendProgress')[1], ['sendProgress', 'Looking at the login code.\nRunning edit_file']);
  assert.ok(!JSON.stringify(r.calls('sendProgress')).includes('secret'));
});

test('progress for a finished task is dropped', async () => {
  const r = rig();
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'go'});
  await tick();
  r.feed({event: 'tool_start', name: 'a'});
  r.feed({event: 'tool_start', name: 'b'}); // queued
  r.feed({event: 'run_completed', result: {}});
  r.advance(5000);
  assert.deepEqual(r.calls('sendProgress').map((c) => c[1]), ['Running a', 'All done.']);
});

test('approval requests tell the voice model at once, even inside the throttle window', async () => {
  const r = rig();
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'go'});
  await tick();
  r.feed({event: 'tool_start', name: 'a'});
  r.feed({event: 'approval', requestId: 'r1'});
  assert.deepEqual(r.calls('sendProgress').at(-1), ['sendProgress', 'I need your approval to continue. Please review the request in the app.']);
});

test('completion sends the final answer as progress, then finishTask', async () => {
  const r = rig({reply: 'I added the test and it passes.'});
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'go'});
  await tick();
  r.feed({event: 'run_completed', result: {}});
  assert.deepEqual(r.stub = stub.calls.filter((c) => /sendProgress|finishTask/.test(c[0])), [['sendProgress', 'I added the test and it passes.'], ['finishTask', 'c1']]);
});

test('a final answer over about 4000 characters is replaced by a short notice', async () => {
  const r = rig({reply: 'x'.repeat(4500)});
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'go'});
  await tick();
  r.feed({event: 'run_completed', result: {}});
  assert.deepEqual(r.calls('sendProgress').at(-1), ['sendProgress', 'The answer is long. It is shown in the app.']);
  assert.deepEqual(r.calls('finishTask'), [['finishTask', 'c1']]);
});

test('a task error is reported as progress, then finishTask', async () => {
  const r = rig();
  await r.conv.start();
  call(r, 'c1', 'background_agent', {prompt: 'go'});
  await tick();
  r.feed({event: 'run_completed', error: 'Model overloaded'});
  assert.deepEqual(r.calls('sendProgress').at(-1), ['sendProgress', 'The task failed: Model overloaded']);
  assert.equal(r.calls('finishTask').length, 1);
  // after completion the next request starts a new task
  r.setRunning(false);
  call(r, 'c2', 'background_agent', {prompt: 'again'});
  await tick();
  assert.deepEqual(r.submitted, ['go', 'again']);
});

test('notifyTyped suppresses speech and the conversation continues', async () => {
  const r = rig();
  await r.conv.start();
  r.conv.notifyTyped();
  assert.equal(r.calls('suppressSpeech').length, 1);
  assert.equal(r.conv.active, true);
  assert.equal(r.calls('stop').length, 0);
});

test('remain_silent answers with an empty result and requests no response', async () => {
  const r = rig();
  await r.conv.start();
  call(r, 's1', 'remain_silent');
  await tick();
  assert.deepEqual(r.calls('sendToolResult'), [['sendToolResult', 's1', '', {respond: false}]]);
  assert.equal(r.submitted.length, 0);
});

test('mute: set before start is applied once the provider is up; toggle flips it', async () => {
  const r = rig();
  r.conv.setMuted(true);
  assert.equal(r.conv.muted, true);
  await r.conv.start();
  assert.deepEqual(r.calls('setMuted'), [['setMuted', true]]);
  r.conv.toggleMute();
  assert.equal(r.conv.muted, false);
  assert.deepEqual(r.calls('setMuted').at(-1), ['setMuted', false]);
});

test('a provider notice (startup retry) is passed on and mute is kept', async () => {
  const r = rig();
  await r.conv.start();
  r.conv.setMuted(true);
  r.prov({type: 'notice', text: 'Voice connection timed out. Retrying once after cleanup.'});
  assert.deepEqual(r.events.at(-1), {type: 'notice', text: 'Voice connection timed out. Retrying once after cleanup.'});
  assert.equal(r.conv.muted, true);
});

test('emit forwards to the provider that has one (fake) and is a no-op for others', async () => {
  const f = rig({kind: 'fake', providerDeps: {autoplay: false}});
  f.conv.emit({type: 'state', state: 'speaking'}); // before start: no provider, no-op
  await f.conv.start();
  f.conv.emit({type: 'state', state: 'listening'});
  f.advance(500);
  f.conv.emit({type: 'state', state: 'speaking'});
  f.advance(500);
  assert.equal(f.conv.state, 'speaking');
  const s = rig();
  await s.conv.start();
  assert.doesNotThrow(() => s.conv.emit({type: 'state', state: 'speaking'}));
});
