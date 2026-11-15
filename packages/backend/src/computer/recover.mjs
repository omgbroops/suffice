// §4.4/§4.6: fixed recovery ladder, then at most maxEscalations model escalations, each followed by one more ladder.
export const STRATEGIES = ['reground', 'scroll', 'wait', 'key'];

export async function recover({ tryStrategy, escalate, maxEscalations = 1 }) {
  const recovery = [];
  let esc = 0;
  for (;;) {
    for (const s of STRATEGIES) { recovery.push(s); if (await tryStrategy(s)) return { ok: true, recovery }; }
    if (esc >= maxEscalations || !(await escalate(esc + 1))) return { ok: false, recovery };
    esc++; recovery.push('escalate');
  }
}

// §4.5: same action, same page, n times in a row means stuck.
export const loopDetected = (h, n) => h.length >= n && h.slice(-n).every((x) => x.sig === h.at(-1).sig && !x.changed);
