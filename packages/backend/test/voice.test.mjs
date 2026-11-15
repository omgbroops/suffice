import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVoiceSession, createRealtimeProvider, createCascadeProvider, createVoiceRegistry, speakable, estimateCost,
} from '../src/voice/index.mjs';

const tick = () => new Promise((r) => setImmediate(r));
const mkClock = () => { let t = 1000; return { now: () => t, advance: (ms) => { t += ms; } }; };
const mkBus = () => {
  const events = []; const subs = [];
  return { events, on: (type, fn) => { subs.push([type, fn]); return () => {}; }, emit: (type, payload) => { events.push({ type, payload }); for (const [t, f] of subs) if (t === type) f(payload); } };
};
const mkProvider = () => {
  const calls = [];
  const p = { calls, sink: null,
    connect: (cfg) => { p.sink = cfg.sink; calls.push(['connect']); },
    sendAudio: (c) => calls.push(['sendAudio', c]), commit: () => calls.push(['commit']), cancel: () => calls.push(['cancel']),
    toolResult: (id, r) => calls.push(['toolResult', id, r]), close: () => calls.push(['close']) };
  return p;
};
const count = (p, name) => p.calls.filter((c) => c[0] === name).length;
const states = (bus) => bus.events.filter((e) => e.type === 'voice.state').map((e) => e.payload.to);
const pcm = (bytes) => new Uint8Array(bytes);

function setup(extra = {}) {
  const provider = mkProvider(); const clock = mkClock(); const bus = mkBus(); const audio = []; let flushes = 0;
  const tools = extra.tools ?? { run: async (name, args) => `ran ${name}` };
  const s = createVoiceSession({ provider, clock, bus, tools, onAudio: (c) => audio.push(c), onFlush: () => { flushes += 1; }, options: extra.options });
  return { s, provider, clock, bus, audio, flushes: () => flushes };
}
// drive a session to the speaking state
const toSpeaking = (s) => { s.vadSpeechStart(); s.vadSpeechEnd(); s.providerText('Hello.'); };

test('full turn walks idle, listening, thinking, speaking, idle', () => {
  const { s, provider, bus, audio } = setup();
  assert.equal(s.state(), 'idle');
  s.vadSpeechStart();
  s.audioIn(pcm(100)); s.audioIn(pcm(100));
  assert.equal(count(provider, 'sendAudio'), 2);
  s.vadSpeechEnd();
  assert.equal(count(provider, 'commit'), 1);
  s.providerText('Hi there.');
  s.providerAudio(pcm(10));
  assert.equal(audio.length, 1);
  s.providerDone();
  assert.deepEqual(states(bus), ['listening', 'thinking', 'speaking', 'idle']);
  assert.equal(bus.events.find((e) => e.type === 'voice.reply').payload.text, 'Hi there.');
});

test('barge-in cancels, flushes and reaches listening within one event', () => {
  const { s, provider, bus, audio, flushes } = setup();
  toSpeaking(s);
  s.providerAudio(pcm(10));
  const before = bus.events.length;
  s.vadSpeechStart();
  assert.equal(s.state(), 'listening');
  assert.equal(count(provider, 'cancel'), 1);
  assert.equal(flushes(), 1);
  assert.deepEqual(bus.events.slice(before).filter((e) => e.type === 'voice.state').map((e) => e.payload.to), ['interrupted', 'listening']);
  s.providerAudio(pcm(10)); // late chunk from the cancelled response
  s.providerText('stale');
  assert.equal(audio.length, 1);
  assert.equal(s.state(), 'listening');
});

test('push-to-talk ignores VAD', () => {
  const { s, provider } = setup();
  s.pushToTalk('down');
  assert.equal(s.state(), 'listening');
  assert.equal(s.vadSpeechEnd(), false);
  assert.equal(count(provider, 'commit'), 0);
  s.pushToTalk('up');
  assert.equal(count(provider, 'commit'), 1);
  assert.equal(s.state(), 'thinking');
  s.providerText('ok.');
  assert.equal(s.vadSpeechStart(), false);
  assert.equal(s.state(), 'speaking');
  assert.equal(count(provider, 'cancel'), 0);
  s.pushToTalk('down');
  assert.equal(s.state(), 'listening');
  assert.equal(count(provider, 'cancel'), 1);
});

