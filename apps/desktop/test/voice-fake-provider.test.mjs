import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceProvider, validateVoiceEvent} from '../src/voice/provider.js';
import {DEFAULT_SCRIPT} from '../src/voice/provider-fake.js';

function setup(options = {}) {
  let time = 0, nextId = 1;
  const timers = new Map(), events = [];
  const provider = createVoiceProvider('fake', {
    emit: (event) => events.push(event),
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, {fn, due: time + ms}); return id; },
    clearTimer: (id) => timers.delete(id),
    ...options,
  });
  const advance = (ms) => {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      timers.delete(next[0]);
      time = next[1].due;
      next[1].fn();
    }
    time = end;
  };
  const states = () => events.filter((e) => e.type === 'state').map((e) => e.state);
  return {provider, events, advance, states, timers};
}

test('default script emits only valid events (checked by the provider wrapper) in the expected order', async () => {
  const s = setup();
  await s.provider.start();
  s.advance(60000);
  assert.deepEqual(s.states(), ['connecting', 'listening', 'hearing', 'thinking', 'working']);
  assert.equal(s.events.at(-1).detail, 'Running tests');
  const call = s.events.find((e) => e.type === 'tool_call');
  assert.deepEqual(call, {type: 'tool_call', id: 'call_1', name: 'background_agent', args: {prompt: 'Add a regression test for the login redirect.'}});
  s.provider.sendToolResult('call_1', 'All 12 tests pass.');
  s.advance(60000);
  assert.deepEqual(s.states(), ['connecting', 'listening', 'hearing', 'thinking', 'working', 'speaking', 'hearing', 'heard', 'listening', 'speaking', 'listening']);
  for (const e of s.events) validateVoiceEvent(e);
  assert.equal(s.events.at(-1).state, 'listening');
  assert.equal(s.timers.size, 0);
});

test('default script lasts about 14 s at speed 1', () => {
  const total = DEFAULT_SCRIPT.reduce((sum, step) => sum + (step.after ?? 0), 0);
  assert.ok(total > 13000 && total < 15500, `total ${total}`);
});

test('user partials, interruption data and levels are as scripted', async () => {
  const s = setup();
  await s.provider.start();
  s.advance(60000);
  s.provider.sendToolResult('call_1', 'done');
  s.advance(60000);
  assert.deepEqual(s.events.filter((e) => e.type === 'user_partial').map((e) => e.text), ['Can you add', 'Can you add a test for the', 'Can you add a test for the login redirect?']);
  const interrupted = s.events.find((e) => e.type === 'agent_final' && e.interrupted);
  assert.equal(interrupted.heard, 'I added the test. done');
  assert.deepEqual(s.events.filter((e) => e.type === 'user_final').map((e) => e.text), ['Can you add a test for the login redirect?', 'Never mind, that is enough.']);
  assert.ok(s.events.some((e) => e.type === 'level' && e.input > 0));
  assert.ok(s.events.some((e) => e.type === 'level' && e.output > 0));
});

test('tool result substitution uses the first 80 characters; a result sent early is kept', async () => {
  const s = setup({script: [
    {after: 10, event: {type: 'state', state: 'working'}},
    {waitForToolResult: 'a'},
    {after: 10, event: {type: 'agent_partial', text: 'Got: {{result}}'}},
  ]});
  s.provider.sendToolResult('a', 'x'.repeat(100));
  await s.provider.start();
  s.advance(100);
  assert.equal(s.events.at(-1).text, `Got: ${'x'.repeat(80)}`);
});

test('mute pauses the script and unmute resumes it', async () => {
  const s = setup();
  await s.provider.start();
  s.advance(800);
  const before = s.events.length;
  s.provider.setMuted(true);
  assert.equal(s.states().at(-1), 'muted');
  s.advance(20000);
  assert.equal(s.events.length, before + 1);
  s.provider.setMuted(false);
  assert.equal(s.states().at(-1), 'listening');
  const resumed = s.events.length;
  s.advance(20000);
  assert.ok(s.events.length > resumed);
});

