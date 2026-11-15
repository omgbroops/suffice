// Provider-neutral voice layer: turn state machine, two provider adapters, registry, cost helper.
// No network code here: transports, STT, TTS and runners are injected.
import { assertShape } from '../contract.mjs';

/**
 * Voice provider interface (what createVoiceSession drives).
 * @typedef {Object} VoiceProvider
 * @property {(config: {sink: VoiceSink}) => (void|Promise<void>)} connect  open the stream; call sink methods as output arrives
 * @property {(chunk: Uint8Array) => void} sendAudio   one chunk of user audio (PCM16 mono)
 * @property {() => void} commit                       the user finished speaking: start the response
 * @property {() => void} cancel                       stop the current response and drop its in-flight output
 * @property {(id: string, result: {ok: boolean, output?: string, error?: string}) => void} toolResult
 * @property {() => void} close                        idempotent
 * @typedef {Object} VoiceSink  callbacks the provider invokes
 * @property {(delta: string) => void} text
 * @property {(chunk: Uint8Array) => void} audio
 * @property {(call: {name: string, args: *, id: string}) => void} toolCall
 * @property {() => void} done
 * @property {(err: Error) => void} error
 */

const PROVIDER_METHODS = ['connect', 'sendAudio', 'commit', 'cancel', 'toolResult', 'close'];
const bytes = (c) => (c && (c.byteLength ?? c.length)) || 0;

/** First sentence plus counts when text is longer than maxChars; the full text belongs on the bus. */
export function speakable(text, { maxChars = 200 } = {}) {
  const s = typeof text === 'string' ? text : (JSON.stringify(text) ?? '');
  if (s.length <= maxChars) return s;
  const first = (s.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? s).slice(0, maxChars).trim();
  const lines = s.split('\n').length;
  return `${first} (${lines} line${lines === 1 ? '' : 's'}, ${s.length} characters in total; full text is on screen)`;
}

/** @param {{audioInSec: number, audioOutSec: number}} usage @param {{inPerMin: number, outPerMin: number}} priceTable */
export function estimateCost(usage, priceTable) {
  if (!priceTable || typeof priceTable.inPerMin !== 'number' || typeof priceTable.outPerMin !== 'number') throw new TypeError('estimateCost: priceTable needs numeric inPerMin and outPerMin');
  return (usage.audioInSec * priceTable.inPerMin + usage.audioOutSec * priceTable.outPerMin) / 60;
}

/**
 * Event rules (anything not listed is ignored: returns false, emits 'voice.ignored', changes nothing):
 *  vadSpeechStart: idle -> listening; speaking|thinking -> barge-in (cancel, flush, interrupted -> listening). Ignored in push-to-talk mode.
 *  vadSpeechEnd:   listening -> commit, thinking. Ignored in push-to-talk mode.
 *  pushToTalk down: switches to push-to-talk for good; idle -> listening; speaking|thinking -> barge-in. up: listening -> commit, thinking.
 *  audioIn: forwarded only while listening. providerText/providerAudio: thinking -> speaking; ignored otherwise (late chunks of a cancelled reply).
 *  providerToolCall: thinking|speaking. providerDone: thinking|speaking with no tool pending -> idle. error and close: any state -> closed.
 * Idle timeout: the injected clock has no timers, so the host calls tick() periodically.
 * @param {{provider: VoiceProvider, clock: import('../contract.mjs').Clock, bus: import('../contract.mjs').Bus, tools: {run: (name: string, args: *) => Promise<*>}, onAudio: (chunk: Uint8Array) => void, onFlush?: () => void,
 *   options?: {speakWhileWorking?: boolean, idleMs?: number, maxChars?: number, rateIn?: number, rateOut?: number, config?: Object}}} deps
 */
