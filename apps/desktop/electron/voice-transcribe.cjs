// Speech-to-text for dictation. Docs checked 2026-11-15:
//  https://developers.openai.com/api/docs/guides/speech-to-text
//  https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
// - Endpoint POST https://api.openai.com/v1/audio/transcriptions, multipart/form-data: from docs
// - Recommended model `gpt-transcribe`; whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe
//   are deprecated, shutdown 2027-02-26: from docs
// - Fields file + model required; `prompt` optional, supported by gpt-transcribe: from docs
// - Default JSON response has `text` (plus `languages`): from docs
// - 25 MB file limit: from docs (guide page; the reference page states none)
// - Containers flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm: from docs
// - File needs an extension-bearing name and content type: from docs
// - Bearer Authorization header: assumed (same as the realtime secret call in voice-session.cjs)
// - Error bodies are never shown to the user: our choice
const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const NO_KEY = 'Add an OpenAI API key in Settings, Providers, to use voice.';
const MAX_BYTES = 25 * 1024 * 1024;
const EXT = { webm: 'webm', ogg: 'ogg', mp4: 'mp4', mpeg: 'mp3', mp3: 'mp3', wav: 'wav', wave: 'wav', 'x-wav': 'wav', flac: 'flac', 'x-m4a': 'm4a', m4a: 'm4a' };

function extensionFor(mimeType) {
  const m = /^(audio|video)\/([a-z0-9.+-]+)\s*(;.*)?$/i.exec(String(mimeType || ''));
  return m ? EXT[m[2].toLowerCase()] : undefined;
}

function createTranscriber({ getApiKey, fetchImpl = fetch, model = 'gpt-transcribe' } = {}) {
  return {
    async transcribe({ audio, mimeType, prompt } = {}) {
      if (!(audio instanceof Uint8Array)) throw new Error('No audio was recorded.');
      const ext = extensionFor(mimeType);
      if (!ext) throw new Error('This audio format is not supported.');
      if (audio.byteLength > MAX_BYTES) throw new Error('This recording is too large to transcribe. Keep it under 25 MB.');
      if (audio.byteLength === 0) return { text: '' };
      const key = await getApiKey();
      if (!key) throw new Error(NO_KEY);
      const form = new FormData();
      form.append('model', model);
      form.append('file', new Blob([audio], { type: String(mimeType).split(';')[0] }), `dictation.${ext}`);
      if (typeof prompt === 'string' && prompt.trim()) form.append('prompt', prompt.trim().slice(0, 500));
      let res;
      try {
        res = await fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
      } catch { throw new Error('Could not reach OpenAI. Check your connection and try again.'); }
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'OpenAI rejected the API key. Check it in Settings, Providers.' : 'OpenAI could not transcribe this recording. Try again in a moment.');
      let data;
      try { data = await res.json(); } catch { data = null; }
      if (!data || typeof data.text !== 'string') throw new Error('OpenAI could not transcribe this recording. Try again in a moment.');
      return { text: data.text };
    },
  };
}

module.exports = { createTranscriber, NO_KEY, MAX_BYTES };
