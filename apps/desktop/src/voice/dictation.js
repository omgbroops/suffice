// Dictation engine: no DOM. Records the mic, reports levels, transcribes on accept.
const MIN_MS = 300, CAP_MS = 5 * 60 * 1000, LEVEL_MS = 33;
const MIC_DENIED = 'Suffice could not use the microphone. Allow it in System Settings, Privacy, Microphone.';
const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export function createDictation({
  getUserMedia = (c) => navigator.mediaDevices.getUserMedia(c),
  MediaRecorderImpl = globalThis.MediaRecorder,
  AudioContextImpl = globalThis.AudioContext,
  transcribe = (p) => window.sufficeDesktop.voiceTranscribe(p),
  deviceId, onLevel, onState, now = () => performance.now(), prompt,
} = {}) {
  let state = 'idle', stream, ctx, recorder, chunks = [], t0 = 0, tEnd = 0, timer, cap, mime = '', gen = 0;
  const set = (s, message) => { state = s; onState?.(message ? { state: s, message } : { state: s }); };
  const release = () => {
    clearInterval(timer); clearTimeout(cap); timer = cap = undefined;
    stream?.getTracks().forEach((t) => t.stop()); stream = undefined;
    const c = ctx; ctx = undefined; try { c?.close(); } catch {}
  };
  const stopRecorder = () => new Promise((resolve) => {
    if (!recorder || recorder.state === 'inactive') return resolve();
    recorder.onstop = () => resolve();
    recorder.stop();
  });
  const fail = (message) => { release(); set('error', message); return message; };

  return {
    get state() { return state; },
    get elapsed() { return state === 'recording' ? now() - t0 : state === 'transcribing' ? tEnd - t0 : 0; },
    async start() {
      if (state !== 'idle' && state !== 'error') return;
      set('starting');
      const my = ++gen;
      let got;
      try {
        got = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } });
      } catch { if (my === gen) fail(MIC_DENIED); return; }
      if (my !== gen) { got?.getTracks().forEach((t) => t.stop()); return; } // cancelled while the mic was opening
      stream = got;
      try {
        mime = MIMES.find((m) => MediaRecorderImpl.isTypeSupported?.(m)) || '';
        recorder = new MediaRecorderImpl(stream, mime ? { mimeType: mime } : undefined);
        chunks = [];
        recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
        ctx = new AudioContextImpl();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        timer = setInterval(() => {
          if (globalThis.document?.hidden) return;
          analyser.getFloatTimeDomainData(buf);
          let sum = 0; for (const v of buf) sum += v * v;
          onLevel?.(Math.min(1, Math.max(0, Math.sqrt(sum / buf.length))));
        }, LEVEL_MS);
        recorder.start(1000);
        t0 = now();
        cap = setTimeout(() => { void this.accept(); }, CAP_MS);
        set('recording');
      } catch { fail('Suffice could not start recording. Try again.'); }
    },
    async accept() {
      if (state !== 'recording') return '';
      tEnd = now();
      set('transcribing');
      const short = tEnd - t0 < MIN_MS;
      await stopRecorder();
      release();
      if (short || !chunks.length) { set('idle'); return ''; }
      try {
        const blob = new Blob(chunks, { type: mime || chunks[0].type });
        const audio = new Uint8Array(await blob.arrayBuffer());
        const out = await transcribe({ audio, mimeType: blob.type, ...(prompt ? { prompt } : {}) });
        set('idle');
        return String(out?.text ?? '').trim();
      } catch (e) { set('error', String(e?.message || 'Transcription failed.').replace(/^Error invoking remote method '[^']*': (Error: )?/, '')); return ''; }
    },
    async cancel() {
      if (state !== 'recording' && state !== 'starting') return;
      gen++;
      await stopRecorder(); release(); chunks = []; set('idle');
    },
  };
}