export function createVoiceSession({ provider, clock, bus, tools, onAudio, onFlush = () => {}, options = {} }) {
  assertShape('provider', provider, PROVIDER_METHODS);
  assertShape('clock', clock, ['now']);
  assertShape('bus', bus, ['emit']);
  assertShape('tools', tools, ['run']);
  if (typeof onAudio !== 'function') throw new TypeError('onAudio: expected a function');
  const { speakWhileWorking = false, idleMs = 30000, maxChars = 200, rateIn = 16000, rateOut = 24000 } = options;
  for (const [k, v] of Object.entries({ idleMs, maxChars, rateIn, rateOut })) if (!(v > 0)) throw new TypeError(`options.${k}: expected a positive number`);

  let state = 'idle', ptt = false, pending = 0, epoch = 0, last = clock.now(), text = '';
  let inSec = 0, outSec = 0, turns = 0, toolCalls = 0;
  let held = []; // output audio waiting for a tool to finish (speakWhileWorking off)

  const set = (to, reason) => { const from = state; state = to; bus.emit('voice.state', { from, to, reason, at: clock.now() }); };
  const ignore = (event) => { bus.emit('voice.ignored', { event, state }); return false; };
  const guard = (fn) => { try { fn(); } catch (e) { fail(e); } };
  const accept = () => { last = clock.now(); return true; };
  const deliver = (chunk) => { outSec += bytes(chunk) / (2 * rateOut); onAudio(chunk); };
  const shut = (reason) => {
    if (state === 'closed') return false;
    set('closed', reason); pending = 0; epoch += 1; held = [];
    try { provider.close(); } catch { /* closing anyway */ }
    return true;
  };
  function fail(e) { bus.emit('voice.error', { message: String(e?.message ?? e) }); shut('error'); }
  const endTurn = () => { guard(() => provider.commit()); turns += 1; set('thinking', 'commit'); };
  const bargeIn = () => {
    set('interrupted', 'barge-in'); epoch += 1; pending = 0; held = []; text = '';
    guard(() => provider.cancel()); onFlush(); set('listening', 'barge-in');
  };
  const canSpeak = () => pending === 0 || speakWhileWorking;

  const s = {
    state: () => state,
    usage: () => ({ audioInSec: inSec, audioOutSec: outSec, turns, toolCalls }),
    audioIn(chunk) {
      if (state !== 'listening') return ignore('audioIn');
      inSec += bytes(chunk) / (2 * rateIn);
      guard(() => provider.sendAudio(chunk)); return accept();
    },
    vadSpeechStart() {
      if (ptt || state === 'closed') return ignore('vadSpeechStart');
      if (state === 'idle') { set('listening', 'vad'); return accept(); }
      if (state === 'speaking' || state === 'thinking') { bargeIn(); return accept(); }
      return ignore('vadSpeechStart');
    },
    vadSpeechEnd() {
      if (ptt || state !== 'listening') return ignore('vadSpeechEnd');
      endTurn(); return accept();
    },
    pushToTalk(dir) {
      if (dir !== 'down' && dir !== 'up') throw new TypeError("pushToTalk: expected 'down' or 'up'");
      if (state === 'closed') return ignore('pushToTalk');
      if (dir === 'down') {
        ptt = true;
        if (state === 'idle') set('listening', 'ptt');
        else if (state === 'speaking' || state === 'thinking') bargeIn();
        else return ignore('pushToTalk');
        return accept();
      }
      if (!ptt || state !== 'listening') return ignore('pushToTalk');
      endTurn(); return accept();
    },
    providerText(delta) {
      if (state !== 'thinking' && state !== 'speaking') return ignore('providerText');
      text += delta; bus.emit('voice.text', { delta });
      if (state === 'thinking' && canSpeak()) set('speaking', 'text');
      return accept();
    },
    providerAudio(chunk) {
      if (state !== 'thinking' && state !== 'speaking') return ignore('providerAudio');
      if (canSpeak()) { if (state === 'thinking') set('speaking', 'audio'); deliver(chunk); } else held.push(chunk);
      return accept();
    },
    providerToolCall(call) {
      if (!call || typeof call.name !== 'string' || typeof call.id !== 'string') throw new TypeError('providerToolCall: expected {name, args, id}');
      if (state !== 'thinking' && state !== 'speaking') return ignore('providerToolCall');
      pending += 1; accept();
      if (state === 'speaking' && !speakWhileWorking) set('thinking', 'tool');
      const my = epoch;
      (async () => {
        let res, full;
        try {
          const out = await tools.run(call.name, call.args);
          full = typeof out === 'string' ? out : (JSON.stringify(out) ?? '');
          res = { ok: true, output: speakable(full, { maxChars }) };
        } catch (e) { full = String(e?.message ?? e); res = { ok: false, error: full }; }
        if (my !== epoch || state === 'closed') return; // barged in or closed meanwhile: the result is stale
        pending -= 1; toolCalls += 1; last = clock.now();
        bus.emit('voice.tool', { id: call.id, name: call.name, ok: res.ok, output: full });
        guard(() => provider.toolResult(call.id, res));
        if (pending === 0) { const h = held; held = []; for (const c of h) deliver(c); }
      })();
      return true;
    },
    providerDone() {
      if ((state !== 'thinking' && state !== 'speaking') || pending > 0) return ignore('providerDone');
      if (text) bus.emit('voice.reply', { text });
      text = ''; set('idle', 'done'); return accept();
    },
    error(err) { fail(err); return true; },
    close() { return shut('close'); },
    tick() {
      if (state === 'closed' || pending > 0 || clock.now() - last < idleMs) return false;
      return shut('idle');
    },
  };
  const sink = { text: s.providerText, audio: s.providerAudio, toolCall: s.providerToolCall, done: s.providerDone, error: s.error };
  try { Promise.resolve(provider.connect({ ...options.config, sink })).catch(fail); } catch (e) { fail(e); }
  return s;
}

