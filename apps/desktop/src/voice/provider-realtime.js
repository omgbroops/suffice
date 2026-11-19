// OpenAI Realtime over WebRTC. Looked up 2026-11-15 on public docs only (nothing about this project sent).
// Sources:
//   https://developers.openai.com/api/docs/guides/realtime-webrtc
//   https://developers.openai.com/api/reference/resources/realtime/server-events
//   https://developers.openai.com/api/reference/resources/realtime/client-events
//   https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create
// (platform.openai.com/docs/api-reference/* returned 403 or redirected to the pages above.)
//
// from docs: model in the WebRTC guide examples is "gpt-realtime-2.1" (the guide also names a separate
//            "gpt-live-1" product on POST /v1/live/sessions; not used here).
// from docs: mint = POST https://api.openai.com/v1/realtime/client_secrets, Authorization: Bearer <api key>,
//            body {expires_after:{anchor:'created_at',seconds:10..7200, default 600}, session:{type:'realtime',model,
//            audio.output.voice, audio.input.transcription, audio.input.turn_detection, tools:[{type:'function',name,
//            description,parameters}]}}; response {value:'ek_...', expires_at: unix seconds, session}.
// from docs: SDP = POST https://api.openai.com/v1/realtime/calls, Authorization: Bearer <ephemeral value>,
//            Content-Type: application/sdp, body = raw offer SDP; response text = SDP answer. Data channel label "oai-events".
//            Do not set audio.format for WebRTC (negotiated by SDP).
// from docs: server events: session.created, input_audio_buffer.speech_started / speech_stopped,
//            conversation.item.input_audio_transcription.delta {item_id,delta} / .completed {item_id,transcript},
//            response.created, response.output_audio_transcript.delta {delta} / .done {transcript},
//            output_audio_buffer.started / stopped / cleared (WebRTC/SIP only), response.function_call_arguments.done
//            {call_id,name,arguments(JSON string)}, response.done {response.status: completed|cancelled|failed|incomplete},
//            error {error:{message,type,code}}.
// from docs: client events: conversation.item.create {item:{type:'function_call_output',call_id,output}}, response.create,
//            response.cancel (errors, session intact, if nothing in progress), output_audio_buffer.clear (send
//            response.cancel first), conversation.item.truncate {item_id,content_index:0,audio_end_ms}.
// assumed: voice "marin" and transcription model "gpt-4o-mini-transcribe" (only the voice appears in the guide).
// assumed: conversation.item.truncate is sent on barge-in when the assistant item id is known (Codex does this over
//          websocket); over WebRTC the server may already truncate, and a repeat is assumed harmless. Barge-in sends
//          response.cancel, output_audio_buffer.clear, then truncate. The item id comes from response.output_item.added
//          or the item_id of transcript deltas (assumed fields).
// assumed: played milliseconds = wall time between output_audio_buffer.started and the barge-in (no frame counter over WebRTC).
// assumed: error text "Conversation already has an active response in progress" (from Codex) marks a response.create race.
// assumed: response.create after a user-role conversation.item.create message is accepted; item = {type:'message',role:'user',
//          content:[{type:'input_text',text}]}.
// assumed: the delta of input transcription events is incremental text for one item_id (accumulated here).
// assumed: "heard" in agent_final is the transcript received so far, not the exact audio played.
import { registerVoiceProvider } from './provider.js';

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const MIC_DENIED = 'Suffice could not use the microphone. Allow it in System Settings, Privacy, Microphone.';
const TICK_MS = 100;
const HEARD_MS = 400;
const SPEAK_HOLD_MS = 500;
const STARTUP_TIMEOUT_MS = 10000;
const PROGRESS_MAX = 4000;
const TRUNC_MARK = '\n…output truncated…\n';
const ACTIVE_RESPONSE = /already has an active response/i;
export const FINISH_OUTPUT = 'Background agent finished. Use the preceding [BACKEND] messages as the result.';
export const STEER_OUTPUT = 'This was sent to steer the previous background agent task.';

// Keeps the head and tail of long text, like Codex's handoff truncation.
export function capProgress(text, max = PROGRESS_MAX) {
  const t = String(text);
  if (t.length <= max) return t;
  const room = max - TRUNC_MARK.length;
  const head = Math.ceil(room / 2);
  return t.slice(0, head) + TRUNC_MARK + t.slice(t.length - (room - head));
}

const rms = (analyser, buf) => {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  // Speech RMS sits near 0.05-0.3; scale so normal talking reaches the middle of the range.
  return Math.min(1, Math.max(0, Math.sqrt(sum / buf.length) * 3));
};