test('tool call round trip: result goes to provider, full text to bus', async () => {
  const long = 'Sunny today. ' + 'x'.repeat(500);
  const { s, provider, bus } = setup({ tools: { run: async (n, a) => { assert.deepEqual([n, a], ['weather', { q: 1 }]); return long; } }, options: { maxChars: 40 } });
  s.vadSpeechStart(); s.vadSpeechEnd();
  s.providerToolCall({ name: 'weather', args: { q: 1 }, id: 't1' });
  await tick();
  const [, id, res] = provider.calls.find((c) => c[0] === 'toolResult');
  assert.equal(id, 't1');
  assert.equal(res.ok, true);
  assert.match(res.output, /^Sunny today\./);
  assert.ok(res.output.length < long.length);
  assert.equal(bus.events.find((e) => e.type === 'voice.tool').payload.output, long);
  assert.equal(s.usage().toolCalls, 1);
});

test('a throwing tool returns an error result and the session lives', async () => {
  const { s, provider } = setup({ tools: { run: async () => { throw new Error('boom'); } } });
  s.vadSpeechStart(); s.vadSpeechEnd();
  s.providerToolCall({ name: 'bad', args: {}, id: 't9' });
  await tick();
  assert.deepEqual(provider.calls.find((c) => c[0] === 'toolResult').slice(1), ['t9', { ok: false, error: 'boom' }]);
  assert.equal(s.state(), 'thinking');
  s.providerText('Sorry.');
  assert.equal(s.state(), 'speaking');
});

test('speakWhileWorking off holds filler audio until the tool finishes; on plays it', async () => {
  for (const on of [false, true]) {
    let release; const gate = new Promise((r) => { release = r; });
    const { s, audio } = setup({ tools: { run: () => gate }, options: { speakWhileWorking: on } });
    s.vadSpeechStart(); s.vadSpeechEnd();
    s.providerToolCall({ name: 't', args: {}, id: 'a' });
    s.providerAudio(pcm(10)); // filler
    assert.equal(audio.length, on ? 1 : 0, `on=${on}`);
    assert.equal(s.state(), on ? 'speaking' : 'thinking');
    release('done'); await tick();
    assert.equal(audio.length, 1);
  }
});

test('idle timeout closes through the injected clock and activity resets it', () => {
  const { s, provider, clock, bus } = setup({ options: { idleMs: 1000 } });
  clock.advance(500); s.vadSpeechStart(); s.vadSpeechEnd(); s.providerText('x.'); s.providerDone();
  clock.advance(999); s.tick();
  assert.equal(s.state(), 'idle');
  clock.advance(1); s.tick();
  assert.equal(s.state(), 'closed');
  assert.equal(count(provider, 'close'), 1);
  assert.equal(bus.events.filter((e) => e.type === 'voice.state').at(-1).payload.reason, 'idle');
});

test('usage accumulates seconds in and out and prices them', () => {
  const { s } = setup();
  s.vadSpeechStart();
  s.audioIn(pcm(32000)); s.audioIn(pcm(32000)); // 16 kHz PCM16 mono = 32000 B/s
  s.vadSpeechEnd(); s.providerText('a.'); s.providerAudio(pcm(48000)); // 24 kHz = 48000 B/s
  const u = s.usage();
  assert.equal(u.audioInSec, 2); assert.equal(u.audioOutSec, 1);
  assert.ok(Math.abs(estimateCost(u, { inPerMin: 0.06, outPerMin: 0.12 }) - 0.24 / 60) < 1e-12);
  assert.throws(() => estimateCost(u, {}), TypeError);
});

test('illegal events are ignored (return false, no state change, bus note)', () => {
  const { s, provider, bus } = setup();
  assert.equal(s.providerText('x'), false);
  assert.equal(s.vadSpeechEnd(), false);
  assert.equal(s.audioIn(pcm(10)), false);
  assert.equal(s.pushToTalk('up'), false);
  assert.equal(s.providerDone(), false);
  assert.equal(s.state(), 'idle');
  assert.equal(count(provider, 'sendAudio'), 0);
  assert.ok(bus.events.some((e) => e.type === 'voice.ignored' && e.payload.event === 'providerText'));
  assert.throws(() => s.pushToTalk('sideways'), TypeError);
});

test('providerDone while a tool is pending is ignored', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const { s } = setup({ tools: { run: () => gate } });
  s.vadSpeechStart(); s.vadSpeechEnd();
  s.providerToolCall({ name: 't', args: {}, id: 'a' });
  assert.equal(s.providerDone(), false);
  assert.equal(s.state(), 'thinking');
  release('x'); await tick();
});