test('interrupt while speaking reports what was heard, then heard', async () => {
  const s = setup({autoplay: false});
  await s.provider.start();
  s.provider.emit({type: 'state', state: 'speaking'});
  s.provider.emit({type: 'agent_partial', text: 'Here is the'});
  s.provider.interrupt();
  assert.deepEqual(s.events.slice(-2), [
    {type: 'agent_final', text: 'Here is the', interrupted: true, heard: 'Here is the'},
    {type: 'state', state: 'heard'},
  ]);
  const count = s.events.length;
  s.provider.interrupt(); // no longer speaking
  assert.equal(s.events.length, count);
});

test('stop cancels timers and emits ended exactly once', async () => {
  const s = setup();
  await s.provider.start();
  s.advance(800);
  await s.provider.stop();
  await s.provider.stop();
  assert.equal(s.timers.size, 0);
  const count = s.events.length;
  s.provider.setMuted(true);
  s.provider.interrupt();
  s.provider.sendToolResult('call_1', 'x');
  s.advance(60000);
  assert.equal(s.events.length, count);
  assert.equal(s.events.filter((e) => e.type === 'ended').length, 1);
  assert.equal(s.events.at(-1).type, 'ended');
});

test('autoplay false emits only connecting', async () => {
  const s = setup({autoplay: false});
  await s.provider.start();
  s.advance(60000);
  assert.deepEqual(s.events, [{type: 'state', state: 'connecting'}]);
});

test('validateVoiceEvent rejects malformed events and accepts good ones', () => {
  const bad = [
    null,
    {type: 'nope'},
    {type: 'state', state: 'idle'},
    {type: 'level', input: 1.5},
    {type: 'tool_call', id: 'c', name: 'background_agent', args: {prompt: ''}},
    {type: 'error', message: ''},
    {type: 'agent_final', text: 'x', interrupted: 'yes'},
    {type: 'tool_call', id: 'c', name: 'rm_rf', args: {}},
  ];
  for (const event of bad) assert.throws(() => validateVoiceEvent(event), TypeError, JSON.stringify(event));
  const good = {type: 'level', input: 0.5, output: 0};
  assert.equal(validateVoiceEvent(good), good);
});

test('the wrapper rejects invalid emitted events and unknown kinds throw', () => {
  const s = setup({autoplay: false});
  assert.throws(() => s.provider.emit({type: 'state', state: 'bogus'}), TypeError);
  assert.throws(() => createVoiceProvider('nope', {emit() {}}), /Unknown voice provider: nope/);
});

test('progress text feeds the scripted result and finishTask releases the script', async () => {
  const s = setup();
  await s.provider.start();
  s.advance(60000);
  s.provider.sendProgress('Tests pass: 12');
  s.provider.finishTask('call_1');
  s.advance(60000);
  assert.equal(s.events.find((e) => e.type === 'agent_final' && e.interrupted).heard, 'I added the test. Tests pass: 12');
  s.provider.steerAck('call_1'); // accepted, no event
});

test('sendToolResult with respond:false does not release the script', async () => {
  const s = setup();
  await s.provider.start();
  s.advance(60000);
  s.provider.sendToolResult('call_1', 'x', {respond: false});
  s.advance(60000);
  assert.equal(s.states().at(-1), 'working');
});

test('suppressSpeech ends speech like an interruption and returns to listening', async () => {
  const s = setup({autoplay: false});
  await s.provider.start();
  s.provider.emit({type: 'state', state: 'speaking'});
  s.provider.emit({type: 'agent_partial', text: 'Here'});
  s.provider.suppressSpeech();
  assert.deepEqual(s.events.slice(-2), [{type: 'agent_final', text: 'Here', interrupted: true, heard: 'Here'}, {type: 'state', state: 'listening'}]);
});
