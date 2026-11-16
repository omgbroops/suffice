// Voice conversation controller: glue between a voice provider and the app's agent. No DOM.
// Behaviour follows the Codex realtime engine (Apache-2.0, see docs/voice-attribution.md): the voice model is a thin
// front end with background_agent and remain_silent; agent progress is mirrored to it as [BACKEND] text.
import { createVoiceProvider } from './provider.js';
import { createVoiceState } from './state.js';
import './provider-fake.js';
import './provider-realtime.js';

const PROGRESS_INTERVAL_MS = 2000;
const LEVEL_INTERVAL_MS = 90;
const LONG_ANSWER = 4000;
const APPROVAL_TEXT = 'I need your approval to continue. Please review the request in the app.';
const LONG_TEXT = 'The answer is long. It is shown in the app.';
const defaultTimers = { now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id) };

export function createVoiceConversation({ kind, providerDeps = {}, app, onEvent = () => {}, timers = defaultTimers } = {}) {
  let provider = null, active = false, muted = false, stopHarness = null, ending = false;
  let taskActive = false, taskCallId = null, textBuf = '', queued = [], progressTimer = null, lastProgressAt = -Infinity;
  let mic = 0, agent = 0, lastLevelAt = -Infinity;

  const emitEvent = (event) => onEvent(event);
  const shown = createVoiceState({
    now: timers.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    onChange: ({ state, detail }) => emitEvent({ type: 'state', state, detail }),
  });

  // Progress mirror: one [BACKEND] message per 2 s, joined lines when several arrive in between.
  function dropProgress() {
    if (progressTimer !== null) timers.clearTimer(progressTimer);
    progressTimer = null;
    queued = [];
    textBuf = '';
  }
  function flushProgress() {
    progressTimer = null;
    if (!taskActive || !queued.length) { queued = []; return; }
    provider?.sendProgress(queued.join('\n'));
    queued = [];
    lastProgressAt = timers.now();
  }
  function queueProgress(line) {
    if (!taskActive || !line) return;
    queued.push(line);
    if (progressTimer !== null) return;
    const wait = Math.max(0, lastProgressAt + PROGRESS_INTERVAL_MS - timers.now());
    if (wait === 0) flushProgress();
    else progressTimer = timers.setTimer(flushProgress, wait);
  }
  const flushText = () => { const t = textBuf.trim(); textBuf = ''; if (t) queueProgress(t); };

  function complete(ev) {
    dropProgress();
    const error = ev.error ? String(ev.error?.message || ev.error) : '';
    let line;
    if (error) line = `The task failed: ${error}`;
    else if (ev.result?.interrupted) line = 'The task was stopped.';
    else {
      const answer = String(app.lastReply?.() ?? '').trim();
      line = !answer ? 'The task finished.' : answer.length > LONG_ANSWER ? LONG_TEXT : answer;
    }
    const id = taskCallId;
    taskActive = false;
    taskCallId = null;
    provider?.sendProgress(line);
    if (id) provider?.finishTask(id);
  }

  function onHarness(ev) {
    if (!active || !ev) return;
    if (ev.event === 'run_completed') { if (taskActive) complete(ev); return; }
    if (!taskActive && ['turn_started', 'tool_start', 'text', 'approval'].includes(ev.event)) taskActive = true; // a task typed in the app
    if (!taskActive) return;
    switch (ev.event) {
      case 'tool_start': flushText(); queueProgress(`Running ${ev.name || 'a tool'}`); break;
      case 'assistant_start': flushText(); break;
      case 'text': textBuf += ev.text || ''; break;
      case 'approval': provider?.sendProgress(APPROVAL_TEXT); break; // never throttled: the user must hear it
      // reasoning is never mirrored
    }
  }

  async function toolCall(ev) {
    if (ev.name === 'remain_silent') { provider.sendToolResult(ev.id, '', { respond: false }); return; }
    const prompt = ev.args.prompt;
    if (!taskActive && !app.isRunning()) {
      taskActive = true;
      taskCallId = ev.id;
      textBuf = '';
      emitEvent({ type: 'delegated', prompt, mode: 'start' });
      try { await app.submit(prompt); } catch (e) {
        taskActive = false; taskCallId = null;
        provider?.sendToolResult(ev.id, `The task could not be started: ${e?.message || 'unknown error'}.`);
      }
      return;
    }
    try {
      await app.steer(prompt);
      provider?.steerAck(ev.id);
      emitEvent({ type: 'delegated', prompt, mode: 'steer' });
    } catch (e) {
      provider?.sendToolResult(ev.id, `The running task could not be steered: ${e?.message || 'unknown error'}.`);
    }
  }

  function finish(reason) {
    if (ending) return;
    ending = true;
    active = false;
    dropProgress();
    taskActive = false; taskCallId = null;
    stopHarness?.(); stopHarness = null;
    shown.request('ended');
    if (reason !== 'error') emitEvent({ type: 'notice', text: 'Voice conversation ended.' });
    emitEvent({ type: 'ended', reason });
  }

  function onProvider(e) {
    switch (e.type) {
      case 'state': shown.request(e.state === 'interrupted' ? 'heard' : e.state, e.detail); break;
      case 'user_partial': emitEvent({ type: 'transcript', role: 'user', text: e.text, final: false }); break;
      case 'user_final': emitEvent({ type: 'transcript', role: 'user', text: e.text, final: true }); break;
      case 'agent_partial': emitEvent({ type: 'transcript', role: 'assistant', text: e.text, final: false }); break;
      case 'agent_final': emitEvent({ type: 'transcript', role: 'assistant', text: e.text, final: true, ...(e.interrupted ? { interrupted: true, heard: e.heard } : {}) }); break;
      case 'level': {
        if (e.input !== undefined) mic = e.input;
        if (e.output !== undefined) agent = e.output;
        const t = timers.now();
        if (t - lastLevelAt >= LEVEL_INTERVAL_MS) { lastLevelAt = t; emitEvent({ type: 'level', mic, agent }); }
        break;
      }
      case 'tool_call': void toolCall(e); break;
      case 'notice': emitEvent({ type: 'notice', text: e.text }); break;
      case 'error': emitEvent({ type: 'error', message: e.message }); break;
      case 'ended': finish(e.reason || 'requested'); break;
    }
  }

  async function start() {
    if (active) return;
    const can = app.canStart();
    if (!can?.ok) { emitEvent({ type: 'error', message: can?.reason || 'Voice cannot start now.' }); return; }
    active = true; ending = false;
    emitEvent({ type: 'notice', text: 'Voice conversation started.' });
    stopHarness = app.onHarnessEvent(onHarness);
    provider = createVoiceProvider(kind, { setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: timers.now, ...providerDeps, emit: onProvider });
    shown.request('connecting');
    await provider.start();
    if (muted && active) provider.setMuted(true);
  }

  async function stop() {
    if (!active) return;
    await provider.stop();
    finish('requested'); // no-op when the provider already reported ended
  }

  function setMuted(value) {
    muted = !!value;
    if (active) provider?.setMuted(muted);
  }

  return {
    start,
    stop,
    setMuted,
    toggleMute() { setMuted(!muted); },
    notifyTyped() { if (active) provider?.suppressSpeech(); },
    emit(event) { provider?.emit?.(event); },
    get active() { return active; },
    get muted() { return muted; },
    get state() { return shown.get().state; },
  };
}