// Dialect tables for the realtime adapter. UNVERIFIED against the live APIs: event names come from memory of the docs
// and must be checked in a smoke run before use. `in` maps provider event -> generic kind; `out` maps generic kind -> event
// (null = no such event). Payload fields are assumed already normalised to delta/audio/name/args/id/message by the transport.
const REALTIME_TABLE = {
  generic: {
    in: { 'text.delta': 'text', 'audio.delta': 'audio', 'tool.call': 'tool', 'response.done': 'done', error: 'error' },
    out: { audio: 'audio.append', commit: 'audio.commit', cancel: 'response.cancel', toolResult: 'tool.result' },
  },
  openai: {
    in: { 'response.output_audio_transcript.delta': 'text', 'response.output_audio.delta': 'audio', 'response.function_call_arguments.done': 'tool', 'response.done': 'done', error: 'error' },
    out: { audio: 'input_audio_buffer.append', commit: 'input_audio_buffer.commit', cancel: 'response.cancel', toolResult: 'conversation.item.create' },
  },
  gemini: {
    in: { 'serverContent.outputTranscription': 'text', 'serverContent.modelTurn': 'audio', toolCall: 'tool', 'serverContent.turnComplete': 'done', error: 'error' },
    out: { audio: 'realtimeInput.audio', commit: 'realtimeInput.audioStreamEnd', cancel: null, toolResult: 'toolResponse' },
  },
};

/**
 * Speech-to-speech adapter over one bidirectional stream.
 * @param {{transport: {open: (config: Object) => (void|Promise<void>), send: (msg: Object) => void, close: () => void, on: (fn: (msg: Object) => void) => void}}} deps
 * @returns {VoiceProvider & {table: typeof REALTIME_TABLE}}
 */
export function createRealtimeProvider({ transport }) {
  assertShape('transport', transport, ['open', 'send', 'close', 'on']);
  let sink, out, inMap, closed = false;
  const send = (kind, extra) => { if (out[kind]) transport.send({ type: out[kind], ...extra }); };
  return {
    table: REALTIME_TABLE,
    connect(config) {
      const dialect = REALTIME_TABLE[config?.dialect ?? 'generic'];
      if (!dialect) throw new TypeError(`connect: unknown dialect ${config.dialect}`);
      assertShape('sink', config.sink, ['text', 'audio', 'toolCall', 'done', 'error']);
      ({ out, in: inMap } = dialect); sink = config.sink;
      transport.on((msg) => {
        if (closed) return;
        switch (inMap[msg?.type]) {
          case 'text': return sink.text(msg.delta);
          case 'audio': return sink.audio(msg.audio);
          case 'tool': return sink.toolCall({ name: msg.name, args: typeof msg.args === 'string' ? JSON.parse(msg.args) : msg.args, id: msg.id });
          case 'done': return sink.done();
          case 'error': return sink.error(new Error(msg.message ?? 'provider error'));
          default: // unknown events are ignored on purpose: providers add events often
        }
      });
      return transport.open(config);
    },
    sendAudio: (chunk) => send('audio', { audio: chunk }),
    commit: () => send('commit'),
    cancel: () => send('cancel'),
    toolResult: (id, result) => send('toolResult', { id, output: result }),
    close() { if (!closed) { closed = true; transport.close(); } },
  };
}

