// Voice providers the desktop offers, held in the backend's own registry (packages/backend/src/voice).
// No prices shown: provider rates are per token and unverified here; add one only with a fetched pricing page cited.
import { createVoiceRegistry } from '../../../../packages/backend/src/voice/index.mjs';

const registry = createVoiceRegistry();
// kind = the provider id createVoiceProvider() knows; title = what Settings shows.
const VOICES = [
  { name: 'cascade', kind: 'cascade', title: 'Cascade', note: 'Speech to text, then your agent, then a spoken reply' },
  { name: 'realtime', kind: 'openai-realtime', title: 'Realtime', note: 'One speech-to-speech model, lowest delay' },
];
// The desktop builds providers with createVoiceProvider(kind); the registry here is the list of what exists and what it costs.
for (const v of VOICES) registry.register(v.name, { ...v, create: () => v.kind });

const all = () => registry.list().map(v => registry.get(v.name));
export const voiceLabels = () => all().map(v => v.title);
export const voiceByLabel = label => all().find(v => v.title === label) || registry.get('cascade');
export const voiceByKind = kind => all().find(v => v.kind === kind);

/** What a call uses, for the confirm step. null for providers with nothing to confirm (the offline fake). */
export function callEstimate(kind) {
  const voice = voiceByKind(kind);
  return voice ? { title: voice.title, note: voice.note, text: voice.note } : null;
}
export const priceNotes = () => all().map(v => `${v.title}: ${v.note.toLowerCase()}`).join('. ');
