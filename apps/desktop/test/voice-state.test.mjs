import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceState} from '../src/voice/state.js';

function setup() {
  let time = 0, nextId = 1;
  const timers = new Map(), changes = [];
  const voice = createVoiceState({
    now: () => time,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, {fn, due: time + ms}); return id; },
    clearTimer: (id) => timers.delete(id),
    onChange: (change) => changes.push(change),
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
  return {voice, changes, advance, timers};
}

// Gets past the idle rule and lets the minimum display time elapse.
function inListening() {
  const s = setup();
  s.voice.request('listening');
  s.advance(300);
  s.changes.length = 0;
  return s;
}

test('starts idle and leaves idle immediately', () => {
  const {voice, changes} = setup();
  assert.deepEqual(voice.get(), {state: 'idle', detail: undefined});
  voice.request('connecting');
  assert.equal(voice.get().state, 'connecting');
  assert.deepEqual(changes, [{state: 'connecting', detail: undefined, previous: 'idle'}]);
});

test('a state shows only after 150 ms as the latest request', () => {
  const s = inListening();
  s.voice.request('hearing');
  s.advance(149);
  assert.equal(s.voice.get().state, 'listening');
  s.advance(1);
  assert.equal(s.voice.get().state, 'hearing');
  assert.deepEqual(s.changes, [{state: 'hearing', detail: undefined, previous: 'listening'}]);
});

test('a newer request inside the window replaces the old one and restarts the timer', () => {
  const s = inListening();
  s.voice.request('hearing');
  s.advance(100);
  s.voice.request('thinking');
  s.advance(100);
  assert.equal(s.voice.get().state, 'listening');
  s.advance(50);
  assert.equal(s.voice.get().state, 'thinking');
  assert.equal(s.changes.length, 1);
});

test('a shown state stays for at least 250 ms', () => {
  const s = setup();
  s.voice.request('listening');
  s.advance(10);
  s.voice.request('hearing'); // debounce would finish at 160, minimum display at 250
  s.advance(200);
  assert.equal(s.voice.get().state, 'listening');
  s.advance(40);
  assert.equal(s.voice.get().state, 'hearing');
  s.advance(1000);
  assert.equal(s.changes.length, 2);
});

test('error, ended, muted and idle show immediately', () => {
  for (const target of ['error', 'ended', 'muted', 'idle']) {
    const s = setup();
    s.voice.request('listening');
    s.voice.request('thinking');
    s.voice.request(target, 'x');
    assert.deepEqual(s.voice.get(), {state: target, detail: 'x'}, target);
  }
});

test('a pending change is dropped when an immediate one shows', () => {
  const s = inListening();
  s.voice.request('hearing');
  s.voice.request('error', 'mic lost');
  s.advance(1000);
  assert.equal(s.voice.get().state, 'error');
  assert.equal(s.changes.length, 1);
});

test('any request while ended shows immediately', () => {
  const s = setup();
  s.voice.request('ended');
  s.voice.request('connecting');
  assert.equal(s.voice.get().state, 'connecting');
});

test('same state with a new detail updates at once; same detail is a no-op that cancels pending', () => {
  const s = inListening();
  s.voice.request('working', 'Running tests');
  s.advance(150);
  s.changes.length = 0;
  s.voice.request('working', 'Editing files');
  assert.deepEqual(s.changes, [{state: 'working', detail: 'Editing files', previous: 'working'}]);
  s.voice.request('speaking');
  s.voice.request('working', 'Editing files');
  assert.equal(s.changes.length, 1);
  assert.equal(s.timers.size, 0);
  s.advance(1000);
  assert.equal(s.voice.get().state, 'working');
});

test('unknown state names throw a TypeError', () => {
  const {voice} = setup();
  assert.throws(() => voice.request('dancing'), TypeError);
  assert.throws(() => voice.request(), TypeError);
});

test('dispose clears timers and ignores later requests', () => {
  const s = inListening();
  s.voice.request('hearing');
  s.voice.dispose();
  assert.equal(s.timers.size, 0);
  s.advance(1000);
  s.voice.request('error', 'late');
  assert.equal(s.voice.get().state, 'listening');
  assert.equal(s.changes.length, 0);
});

test('heard is a state and interrupted stays as an alias', async () => {
  const {VOICE_STATES} = await import('../src/voice/state.js');
  assert.ok(VOICE_STATES.includes('heard') && VOICE_STATES.includes('interrupted'));
});
