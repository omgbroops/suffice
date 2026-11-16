export const VOICE_STATES = ['idle', 'connecting', 'listening', 'hearing', 'thinking', 'working', 'speaking', 'heard', 'interrupted', 'muted', 'error', 'ended'];

const DEBOUNCE_MS = 150;
const MIN_SHOWN_MS = 250;
const IMMEDIATE_TARGETS = new Set(['error', 'ended', 'muted', 'idle']);

// Turns a jittery stream of requested states into a calm sequence of shown states.
export function createVoiceState({ now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, onChange } = {}) {
  let shown = { state: 'idle', detail: undefined };
  let shownAt = now();
  let pending = null;
  let timer = null;
  let disposed = false;

  function cancelPending() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    pending = null;
  }

  function show(state, detail) {
    const previous = shown.state;
    shown = { state, detail };
    shownAt = now();
    onChange?.({ state, detail, previous });
  }

  function request(state, detail) {
    if (!VOICE_STATES.includes(state)) throw new TypeError(`Unknown voice state: ${state}`);
    if (disposed) return;

    if (state === shown.state) {
      cancelPending();
      if (detail !== shown.detail) show(state, detail);
      return;
    }

    cancelPending();
    if (shown.state === 'idle' || shown.state === 'ended' || IMMEDIATE_TARGETS.has(state)) {
      show(state, detail);
      return;
    }

    pending = { state, detail };
    const wait = Math.max(DEBOUNCE_MS, shownAt + MIN_SHOWN_MS - now());
    timer = setTimer(() => {
      const next = pending;
      timer = null;
      pending = null;
      if (next) show(next.state, next.detail);
    }, wait);
  }

  return {
    request,
    get: () => ({ ...shown }),
    dispose() {
      disposed = true;
      cancelPending();
    },
  };
}