// Split complete sentences off buf; a terminator only counts when followed by whitespace, so "3.5" stays whole.
function splitSentences(buf) {
  const done = []; let m;
  while ((m = /^\s*([\s\S]*?[.!?]+)\s+/.exec(buf))) { done.push(m[1]); buf = buf.slice(m[0].length); }
  return { done, rest: buf };
}

/**
 * Cascade adapter: STT -> text runner -> TTS, TTS fed sentence by sentence.
 * stt.transcribe(chunks, {signal}) -> string; llm is a Runner, and an optional llm.stream(req) async-iterates text deltas
 * (without it the full run() text is split into sentences); tts.synthesize(sentence, {signal}) -> audio chunk.
 * Tool calls are not routed through a cascade (Runner has no tool contract): toolResult is a no-op.
 * @returns {VoiceProvider}
 */
export function createCascadeProvider({ stt, llm, tts }) {
  assertShape('stt', stt, ['transcribe']); assertShape('llm', llm, ['run']); assertShape('tts', tts, ['synthesize']);
  let sink, chunks = [], epoch = 0, ctrl = null;
  const abort = () => { epoch += 1; ctrl?.abort(); ctrl = null; };
  async function turn(audio) {
    abort(); const my = epoch; ctrl = new AbortController(); const { signal } = ctrl;
    const stale = () => my !== epoch;
    try {
      const prompt = (await stt.transcribe(audio, { signal }))?.trim();
      if (stale()) return;
      if (!prompt) return sink.done();
      const req = { prompt, signal };
      const source = llm.stream ? llm.stream(req) : (async function* () {
        const r = await llm.run(req);
        if (!r.ok) throw new Error(r.error ?? 'llm failed');
        yield r.text ?? '';
      })();
      let buf = '', chain = Promise.resolve();
      const speak = (sentence) => { // a chain keeps audio in sentence order while synthesis overlaps the reply
        chain = chain.then(async () => {
          if (stale()) return;
          sink.text(sentence);
          const a = await tts.synthesize(sentence, { signal });
          if (!stale()) sink.audio(a);
        });
        chain.catch(() => {}); // the final await reports it
      };
      for await (const d of source) {
        if (stale()) return;
        const { done, rest } = splitSentences(buf + d); buf = rest; done.forEach(speak);
      }
      if (buf.trim()) speak(buf.trim());
      await chain;
      if (!stale()) sink.done();
    } catch (e) { if (!stale()) sink.error(e); }
  }
  return {
    connect(config) { assertShape('sink', config?.sink, ['text', 'audio', 'done', 'error']); sink = config.sink; },
    sendAudio: (c) => { chunks.push(c); },
    commit() { const a = chunks; chunks = []; turn(a); },
    cancel() { abort(); chunks = []; },
    toolResult() {},
    close() { abort(); },
  };
}

/** Registry of plugin-contributed voices: name "<plugin>:<voice>" -> {title?, create}. */
export function createVoiceRegistry() {
  const voices = new Map();
  return {
    register(name, def) {
      if (typeof name !== 'string' || !/^[a-z0-9-]+(:[a-z0-9-]+)?$/.test(name)) throw new TypeError('register: name must be lowercase letters, digits, dashes, optional "plugin:voice"');
      if (!def || typeof def.create !== 'function') throw new TypeError('register: def.create must be a function');
      if (voices.has(name)) throw new TypeError(`register: ${name} already registered`);
      voices.set(name, def);
    },
    unregister: (name) => voices.delete(name),
    get: (name) => voices.get(name),
    list: () => [...voices].map(([name, d]) => ({ name, title: d.title ?? name })),
  };
}
