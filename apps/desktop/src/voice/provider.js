import { VOICE_STATES } from './state.js';

export const VOICE_EVENTS = ['state', 'user_partial', 'user_final', 'agent_partial', 'agent_final', 'level', 'tool_call', 'notice', 'error', 'ended'];
export const END_REASONS = ['requested', 'transport_closed', 'error'];

// A provider is: {
//   start(): Promise<void>,
//   stop(): Promise<void>,
//   setMuted(muted: boolean): void,
//   interrupt(): void,
//   sendToolResult(id: string, text: string, opts?: {respond?: boolean}): void, // respond:false sends no response request
//   sendProgress(text: string): void,   // "[BACKEND] <text>" item, no response request
//   finishTask(id: string): void,       // tool output "Background agent finished..." + response request
//   steerAck(id: string): void,         // tool output "This was sent to steer..." + response request
//   suppressSpeech(): void,             // stop and discard queued output audio now
// }
// It reports everything through the `emit` it was created with; events are checked by validateVoiceEvent.

const factories = new Map();
const TOOLS = ['background_agent', 'remain_silent'];

export function registerVoiceProvider(kind, factory) {
  factories.set(kind, factory);
}

export function createVoiceProvider(kind, deps = {}) {
  const factory = factories.get(kind);
  if (!factory) throw new Error(`Unknown voice provider: ${kind}`);
  if (typeof deps.emit !== 'function') throw new TypeError('createVoiceProvider needs deps.emit');
  return factory({ ...deps, emit: (event) => deps.emit(validateVoiceEvent(event)) });
}

const fail = (message) => { throw new TypeError(message); };
const isText = (value) => typeof value === 'string';
const isLevel = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export function validateVoiceEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('Voice event must be an object');
  if (!VOICE_EVENTS.includes(event.type)) fail(`Unknown voice event type: ${event.type}`);
  switch (event.type) {
    case 'state':
      if (!VOICE_STATES.includes(event.state) || event.state === 'idle') fail(`Invalid state event: ${event.state}`);
      if (event.detail !== undefined && !isText(event.detail)) fail('state detail must be a string');
      break;
    case 'user_partial':
    case 'user_final':
    case 'agent_partial':
      if (!isText(event.text)) fail(`${event.type} needs a string text`);
      break;
    case 'agent_final':
      if (!isText(event.text)) fail('agent_final needs a string text');
      if (event.interrupted !== undefined && typeof event.interrupted !== 'boolean') fail('interrupted must be a boolean');
      if (event.heard !== undefined && !isText(event.heard)) fail('heard must be a string');
      break;
    case 'level':
      for (const key of ['input', 'output']) {
        if (event[key] !== undefined && !isLevel(event[key])) fail(`level ${key} must be a number from 0 to 1`);
      }
      break;
    case 'tool_call':
      if (!isText(event.id) || !event.id) fail('tool_call needs an id');
      if (!TOOLS.includes(event.name)) fail(`Unknown tool: ${event.name}`);
      if (!event.args || typeof event.args !== 'object' || Array.isArray(event.args)) fail('tool_call args must be an object');
      if (event.name === 'background_agent' && (!isText(event.args.prompt) || !event.args.prompt.trim())) fail('background_agent needs args.prompt');
      break;
    case 'notice':
      if (!isText(event.text) || !event.text) fail('notice needs a text');
      break;
    case 'ended':
      if (event.reason !== undefined && !END_REASONS.includes(event.reason)) fail(`Invalid ended reason: ${event.reason}`);
      break;
    case 'error':
      if (!isText(event.message) || !event.message) fail('error needs a message');
      break;
  }
  return event;
}
