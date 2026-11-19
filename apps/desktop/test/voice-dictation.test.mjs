import assert from 'node:assert/strict';
import test from 'node:test';
import { createDictation } from '../src/voice/dictation.js';

function rig({ deny = false, rms = 0.5, result = { text: '  hi there ' } } = {}) {
  let clock = 0;
  const r = { states: [], levels: [], tracks: [], closed: 0, calls: [], timers: [] };
  r.advance = (ms) => { clock += ms; };
  const track = { stopped: 0, stop() { this.stopped++; } };
  r.track = track;
  class MR {
    static isTypeSupported(m) { return m === 'audio/webm;codecs=opus'; }
    constructor(stream, opts) { this.opts = opts; this.state = 'inactive'; r.mr = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.opts.mimeType }) }); queueMicrotask(() => this.onstop()); }
  }
  class AC {
    createAnalyser() { return { fftSize: 0, getFloatTimeDomainData: (b) => b.fill(rms) }; }
    createMediaStreamSource() { return { connect() {} }; }
    close() { r.closed++; }
  }
  r.d = createDictation({
    getUserMedia: async (c) => { r.constraints = c; if (deny) throw new Error('NotAllowedError'); return { getTracks: () => [track] }; },
    MediaRecorderImpl: MR, AudioContextImpl: AC,
    transcribe: async (p) => { r.calls.push(p); if (result instanceof Error) throw result; return result; },
    deviceId: 'dev1', onLevel: (v) => r.levels.push(v), onState: (s) => r.states.push(s.state === 'error' ? s : s.state), now: () => clock,
  });
  return r;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('accept: states, mime, constraints, trimmed text, cleanup', async () => {
  const r = rig();
  await r.d.start();
  assert.equal(r.mr.opts.mimeType, 'audio/webm;codecs=opus');
  assert.deepEqual(r.constraints.audio, { echoCancellation: true, noiseSuppression: true, autoGainControl: true, deviceId: { exact: 'dev1' } });
  r.advance(1000);
  assert.equal(r.d.elapsed, 1000);
  assert.equal(await r.d.accept(), 'hi there');
  assert.deepEqual(r.states, ['starting', 'recording', 'transcribing', 'idle']);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].mimeType, 'audio/webm;codecs=opus');
  assert.equal(r.track.stopped, 1); assert.equal(r.closed, 1);
});
test('cancel: no API call, resolves nothing, cleanup', async () => {
  const r = rig();
  await r.d.start(); r.advance(2000);
  assert.equal(await r.d.cancel(), undefined);
  assert.deepEqual(r.states, ['starting', 'recording', 'idle']);
  assert.equal(r.calls.length, 0); assert.equal(r.track.stopped, 1); assert.equal(r.closed, 1);
});
test('levels about 30 per second and clamped to 0..1', async () => {
  const r = rig({ rms: 3 });
  await r.d.start(); await wait(200); await r.d.cancel();
  assert.ok(r.levels.length >= 3 && r.levels.length <= 8, String(r.levels.length));
  assert.ok(r.levels.every((v) => v >= 0 && v <= 1)); assert.equal(r.levels[0], 1);
});
test('short recording skips the API', async () => {
  const r = rig();
  await r.d.start(); r.advance(299);
  assert.equal(await r.d.accept(), '');
  assert.equal(r.calls.length, 0); assert.equal(r.track.stopped, 1); assert.equal(r.closed, 1);
  assert.equal(r.d.state, 'idle');
});
test('mic denied sentence, nothing left open', async () => {
  const r = rig({ deny: true });
  await r.d.start();
  assert.equal(r.d.state, 'error');
  assert.equal(r.states.at(-1).message, 'Suffice could not use the microphone. Allow it in System Settings, Privacy, Microphone.');
  assert.equal(r.closed, 0);
});
test('transcription failure: error state, cleanup done', async () => {
  const r = rig({ result: new Error('Could not reach OpenAI. Check your connection and try again.') });
  await r.d.start(); r.advance(1000);
  assert.equal(await r.d.accept(), '');
  assert.equal(r.d.state, 'error');
  assert.equal(r.states.at(-1).message, 'Could not reach OpenAI. Check your connection and try again.');
  assert.equal(r.track.stopped, 1); assert.equal(r.closed, 1);
});
test('5 minute cap behaves as accept', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const r = rig();
  await r.d.start(); r.advance(300000);
  t.mock.timers.tick(300000);
  t.mock.timers.reset();
  await wait(20);
  assert.equal(r.calls.length, 1);
  assert.equal(r.d.state, 'idle');
  assert.equal(r.track.stopped, 1); assert.equal(r.closed, 1);
});

test('cancel while the mic is still opening releases the late stream', async () => {
  const track = { stopped: 0, stop() { this.stopped++; } };
  let resolveGum; let recorders = 0;
  const d = createDictation({
    getUserMedia: () => new Promise((r) => { resolveGum = () => r({ getTracks: () => [track] }); }),
    MediaRecorderImpl: class { constructor() { recorders++; } },
    AudioContextImpl: class {}, transcribe: async () => ({}),
  });
  const started = d.start();
  await d.cancel();
  resolveGum(); await started;
  assert.equal(track.stopped, 1); assert.equal(recorders, 0); assert.equal(d.state, 'idle');
});
