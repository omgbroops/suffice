// Mic capture for hold-to-speak. A release that lands before getUserMedia resolves must not leave the mic live, so every start carries a token that stop() invalidates.
export function createMic({ getUserMedia, Recorder, onAudio, onError }) {
  let rec = null, token = 0;
  return {
    async start() {
      const me = ++token; let stream;
      try { stream = await getUserMedia({ audio: true }); } catch { return onError(); }
      if (me !== token) { stream.getTracks().forEach((t) => t.stop()); return; }
      try {
        const chunks = [], r = rec = new Recorder(stream);
        r.ondataavailable = (e) => chunks.push(e.data);
        r.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' }); onAudio(await blob.arrayBuffer(), blob.type); };
        r.start();
      } catch { stream.getTracks().forEach((t) => t.stop()); onError(); }
    },
    stop() { token++; if (rec?.state === 'recording') rec.stop(); rec = null; },
  };
}
