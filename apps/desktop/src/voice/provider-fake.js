import { registerVoiceProvider } from './provider.js';

let levelIndex = 0;
// Fixed formula of the step index, so the script is identical on every run.
const level = (after, key = 'input') => ({ after, event: { type: 'level', [key]: Math.round(Math.abs(Math.sin(++levelIndex * 0.9)) * 100) / 100 } });
const state = (after, name, detail) => ({ after, event: detail ? { type: 'state', state: name, detail } : { type: 'state', state: name } });
const say = (after, type, text, extra) => ({ after, event: { type, text, ...extra } });

const SPOKEN = 'I added the test.';
const heardBeforeBargeIn = `${SPOKEN} {{result}}`;

export const DEFAULT_SCRIPT = [
  state(1000, 'listening'),
  level(500),
  state(600, 'hearing'),
  level(150),
  say(250, 'user_partial', 'Can you add'),
  level(250),
  level(250),
  say(300, 'user_partial', 'Can you add a test for the'),
  level(250),
  level(250),
  say(400, 'user_partial', 'Can you add a test for the login redirect?'),
  level(300),
  say(700, 'user_final', 'Can you add a test for the login redirect?'),
  state(150, 'thinking'),
  { after: 1100, event: { type: 'tool_call', id: 'call_1', name: 'background_agent', args: { prompt: 'Add a regression test for the login redirect.' } } },
  state(200, 'working', 'Running tests'),
  { waitForToolResult: 'call_1' },
  state(300, 'speaking'),
  say(300, 'agent_partial', SPOKEN),
  level(250, 'output'),
  level(250, 'output'),
  say(300, 'agent_partial', heardBeforeBargeIn),
  level(250, 'output'),
  level(250, 'output'),
  state(600, 'hearing'),
  { after: 100, event: { type: 'agent_final', text: `${heardBeforeBargeIn} Want me to run the whole suite?`, interrupted: true, heard: heardBeforeBargeIn } },
  state(100, 'heard'),
  level(400),
  level(400),
  state(400, 'listening'),
  say(500, 'user_final', 'Never mind, that is enough.'),
  state(300, 'speaking'),
  level(300, 'output'),
  level(300, 'output'),
  say(1200, 'agent_final', 'Okay.'),
  state(900, 'listening'),
];

const fillResult = (event, result) => JSON.parse(JSON.stringify(event).replaceAll('{{result}}', () => JSON.stringify(result).slice(1, -1)));

export function createFakeVoiceProvider({ emit, setTimer = setTimeout, clearTimer = clearTimeout, script = DEFAULT_SCRIPT, speed = 1, autoplay = true } = {}) {
  let index = 0;
  let timer = null;
  let started = false;
  let stopped = false;
  let paused = false;
  let waiting = null; // tool call id the script is paused on
  let lastState = null;
  let agentPartial = '';
  let result = '';
  const results = new Map();

  function send(event) {
    if (stopped) return;
    if (event.type === 'state') lastState = event.state;
    if (event.type === 'agent_partial') agentPartial = event.text;
    if (event.type === 'agent_final') agentPartial = '';
    emit(event);
  }

  function run() {
    if (stopped || paused || waiting || timer !== null) return;
    while (index < script.length && script[index].waitForToolResult !== undefined) {
      const id = script[index].waitForToolResult;
      if (!results.has(id)) { waiting = id; return; }
      result = results.get(id).slice(0, 80);
      index += 1;
    }
    if (index >= script.length) return;
    const step = script[index];
    timer = setTimer(() => {
      timer = null;
      index += 1;
      send(fillResult(step.event, result));
      run();
    }, step.after / speed);
  }

  function halt() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  return {
    emit: send,
    async start() {
      if (started || stopped) return;
      started = true;
      send({ type: 'state', state: 'connecting' });
      if (autoplay) run();
    },
    async stop() {
      if (stopped) return;
      halt();
      send({ type: 'ended' }); // before the flag, so send() lets it through
      stopped = true;
    },
    setMuted(muted) {
      if (stopped || muted === paused) return;
      paused = muted;
      if (muted) {
        halt(); // the interrupted step restarts with its full delay on unmute
        send({ type: 'state', state: 'muted' });
      } else {
        send({ type: 'state', state: 'listening' });
        if (started && autoplay) run();
      }
    },
    interrupt() {
      if (stopped || lastState !== 'speaking') return;
      send({ type: 'agent_final', text: agentPartial, interrupted: true, heard: agentPartial });
      send({ type: 'state', state: 'heard' });
    },
    // Progress text is what a scripted "{{result}}" shows; finishing a task releases the script like a tool result.
    sendProgress(text) { if (!stopped) result = String(text).slice(0, 80); },
    finishTask(id) { this.sendToolResult(id, result); },
    steerAck() {},
    suppressSpeech() {
      if (stopped || lastState !== 'speaking') return;
      send({ type: 'agent_final', text: agentPartial, interrupted: true, heard: agentPartial });
      send({ type: 'state', state: 'listening' });
    },
    sendToolResult(id, text, { respond = true } = {}) {
      if (stopped || !respond) return;
      results.set(id, String(text));
      if (waiting === id) {
        waiting = null;
        run();
      }
    },
  };
}

registerVoiceProvider('fake', (deps) => createFakeVoiceProvider(deps));
