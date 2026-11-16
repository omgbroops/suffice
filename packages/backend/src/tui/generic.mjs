// Fallback mapper for CLIs with no own mapper (amp, aider, crush ...). No screen-to-chat parsing: only prompts are read from the screen.
import { createHash } from 'node:crypto';

const stripAnsi = (t) => t.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
const HINT = /enter|return|esc|↑|↓|arrow|tab\b|space|navigate|select|confirm|cancel/i;
const ASKS = /^(do you|would you|allow|approve|proceed|are you sure|continue)/i;
const NUMBERED = /^\s*([❯>●›])?\s*(\d+)[.)]\s+(\S.*)$/;
const MARKED = /^\s*([❯>●›])\s*(\S.*)$/;
const RADIO = /^\s*[○◯]\s*(\S.*)$/;
const INDENT = /^\s{2,}(\S.*)$/;

const finish = (title, body, labels, selected, hotkeys) => {
  const options = labels.map((label, index) => ({ index, label, ...(hotkeys?.[index] ? { hotkey: hotkeys[index] } : {}) }));
  const type = /trust/i.test(title) ? 'trust' : /allow|permission|approve|proceed|do you want|run |execute/i.test(title) ? 'permission' : 'choice';
  const promptId = createHash('sha1').update(`${title}\n${labels.join('\n')}`).digest('hex').slice(0, 12);
  return { promptId, type, title, ...(body ? { body } : {}), options, selected };
};

function parsePrompt(screen) {
  const all = stripAnsi(typeof screen === 'string' ? screen : '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).slice(-25);
  if (!all.length) return null;
  const last = all[all.length - 1].trim();
  // Press Enter to continue
  if (/press (enter|return)( key)? to (continue|proceed|close|exit)/i.test(last)) return finish(last, all.slice(-4, -1).map((l) => l.trim()).join('\n'), ['Continue'], 0, ['\r']);
  // (y/n) [Y/n] [y/N]
  const yn = /[(\[]\s*(y\/n|yes\/no|y\/N|Y\/n)\s*[)\]]\s*[:?]?$/.exec(last);
  if (yn) return finish(last, all.slice(-4, -1).map((l) => l.trim()).join('\n'), ['Yes', 'No'], yn[1] === 'y/N' ? 1 : 0, ['y', 'n']);
  // lists must end the screen; at most 2 hint lines (Enter to select ...) may follow
  let end = all.length;
  let hint = false;
  while (end > 0 && all.length - end < 2 && HINT.test(all[end - 1]) && all[end - 1].trim().length < 80 && !NUMBERED.test(all[end - 1]) && !MARKED.test(all[end - 1])) { end--; hint = true; }
  const block = (match) => { let i = end; while (i > 0 && match(all[i - 1])) i--; return i; };
  // numbered: 1. Yes  2. No
  const ni = block((l) => NUMBERED.test(l));
  const rows = all.slice(ni, end).map((l) => NUMBERED.exec(l));
  if (rows.length >= 2 && rows.every((m, k) => Number(m[2]) === k + 1) && ni > 0) {
    const title = all[ni - 1].trim();
    const marked = rows.findIndex((m) => m[1]);
    if (/\?\s*$/.test(title) || ASKS.test(title) || hint || marked >= 0) return finish(title, all.slice(Math.max(0, ni - 5), ni - 1).map((l) => l.trim()).join('\n'), rows.map((m) => m[3].trim()), Math.max(0, marked), rows.map((m) => (rows.length <= 9 ? m[2] : '')));
  }
  // arrow-selected: exactly one marked row, the rest indented or hollow radios
  const ai = block((l) => MARKED.test(l) || RADIO.test(l) || INDENT.test(l));
  const arows = all.slice(ai, end);
  const marks = arows.map((l) => MARKED.test(l));
  if (arows.length >= 2 && ai > 0 && marks.filter(Boolean).length === 1 && !NUMBERED.test(arows[0])) {
    const title = all[ai - 1].trim();
    const radio = arows.some((l) => RADIO.test(l)) || /^\s*●/.test(arows[marks.indexOf(true)]);
    if (/\?\s*$/.test(title) || ASKS.test(title) || hint || radio) return finish(title, all.slice(Math.max(0, ai - 5), ai - 1).map((l) => l.trim()).join('\n'), arows.map((l) => (MARKED.exec(l) ?? RADIO.exec(l) ?? INDENT.exec(l)).slice(-1)[0].trim()), marks.indexOf(true));
  }
  return null;
}

const enc = (t) => ({ bytes: new TextEncoder().encode(t) });
const clean = (t) => { if (/[\x00-\x1f\x7f]/.test(t)) throw new RangeError('control characters not allowed'); return t; };
const controls = {
  interrupt: () => enc('\x1b'), // Esc; many CLIs only honour Ctrl-C, hence the second control
  interruptCtrlC: () => enc('\x03'),
  answerPrompt(prompt, index) {
    const o = prompt.options.find((x) => x.index === index);
    if (!o) throw new RangeError(`no option ${index}`);
    if (o.hotkey) return enc(o.hotkey); // digit, y/n, or Enter
    const d = index - prompt.selected;
    return enc((d > 0 ? '\x1b[B' : '\x1b[A').repeat(Math.abs(d)) + '\r');
  },
  slash: (command) => enc(`${clean(command).startsWith('/') ? '' : '/'}${command}\r`),
  send: (text) => enc(`${clean(text)}\r`),
};

const r = (element, shown, driven, how) => ({ element, shown, driven, how });
const coverage = [
  r('text the user sent from the desktop', 'chat', 'yes', 'the only chat items for an unmapped CLI; recorded on send'),
  r('assistant replies, thinking, tool calls, diffs, todos, usage', 'terminal-only', 'n/a', 'no screen-to-chat parsing; visible in the terminal view only'),
  r('prompts: numbered, arrow-selected, (y/n), Press Enter', 'chat', 'yes', 'best-effort screen match; returns null when unsure'),
  r('interrupt', 'chat', 'yes', 'Esc and Ctrl-C declared separately'),
  r('slash commands and text', 'chat', 'yes', 'sent as typed text plus Enter'),
  r('model, mode, compact, clear', 'terminal-only', 'no', 'differ per CLI; use slash'),
];

export function createGenericMapper() {
  return {
    newState: () => ({ n: 0 }),
    sent: (state, text, ts = Date.now()) => ({ id: `sent-${++state.n}`, ts, kind: 'user', text }),
    meta: () => ({ agent: 'generic' }),
    parsePrompt,
    controls,
    coverage,
  };
}
