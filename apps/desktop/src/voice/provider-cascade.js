// Cascade voice provider: mic -> speech to text -> the app's agent -> spoken reply.
// The turn logic is the backend's createVoiceSession + createCascadeProvider (packages/backend/src/voice); this file adds
// the browser parts: the mic (dictation.js records and transcribes), silence detection and speech output.
// shortcut: the recording is webm, so the session is fed silent byte counts of the same duration (they only feed the cost
// counter); an STT or mic failure ends the call, and audio before the first word is sent too (a 60 s idle limit bounds it).
import { registerVoiceProvider } from './provider.js';
import { createDictation } from './dictation.js';
import { createVoiceSession, createCascadeProvider, speakable } from '../../../../packages/backend/src/voice/index.mjs';

const LOUD = 0.04, SILENCE_MS = 1200, IDLE_MS = 60000, RATE_IN = 16000, RATE_OUT = 8000, CHARS_PER_SEC = 15;
const SHOWN = { listening: 'hearing', thinking: 'thinking', speaking: 'speaking' };

const speakAloud = (text, signal, rate = 1) => new Promise(resolve => {
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return resolve();
  const utterance = new SpeechSynthesisUtterance(text); utterance.rate = rate;
  const done = () => { signal?.removeEventListener('abort', stop); resolve(); };
  const stop = () => { synth.cancel(); done(); };
  utterance.onend = utterance.onerror = done;
  signal?.addEventListener('abort', stop, { once: true });
  synth.speak(utterance);
});

export function createCascadeVoice({ emit, now = () => Date.now(), makeDictation = createDictation, speak = speakAloud, deviceId, autoplay = true, speed = 1 } = {}) {
  let session = null, dict = null, muted = false, stopped = false, loudAt = 0, lastTick = 0, text = '', waiting = null, progress = '', calls = 0;

  const bus = {
    emit(type, p) {
      if (stopped) return;
      if (type === 'voice.state') {
        if (p.to === 'closed') return closed(p.reason);
        if (p.to === 'interrupted') { if (text) emit({ type: 'agent_final', text, interrupted: true, heard: text }); text = ''; return emit({ type: 'state', state: 'heard' }); }
        if (p.to === 'idle') { if (text) emit({ type: 'agent_final', text }); text = ''; if (!muted) emit({ type: 'state', state: 'listening' }); return; }
        if (SHOWN[p.to] && !muted) emit({ type: 'state', state: SHOWN[p.to] });
      } else if (type === 'voice.text') { text = text ? `${text} ${p.delta}` : p.delta; emit({ type: 'agent_partial', text }); }
      else if (type === 'voice.error') emit({ type: 'error', message: p.message });
    },
  };

  function closed(reason) {
    stopped = true; dict?.cancel();
    if (reason === 'error') emit({ type: 'ended', reason: 'error' });
    else if (reason === 'idle') { emit({ type: 'notice', text: 'Voice ended after a minute of silence.' }); emit({ type: 'ended', reason: 'transport_closed' }); }
  }

  function openMic() {
    dict = makeDictation({ deviceId, onLevel, onState: ({ state, message }) => { if (state === 'error' && !stopped) session.error(new Error(message || 'Voice could not use the microphone.')); } });
    return dict.start();
  }

  // Silence detection: loud while idle starts a turn, loud while the agent speaks cuts it off, 1.2 s quiet ends the turn.
  function onLevel(level) {
    if (stopped || muted || !session) return;
    const t = now(), st = session.state();
    emit({ type: 'level', input: Math.min(1, level * 4) });
    if (level > LOUD) {
      loudAt = t;
      if (st === 'idle' || st === 'speaking') session.vadSpeechStart();
    }
    if (session.state() === 'listening') {
      session.audioIn(new Uint8Array(Math.round(2 * RATE_IN * Math.min(1000, t - (lastTick || t)) / 1000)));
      if (t - loudAt > SILENCE_MS) session.vadSpeechEnd();
    } else if (st === 'idle') session.tick();
    lastTick = t;
  }

  const stt = {
    async transcribe() { // each turn takes the recording so far and opens a fresh one for what comes next
      const turn = dict; await openMic().catch(() => {}); return turn.accept();
    },
  };
  const llm = {
    // The agent is the app's own: the prompt leaves as a background_agent tool call and the reply comes back through
    // finishTask / sendToolResult / steerAck, exactly like the realtime provider.
    run({ prompt, signal }) {
      const id = `cascade_${++calls}`;
      return new Promise(resolve => {
        waiting = { id, resolve: reply => { waiting = null; resolve({ ok: true, text: speakable(reply, { maxChars: 400 }) }); } };
        signal?.addEventListener('abort', () => waiting?.resolve(''), { once: true });
        emit({ type: 'user_final', text: prompt });
        emit({ type: 'state', state: 'working' });
        emit({ type: 'tool_call', id, name: 'background_agent', args: { prompt } });
      });
    },
  };
  const tts = {
    async synthesize(sentence, { signal }) {
      emit({ type: 'level', output: 0.5 });
      if (autoplay) await speak(sentence, signal, speed);
      emit({ type: 'level', output: 0 });
      return new Uint8Array(Math.round(sentence.length / CHARS_PER_SEC * 2 * RATE_OUT));
    },
  };

  const answer = (id, reply) => { if (waiting?.id === id) waiting.resolve(reply); };
  return {
    async start() {
      emit({ type: 'state', state: 'connecting' });
      session = createVoiceSession({
        provider: createCascadeProvider({ stt, llm, tts }), clock: { now }, bus, tools: { run: async () => '' },
        onAudio: () => {}, options: { speakWhileWorking: true, idleMs: IDLE_MS, rateIn: RATE_IN, rateOut: RATE_OUT },
      });
      await openMic();
      if (!stopped && !muted) emit({ type: 'state', state: 'listening' });
    },
    async stop() {
      if (stopped) return;
      session?.close(); stopped = true; await dict?.cancel();
      emit({ type: 'ended', reason: 'requested' });
    },
    setMuted(value) {
      if (stopped || value === muted) return;
      muted = value;
      if (muted) { dict?.cancel(); if (session?.state() === 'speaking') session.vadSpeechStart(); emit({ type: 'state', state: 'muted' }); }
      else { void openMic(); emit({ type: 'state', state: 'listening' }); }
    },
    interrupt() { if (session?.state() === 'speaking') session.vadSpeechStart(); },
    suppressSpeech() { if (session?.state() === 'speaking') { loudAt = now(); session.vadSpeechStart(); } },
    sendProgress(line) { progress = String(line); },
    finishTask(id) { answer(id, progress); },
    steerAck(id) { answer(id, 'Okay, I passed that on.'); },
    sendToolResult(id, line, { respond = true } = {}) { if (respond) answer(id, String(line)); },
    usage: () => session?.usage(),
  };
}

registerVoiceProvider('cascade', deps => createCascadeVoice(deps));
