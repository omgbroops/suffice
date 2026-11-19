import test from 'node:test';
import assert from 'node:assert/strict';
import { createCascadeVoice } from '../src/voice/provider-cascade.js';
import { callEstimate, voiceByLabel, voiceLabels } from '../src/voice/backend-voices.js';
import { settingsSections } from '../src/settings-data.js';

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
function rig({ transcript = 'Add a test.', speak, autoplay = false, failTranscribe = '' } = {}) {
  const events = [], clock = { t: 1000 }, dicts = [];
  const makeDictation = ({ onLevel, onState }) => {
    const d = { onLevel, onState, started: false, cancelled: false, start: async () => { d.started = true; }, cancel: async () => { d.cancelled = true; },
      accept: async () => { if (failTranscribe) { onState({ state: 'error', message: failTranscribe }); return ''; } return transcript; } };
    dicts.push(d); return d;
  };
  const voice = createCascadeVoice({ emit: e => events.push(e), now: () => clock.t, makeDictation, speak, autoplay });
  const level = (v, ms = 100) => { clock.t += ms; dicts.at(-1).onLevel(v); };
  const types = () => events.map(e => e.type === 'state' ? `state:${e.state}` : e.type);
  return { voice, events, clock, dicts, level, types };
}

test('cascade: a spoken turn runs through the backend session to the agent and back', async () => {
  const r = rig();
  await r.voice.start();
  assert.deepEqual(r.types(), ['state:connecting', 'state:listening']);
  r.level(0.3); r.level(0.3);
  assert.ok(r.types().includes('state:hearing'));
  r.level(0, 1300); // silence ends the turn
  await flush();
  const call = r.events.find(e => e.type === 'tool_call');
  assert.deepEqual([call.name, call.args], ['background_agent', { prompt: 'Add a test.' }]);
  assert.ok(r.events.some(e => e.type === 'user_final' && e.text === 'Add a test.'));
  assert.equal(r.dicts.length, 2, 'a fresh recording opens for the next turn');
  r.voice.sendProgress('I added the test. It passes.'); r.voice.finishTask(call.id);
  await flush();
  assert.ok(r.events.some(e => e.type === 'agent_final' && e.text === 'I added the test. It passes.'));
  assert.equal(r.events.at(-1).state, 'listening');
  assert.ok(r.voice.usage().audioInSec > 0 && r.voice.usage().audioOutSec > 0, 'usage feeds the cost estimate');
  await r.voice.stop();
  assert.deepEqual(r.events.at(-1), { type: 'ended', reason: 'requested' });
  assert.ok(r.dicts.every(d => d.cancelled || d.started));
});

test('cascade: speaking over the agent cuts it off', async () => {
  let abort;
  const r = rig({ autoplay: true, speak: (_t, signal) => new Promise(res => { abort = () => res(); signal.addEventListener('abort', abort); }) });
  await r.voice.start();
  r.level(0.3); r.level(0, 1300); await flush();
  const call = r.events.find(e => e.type === 'tool_call');
  r.voice.sendProgress('Done. Everything passes.'); r.voice.finishTask(call.id); await flush();
  assert.ok(r.types().includes('state:speaking'));
  r.level(0.4);
  const last = r.events.filter(e => e.type === 'agent_final').at(-1);
  assert.equal(last.interrupted, true);
  assert.ok(r.types().includes('state:heard'));
});

test('cascade: a failed transcription ends the call with its message', async () => {
  const r = rig({ failTranscribe: 'Add an OpenAI API key in Settings, Providers, to use voice.' });
  await r.voice.start(); r.level(0.3); r.level(0, 1300); await flush();
  assert.ok(r.events.some(e => e.type === 'error' && /API key/.test(e.message)));
  assert.deepEqual(r.events.at(-1), { type: 'ended', reason: 'error' });
});

test('cascade: muting closes the mic and ignores sound', async () => {
  const r = rig();
  await r.voice.start(); const first = r.dicts[0];
  r.voice.setMuted(true);
  assert.equal(first.cancelled, true); assert.equal(r.events.at(-1).state, 'muted');
  const n = r.events.length; first.onLevel(0.5); assert.equal(r.events.length, n);
});

test('estimate and settings: registry notes drive the quote and the Settings row', () => {
  assert.deepEqual(voiceLabels(), ['Cascade', 'Realtime']);
  assert.equal(callEstimate('cascade').text, 'Speech to text, then your agent, then a spoken reply');
  assert.equal(callEstimate('openai-realtime').text, 'One speech-to-speech model, lowest delay');
  assert.equal(callEstimate('fake'), null);
  assert.equal(voiceByLabel('nope').kind, 'cascade');
  const row = settingsSections.find(s => s.id === 'agent').groups.flatMap(g => g.rows).find(x => x.id === 'voice-provider');
  assert.deepEqual([row.value, row.options], ['Cascade', ['Cascade', 'Realtime']]);
  assert.match(row.detail, /Cascade: speech to text/);assert.doesNotMatch(row.detail, /\$/);
});
