// Runner over the real agent session (packages/cli/src/session.mjs).
// session.run(prompt) is at session.mjs:114-127 (prompt at :117, throws on error/aborted/length stop at :121-122,
// returns the last assistant text at :123). Usage is s.totals.{input,output} (session.mjs:29, accumulated :90-100).
// s.abort() is :128, s.dispose() is :129 and can throw (it awaits the log tail).
const zero = () => ({ inputTokens: 0, outputTokens: 0 });
const msg = (e) => (e instanceof Error ? e.message : String(e));

export function createPiRunner({ createSession, clock = { now: () => Date.now() }, timeoutMs } = {}) {
  if (typeof createSession !== 'function') throw new TypeError('createPiRunner: createSession must be a function');
  return {
    async run(req) {
      const t0 = clock.now();
      const end = (r, usage = zero()) => ({ ...r, usage, ms: clock.now() - t0 });
      if (req.signal?.aborted) return end({ ok: false, error: 'aborted' });
      let s, timer, onAbort;
      try {
        try { s = await createSession(req); } catch (e) { return end({ ok: false, error: msg(e) }); }
        const guard = new Promise((resolve) => {
          if (timeoutMs > 0) timer = setTimeout(() => resolve({ error: `timed out after ${timeoutMs}ms` }), timeoutMs);
          onAbort = () => resolve({ error: 'aborted' });
          req.signal?.addEventListener('abort', onAbort, { once: true });
        });
        const work = Promise.resolve().then(() => s.run(req.prompt)).then((text) => ({ text }), (e) => ({ error: msg(e) }));
        const r = await Promise.race([work, guard]);
        const usage = { inputTokens: s.totals?.input ?? 0, outputTokens: s.totals?.output ?? 0 };
        if (r.error !== undefined) {
          if (r.error === 'aborted' || r.error.startsWith('timed out')) { try { s.abort(); } catch { /* already stopped */ } }
          return end({ ok: false, error: r.error }, usage);
        }
        return end({ ok: true, text: r.text }, usage);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (onAbort) req.signal?.removeEventListener('abort', onAbort);
        if (s) { try { await s.dispose(); } catch { /* a log-tail error must not fail the run */ } }
      }
    },
  };
}