test('close is idempotent; late tool results and events after close are dropped', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const { s, provider, bus } = setup({ tools: { run: () => gate } });
  s.vadSpeechStart(); s.vadSpeechEnd();
  s.providerToolCall({ name: 't', args: {}, id: 'a' });
  s.close(); s.close();
  assert.equal(count(provider, 'close'), 1);
  assert.equal(states(bus).filter((x) => x === 'closed').length, 1);
  release('late'); await tick();
  assert.equal(count(provider, 'toolResult'), 0);
  assert.equal(s.vadSpeechStart(), false);
  assert.equal(s.state(), 'closed');
});

test('provider error closes the session and reports on the bus', () => {
  const { s, bus } = setup();
  s.vadSpeechStart();
  s.error(new Error('socket reset'));
  assert.equal(s.state(), 'closed');
  assert.equal(bus.events.find((e) => e.type === 'voice.error').payload.message, 'socket reset');
});

test('provider callbacks reach the session through the sink', () => {
  const { s, provider } = setup();
  s.vadSpeechStart(); s.vadSpeechEnd();
  provider.sink.text('Yo.');
  assert.equal(s.state(), 'speaking');
  provider.sink.done();
  assert.equal(s.state(), 'idle');
});

test('speakable keeps short text, shortens long text to first sentence plus counts', () => {
  assert.equal(speakable('Short one.', { maxChars: 50 }), 'Short one.');
  const long = 'First sentence here. ' + 'word '.repeat(100) + '\nsecond line';
  const out = speakable(long, { maxChars: 60 });
  assert.match(out, /^First sentence here\./);
  assert.match(out, /2 lines/);
  assert.match(out, new RegExp(`${long.length} characters`));
  assert.ok(speakable('y'.repeat(500), { maxChars: 30 }).startsWith('y'.repeat(30)));
  assert.equal(speakable({ a: 1 }, { maxChars: 50 }), '{"a":1}');
});

test('boundary validation throws TypeError', () => {
  assert.throws(() => createVoiceSession({}), TypeError);
  assert.throws(() => createVoiceSession({ provider: {}, clock: mkClock(), bus: mkBus(), tools: { run() {} }, onAudio() {} }), TypeError);
  assert.throws(() => createRealtimeProvider({}), TypeError);
  assert.throws(() => createCascadeProvider({ stt: {}, llm: {}, tts: {} }), TypeError);
});

test('realtime provider maps generic and dialect events over a fake transport', async () => {
  for (const dialect of ['generic', 'openai', 'gemini']) {
    const sent = []; let handler; let opened = null; let closed = 0;
    const transport = { open: async (c) => { opened = c; }, send: (m) => sent.push(m), close: () => { closed += 1; }, on: (fn) => { handler = fn; } };
    const p = createRealtimeProvider({ transport });
    const got = [];
    const sink = { text: (d) => got.push(['text', d]), audio: (c) => got.push(['audio', c]), toolCall: (c) => got.push(['tool', c]), done: () => got.push(['done']), error: (e) => got.push(['error', e.message]) };
    await p.connect({ dialect, sink });
    assert.equal(opened.dialect, dialect);
    p.sendAudio('AA'); p.commit(); p.cancel(); p.toolResult('id1', { ok: true });
    assert.ok(sent.length >= 3 && sent.every((m) => typeof m.type === 'string'), dialect);
    assert.equal(sent[0].audio, 'AA');
    const t = (name) => Object.entries(p.table[dialect].in).find(([, g]) => g === name)[0];
    handler({ type: t('text'), delta: 'hi' });
    handler({ type: t('audio'), audio: 'BB' });
    handler({ type: t('tool'), name: 'n', args: '{"a":1}', id: 'z' });
    handler({ type: t('done') });
    handler({ type: t('error'), message: 'bad' });
    handler({ type: 'unknown.event' });
    assert.deepEqual(got, [['text', 'hi'], ['audio', 'BB'], ['tool', { name: 'n', args: { a: 1 }, id: 'z' }], ['done'], ['error', 'bad']]);
    p.close(); p.close();
    assert.equal(closed, 1);
  }
  assert.throws(() => createRealtimeProvider({ transport: { open() {}, send() {}, close() {}, on() {} } }).connect({ dialect: 'nope', sink: {} }), TypeError);
});

const cascadeRig = (over = {}) => {
  const ttsCalls = []; const got = [];
  const sink = { text: (d) => got.push(['text', d]), audio: (c) => got.push(['audio', c]), toolCall() {}, done: () => got.push(['done']), error: (e) => got.push(['error', e.message]) };
  const stt = { transcribe: async (chunks) => { got.push(['stt', chunks.length]); return 'what time is it'; } };
  const tts = over.tts ?? { synthesize: async (text) => { ttsCalls.push(text); return `A(${text})`; } };
  const p = createCascadeProvider({ stt, llm: over.llm, tts });
  return { p, got, sink, ttsCalls };
};

