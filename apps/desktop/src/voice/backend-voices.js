// Voice providers the desktop offers, held in the backend's own registry (packages/backend/src/voice).
// Prices are list-price ESTIMATES per minute of audio (UNVERIFIED against current provider pages): edit here when they change.
import { createVoiceRegistry, estimateCost } from '../../../../packages/backend/src/voice/index.mjs';

export const CALL_MINUTES = 5; // the call length every estimate is quoted for
const registry = createVoiceRegistry();
// kind = the provider id createVoiceProvider() knows; title = what Settings shows.
const VOICES = [
  { name: 'cascade', kind: 'cascade', title: 'Cascade', price: { inPerMin: 0.006, outPerMin: 0.015 }, note: 'Speech to text, then your agent, then a spoken reply' },
  { name: 'realtime', kind: 'openai-realtime', title: 'Realtime', price: { inPerMin: 0.06, outPerMin: 0.24 }, note: 'One speech-to-speech model, lowest delay' },
];
// The desktop builds providers with createVoiceProvider(kind); the registry here is the list of what exists and what it costs.
for (const v of VOICES) registry.register(v.name, { ...v, create: () => v.kind });

const all = () => registry.list().map(v => registry.get(v.name));
export const voiceLabels = () => all().map(v => v.title);
export const voiceByLabel = label => all().find(v => v.title === label) || registry.get('cascade');
export const voiceByKind = kind => all().find(v => v.kind === kind);

/** Quote for one call: half the time the user talks, half the agent does. null for providers that cost nothing (the offline fake). */
export function callEstimate(kind, minutes = CALL_MINUTES) {
  const voice = voiceByKind(kind);
  if (!voice) return null;
  const cost = estimateCost({ audioInSec: minutes * 30, audioOutSec: minutes * 30 }, voice.price);
  return { title: voice.title, note: voice.note, minutes, cost, text: `About $${cost.toFixed(2)} for ${minutes} min` };
}
export const priceNotes = () => all().map(v => `${v.title}: ${callEstimate(v.kind).text.toLowerCase()}`).join('. ');