// Electron wraps main-process errors as "Error invoking remote method '...': Error: <message>".
const plain = (error, fallback) => {
  const message = String(error?.message || '').replace(/^Error invoking remote method '[^']*': (Error: )?/, '').trim();
  return message || fallback;
};

export function createRealtimeVoiceProvider({
  emit,
  mintSession = () => window.sufficeDesktop.voiceSession(),
  getUserMedia = (c) => navigator.mediaDevices.getUserMedia(c),
  RTCPeerConnectionImpl = globalThis.RTCPeerConnection,
  fetchImpl = (...a) => fetch(...a),
  AudioContextImpl = globalThis.AudioContext,
  deviceId,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  now = () => Date.now(),
  startupTimeoutMs = STARTUP_TIMEOUT_MS,
} = {}) {
  let ended = true, muted = false, attempt = 0, retried = false, cur = null;
  let inAnalyser, outAnalyser, inBuf, outBuf;
  let last, speaking = false, responseActive = false, pendingCreate = false, audioPlaying = false, cancelled = false;
  let holdTimer = null, heardTimer = null;
  let agentText = '', userText = '', outItem = null, playedMs = 0, playStart = 0;
  const pending = new Set();

  const state = (name, detail) => { last = name; emit(detail ? { type: 'state', state: name, detail } : { type: 'state', state: name }); };
  const send = (event) => { if (cur?.dc?.readyState === 'open') cur.dc.send(JSON.stringify(event)); };
  const clearHold = () => { if (holdTimer !== null) clearTimer(holdTimer); holdTimer = null; };
  const clearHeard = () => { if (heardTimer !== null) clearTimer(heardTimer); heardTimer = null; };

  // One response at a time: a request while one is active waits for its response.done.
  function requestResponse() {
    if (responseActive) { pendingCreate = true; return; }
    responseActive = true;
    send({ type: 'response.create' });
  }
  function flushPending() {
    responseActive = false;
    if (pendingCreate) { pendingCreate = false; requestResponse(); }
  }

  function fail(message) {
    if (ended) return;
    state('error', message);
    emit({ type: 'error', message });
    void stop('error');
  }

  function release(res) {
    if (!res) return;
    res.dead = true;
    if (res.startTimer != null) clearTimer(res.startTimer);
    if (res.levelTimer != null) clearTimer(res.levelTimer);
    try { res.dc?.close(); } catch { /* already closed */ }
    try { res.pc?.close(); } catch { /* already closed */ }
    res.stream?.getTracks().forEach((t) => t.stop());
    if (res.audioEl) res.audioEl.srcObject = null;
    return Promise.resolve(res.ctx?.close()).catch(() => {});
  }

  function settle() {
    if (responseActive || audioPlaying || pending.size > 0 || muted || ended) return;
    if (speaking) {
      if (holdTimer === null) holdTimer = setTimer(() => {
        holdTimer = null;
        speaking = false;
        if (!responseActive && !audioPlaying && pending.size === 0 && !muted && !ended && last === 'speaking') state('listening');
      }, SPEAK_HOLD_MS);
      return;
    }
    if (last !== 'listening') state('listening');
  }

  // Stops playback now and tells the server how much audio was actually played.
  function stopPlayback() {
    if (audioPlaying) playedMs += now() - playStart;
    if (responseActive) send({ type: 'response.cancel' });
    send({ type: 'output_audio_buffer.clear' });
    if (outItem) send({ type: 'conversation.item.truncate', item_id: outItem, content_index: 0, audio_end_ms: Math.round(playedMs) });
    if (cur?.audioEl) cur.audioEl.muted = true;
    clearHold();
    cancelled = true;
    speaking = false;
    audioPlaying = false;
  }

  function bargeIn() {
    stopPlayback();
    const heard = agentText;
    emit({ type: 'agent_final', text: heard, interrupted: true, heard });
    agentText = '';
    state('heard');
    clearHeard();
    heardTimer = setTimer(() => { heardTimer = null; if (last === 'heard' && !ended) state(muted ? 'muted' : 'listening'); }, HEARD_MS);
  }

  function suppressSpeech() {
    if (ended || !(speaking || audioPlaying || responseActive)) return;
    stopPlayback();
    if (agentText) emit({ type: 'agent_final', text: agentText, interrupted: true, heard: agentText });
    agentText = '';
    if (!muted && pending.size === 0) state('listening');
  }

  function onEvent(event) {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        userText = '';
        if (speaking && (audioPlaying || responseActive)) bargeIn();
        else if (!muted) { clearHold(); clearHeard(); state('hearing'); }
        break;
      case 'input_audio_buffer.speech_stopped':
        if (!muted) state('thinking');
        break;
      case 'conversation.item.input_audio_transcription.delta':
        userText += event.delta || '';
        emit({ type: 'user_partial', text: userText });
        break;
      case 'conversation.item.input_audio_transcription.completed':
        userText = '';
        emit({ type: 'user_final', text: event.transcript || '' });
        break;
      case 'response.created':
        responseActive = true;
        cancelled = false;
        agentText = '';
        outItem = null;
        playedMs = 0;
        if (cur?.audioEl) cur.audioEl.muted = false;
        break;
      case 'response.output_item.added':
        if (event.item?.type === 'message' && event.item.id) outItem = event.item.id;
        break;
      case 'response.output_audio_transcript.delta':
        if (cancelled) break;
        if (event.item_id) outItem = event.item_id;
        agentText += event.delta || '';
        clearHold();
        if (!speaking) { speaking = true; state('speaking'); }
        emit({ type: 'agent_partial', text: agentText });
        break;
      case 'response.output_audio_transcript.done':
        if (cancelled) break;
        emit({ type: 'agent_final', text: event.transcript ?? agentText });
        agentText = '';
        break;
      case 'output_audio_buffer.started':
        if (!cancelled) { audioPlaying = true; playStart = now(); clearHold(); }
        break;
      case 'output_audio_buffer.stopped':
        if (audioPlaying) playedMs += now() - playStart;
        audioPlaying = false;
        settle();
        break;
      case 'output_audio_buffer.cleared':
        audioPlaying = false; // the user is talking; do not jump back to listening
        break;
      case 'response.function_call_arguments.done': {
        let args;
        try { args = JSON.parse(event.arguments || '{}'); } catch { args = null; }
        const ok = event.call_id && args && typeof args === 'object' && !Array.isArray(args)
          && (event.name === 'remain_silent' || (event.name === 'background_agent' && typeof args.prompt === 'string' && args.prompt.trim()));
        if (!ok) { sendToolResult(event.call_id, 'The tool call was not valid. Ask the user to repeat the request.'); break; }
        pending.add(event.call_id);
        if (event.name === 'background_agent') state('working');
        emit({ type: 'tool_call', id: event.call_id, name: event.name, args });
        break;
      }
      case 'response.done':
        flushPending();
        if (event.response?.status !== 'cancelled') settle();
        break;
      case 'error':
        if (ACTIVE_RESPONSE.test(event.error?.message || '')) { responseActive = true; pendingCreate = true; break; }
        // Cancelling when nothing is in progress is harmless and leaves the session intact.
        if (/cancel/i.test(event.error?.code || '') || /no active response/i.test(event.error?.message || '')) { flushPending(); break; }
        fail('Voice hit a problem. Try starting it again.');
        break;
    }
  }

  function startLevels(res, inputStream, outputStream) {
    res.ctx = new AudioContextImpl();
    const tap = (s) => {
      const a = res.ctx.createAnalyser();
      a.fftSize = 512;
      res.ctx.createMediaStreamSource(s).connect(a);
      return a;
    };
    inAnalyser = tap(inputStream);
    inBuf = new Float32Array(inAnalyser.fftSize);
    if (outputStream) { outAnalyser = tap(outputStream); outBuf = new Float32Array(outAnalyser.fftSize); }
    const tick = () => {
      if (res.dead || ended) return;
      if (typeof document === 'undefined' || !document.hidden) emit({ type: 'level', input: muted ? 0 : rms(inAnalyser, inBuf), output: outAnalyser ? rms(outAnalyser, outBuf) : 0 });
      res.levelTimer = setTimer(tick, TICK_MS);
    };
    tick();
  }

  // A startup that timed out or closed gets one retry after cleanup; a second failure is an error.
  function startupFailed(id, res, why) {
    if (id !== attempt || ended || res !== cur || res.dead || res.opened) return;
    void release(res);
    cur = null;
    if (retried) { fail('Could not connect to OpenAI voice. Try again in a moment.'); return; }
    retried = true;
    emit({ type: 'notice', text: why === 'timeout' ? 'Voice connection timed out. Retrying once after cleanup.' : 'Voice connection closed during startup. Retrying once.' });
    void connect(id);
  }

  async function connect(id) {
    const res = { dead: false, opened: false };
    cur = res;
    const stale = () => id !== attempt || ended || res !== cur;
    state('connecting');
    res.startTimer = setTimer(() => startupFailed(id, res, 'timeout'), startupTimeoutMs);
    let session;
    try { session = await mintSession(); } catch (e) { if (stale()) return; return fail(plain(e, 'Could not start a voice session. Try again in a moment.')); }
    if (stale()) return;
    try {
      res.stream = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } });
    } catch (e) {
      if (stale()) return;
      const denied = ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(e?.name);
      return fail(denied ? MIC_DENIED : 'Suffice could not start the microphone. Check that one is connected.');
    }
    if (stale()) { void release(res); return; }
    res.stream.getAudioTracks().forEach((t) => { t.enabled = !muted; }); // mute survives a retry
    try {
      const pc = res.pc = new RTCPeerConnectionImpl();
      const audioEl = res.audioEl = new Audio();
      audioEl.autoplay = true;
      pc.ontrack = (e) => {
        const remote = e.streams?.[0];
        if (!remote || res.dead) return;
        audioEl.srcObject = remote;
        try { startLevels(res, res.stream, remote); } catch { /* levels are cosmetic */ }
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (res.dead) return;
        if (!res.opened && (s === 'failed' || s === 'closed')) startupFailed(id, res, 'closed');
        else if (s === 'failed') fail('The voice connection dropped. Try starting it again.');
      };
      res.stream.getAudioTracks().forEach((t) => pc.addTrack(t, res.stream));
      const dc = res.dc = pc.createDataChannel('oai-events');
      dc.onopen = () => {
        if (res.dead || stale()) return;
        res.opened = true;
        clearTimer(res.startTimer);
        state(muted ? 'muted' : 'listening');
      };
      dc.onclose = () => {
        if (res.dead || stale()) return;
        if (!res.opened) startupFailed(id, res, 'closed');
        else void stop('transport_closed');
      };
      dc.onmessage = (m) => { if (res.dead) return; let ev; try { ev = JSON.parse(m.data); } catch { return; } onEvent(ev); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // The calls endpoint takes one SDP with no trickle: wait (max 2 s) for ICE candidates, then send the full local description.
      if (pc.iceGatheringState && pc.iceGatheringState !== 'complete') await new Promise((done) => {
        const t = setTimer(done, 2000);
        pc.addEventListener?.('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimer(t); done(); } });
      });
      const r = await fetchImpl(CALLS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.clientSecret}`, 'Content-Type': 'application/sdp' },
        body: pc.localDescription?.sdp || offer.sdp,
      });
      if (stale()) return;
      if (!r.ok) return fail('Could not connect to OpenAI voice. Try again in a moment.');
      const sdp = await r.text();
      if (stale()) return;
      await pc.setRemoteDescription({ type: 'answer', sdp });
    } catch {
      if (stale()) return;
      fail('Could not connect to OpenAI voice. Check your connection and try again.');
    }
  }

  async function start() {
    const id = ++attempt; // a late result of an older start() sees a different number and is dropped
    const old = cur;
    cur = null;
    void release(old);
    ended = false; retried = false; responseActive = false; pendingCreate = false; speaking = false; audioPlaying = false;
    pending.clear(); clearHold(); clearHeard();
    await connect(id);
  }

  function setMuted(value) {
    muted = !!value;
    cur?.stream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    if (ended) return;
    if (muted) state('muted'); else if (!speaking) state('listening');
  }

  function interrupt() { if (speaking || responseActive) bargeIn(); }

  function sendToolResult(id, text, { respond = true } = {}) {
    pending.delete(id);
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: id, output: String(text) } });
    if (respond) requestResponse(); else settle();
  }

  function sendProgress(text) {
    send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `[BACKEND] ${capProgress(text)}` }] } });
  }
  const finishTask = (id) => sendToolResult(id, FINISH_OUTPUT);
  const steerAck = (id) => sendToolResult(id, STEER_OUTPUT);

  async function stop(reason = 'requested') {
    if (ended) return;
    ended = true;
    attempt += 1;
    clearHold(); clearHeard();
    const res = cur;
    cur = null;
    await release(res);
    emit({ type: 'ended', reason });
  }

  return { start, stop, setMuted, interrupt, sendToolResult, sendProgress, finishTask, steerAck, suppressSpeech };
}

registerVoiceProvider('openai-realtime', (deps) => createRealtimeVoiceProvider(deps));