test('cascade streams sentence by sentence to TTS before the reply is complete', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const llm = { run: async () => { throw new Error('unused'); }, stream: async function* () { yield 'Hello th'; yield 'ere. How are'; yield ' you? Fine'; await gate; yield ' now'; } };
  const { p, got, sink, ttsCalls } = cascadeRig({ llm });
  p.connect({ sink });
  p.sendAudio('c1'); p.sendAudio('c2'); p.commit();
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(ttsCalls, ['Hello there.', 'How are you?']); // spoken while "Fine now" is still unwritten
  assert.equal(got.some((g) => g[0] === 'done'), false);
  release(); for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(ttsCalls, ['Hello there.', 'How are you?', 'Fine now']);
  assert.deepEqual(got.filter((g) => g[0] === 'audio').map((g) => g[1]), ['A(Hello there.)', 'A(How are you?)', 'A(Fine now)']);
  assert.deepEqual(got[0], ['stt', 2]);
  assert.deepEqual(got.at(-1), ['done']);
});

test('cascade falls back to Runner.run and splits the full text', async () => {
  const llm = { run: async (req) => { assert.equal(req.prompt, 'what time is it'); return { ok: true, text: 'One. Two.', usage: { inputTokens: 0, outputTokens: 0 }, ms: 1 }; } };
  const { p, sink, ttsCalls, got } = cascadeRig({ llm });
  p.connect({ sink }); p.sendAudio('c'); p.commit();
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(ttsCalls, ['One.', 'Two.']);
  assert.deepEqual(got.at(-1), ['done']);
});

test('cascade cancel aborts in-flight TTS and drops late audio', async () => {
  let release; const gate = new Promise((r) => { release = r; }); let signal;
  const tts = { synthesize: async (text, opts) => { signal = opts.signal; await gate; return 'late'; } };
  const llm = { run: async () => ({ ok: true, text: 'One. Two.', usage: { inputTokens: 0, outputTokens: 0 }, ms: 1 }) };
  const { p, sink, got } = cascadeRig({ llm, tts });
  p.connect({ sink }); p.sendAudio('c'); p.commit();
  for (let i = 0; i < 5; i++) await tick();
  p.cancel();
  assert.equal(signal.aborted, true);
  release(); for (let i = 0; i < 10; i++) await tick();
  assert.equal(got.some((g) => g[0] === 'audio' || g[0] === 'done'), false);
});

test('cascade reports llm failure through the sink', async () => {
  const llm = { run: async () => ({ ok: false, error: 'no model', usage: { inputTokens: 0, outputTokens: 0 }, ms: 1 }) };
  const { p, sink, got } = cascadeRig({ llm });
  p.connect({ sink }); p.sendAudio('c'); p.commit();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(got.at(-1), ['error', 'no model']);
});

test('registry registers, lists, rejects duplicates and unknown names', () => {
  const r = createVoiceRegistry();
  const factory = () => mkProvider();
  r.register('acme:warm', { title: 'Warm', create: factory });
  assert.deepEqual(r.list().map((v) => v.name), ['acme:warm']);
  assert.equal(r.get('acme:warm').create, factory);
  assert.throws(() => r.register('acme:warm', { create: factory }), TypeError);
  assert.throws(() => r.register('Bad Name', { create: factory }), TypeError);
  assert.throws(() => r.register('acme:x', {}), TypeError);
  assert.equal(r.get('nope'), undefined);
  assert.equal(r.unregister('acme:warm'), true);
  assert.equal(r.list().length, 0);
});

test('full session over the cascade provider', async () => {
  const llm = { run: async () => ({ ok: true, text: 'Noon.', usage: { inputTokens: 0, outputTokens: 0 }, ms: 1 }) };
  const prov = createCascadeProvider({ stt: { transcribe: async () => 'time' }, llm, tts: { synthesize: async () => pcm(48000) } });
  const bus = mkBus(); const audio = [];
  const s = createVoiceSession({ provider: prov, clock: mkClock(), bus, tools: { run() {} }, onAudio: (c) => audio.push(c) });
  s.vadSpeechStart(); s.audioIn(pcm(32000)); s.vadSpeechEnd();
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(s.state(), 'idle');
  assert.equal(audio.length, 1);
  assert.equal(s.usage().audioOutSec, 1);
});
