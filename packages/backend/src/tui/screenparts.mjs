// Pure screen-text parsers for TUI chrome that is not a chat item: mode line, queued messages, input draft,
// background tasks, context warning, list pickers. Each takes the screen text and returns an object, or null when unsure.
// The docs fetched 2026-11-16 (interactive-mode.md, permission-modes.md) name the features but not the exact screen
// wording, so every pattern below is `// assumed` from recalled TUI output until a real recording confirms it.

const stripAnsi = (s) => String(s ?? '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
const linesOf = (s) => stripAnsi(s).replace(/\r/g, '').split('\n');
const nonEmpty = (ls) => ls.filter((l) => l.trim());
const RULE = /^\s*[╭╰]?[─━▔]{8,}[╮╯]?\s*$/;
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const countOf = (w) => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w.toLowerCase()]);

// ---- mode line ----
// Claude footer: "⏵⏵ accept edits on (shift+tab to cycle)", "⏸ plan mode on (shift+tab to cycle)". // assumed
// Codex footer: "Plan mode (shift+tab to cycle)". // assumed
const CLAUDE_MODE_LINE = /^\s*[⏵⏸]+\s*(accept edits|manual mode|plan mode|bypass permissions|auto mode|don'?t ask(?: mode)?)\s+on\b/i; // confirmed: mode-cycle/06-mode-1, 07-mode-2, 08-mode-3, 09-mode-4 (manual mode, no hint)
const MODE_IDS = { 'accept edits': 'acceptEdits', 'manual mode': 'default', 'plan mode': 'plan', 'bypass permissions': 'bypassPermissions', 'auto mode': 'auto' };
export function parseModeLine(screen) {
  const tail = nonEmpty(linesOf(screen)).slice(-6); // the footer sits under the input box
  for (let i = tail.length - 1; i >= 0; i--) {
    const c = CLAUDE_MODE_LINE.exec(tail[i]);
    if (c) {
      const key = c[1].toLowerCase();
      return { agent: 'claude', mode: MODE_IDS[key] ?? 'dontAsk', hint: /shift\+tab to cycle/i.test(tail[i]) ? 'shift+tab to cycle' : undefined };
    }
    if (/^\s*Plan mode\s*\(shift\+tab to (?:cycle|change)[^)]*\)/.test(tail[i])) return { agent: 'codex', mode: 'plan', hint: 'shift+tab to cycle' }; // assumed
  }
  return null;
}

// ---- queued messages ----
// Header "Queued messages" (Codex: "Queued follow-up messages"), items under it start with ↳ - • or ❯. // assumed
export function parseQueued(screen) {
  const ls = linesOf(screen);
  for (let i = ls.length - 1; i >= 0; i--) {
    if (!/^\s*[•·●]?\s*Queued (?:follow-up )?(?:messages?|prompts?|inputs?)\s*:?\s*$/i.test(ls[i])) continue; // assumed
    const messages = [];
    for (let j = i + 1; j < ls.length; j++) {
      const m = /^\s*[↳•\-❯›]\s+(\S.*?)\s*$/.exec(ls[j]);
      if (!m) break;
      messages.push(m[1]);
    }
    return messages.length ? { messages } : null;
  }
  return null;
}

// ---- input draft ----
// The box is a pair of rules around "❯ text" (older builds: │ > text │ in a rounded box); Codex has "› text" with no rules. // assumed
const PROMPT_GLYPH = /^\s*(?:│\s*)?([❯›>])\s?(.*?)\s*(?:│\s*)?$/; // confirmed: at-mention/05-at-picker, model-switch/08-slash-menu, background/10-idle
const PLACEHOLDER = /^(?:Try "|Ask Codex to do anything|Improve documentation in @filename|Summarize recent commits|Explain this codebase)/; // assumed
const MENU_ROW = /^\s*[❯›>]\s*\d+\.\s/;
export function parseInputDraft(screen) {
  const ls = linesOf(screen);
  while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
  const rules = ls.reduce((a, l, i) => (RULE.test(l) ? [...a, i] : a), []);
  let body = null;
  if (rules.length >= 2) {
    const [a, b] = rules.slice(-2);
    body = ls.slice(a + 1, b);
  } else {
    // no rules: a lone "› text" prompt in the last 4 lines (Codex) // assumed
    const tail4 = ls.slice(-4);
    const k = tail4.findIndex((l) => /^\s*›\s/.test(l) && !MENU_ROW.test(l));
    if (k >= 0) body = [tail4[k]];
  }
  if (!body || !body.length) return null;
  const first = PROMPT_GLYPH.exec(body[0]);
  if (!first || MENU_ROW.test(body[0])) return null;
  const parts = [first[2], ...body.slice(1).map((l) => l.replace(/^\s*(?:│\s?)?\s{0,2}/, '').replace(/\s*│\s*$/, ''))];
  const text = parts.join('\n').replace(/\s+$/, '');
  if (PLACEHOLDER.test(text)) return { text: '', placeholder: true };
  return { text };
}

// ---- background tasks ----
// Claude footer: "· 2 background tasks" / "1 shell" with a "↓ to manage" hint. // assumed
// Codex: "1 background terminal running · /ps to view and /stop to close". // assumed
export function parseBackgroundTasks(screen) {
  const tail = nonEmpty(linesOf(screen)).slice(-4);
  for (let i = tail.length - 1; i >= 0; i--) {
    const l = tail[i];
    let m = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten) background terminals? running\b/i.exec(l); // assumed
    if (m) return { count: countOf(m[1]), agent: 'codex' };
    // footer-only: needs the mode glyph or the manage hint so prose like "I ran 3 tasks" never matches
    if (/^\s*[⏵⏸]/.test(l) || /↓ to manage|to manage\b/i.test(l)) {
      m = /\b(\d+) (?:background )?(?:tasks?|shells?|bash(?:es)?|agents?)\b/i.exec(l); // confirmed: background/10-idle ("1 shell")
      if (m) return { count: Number(m[1]), agent: 'claude' };
    }
  }
  return null;
}

// ---- context warning ----
// "Context low (6% remaining) · Run /compact to compact & continue" and "Context left until auto-compact: 8%". // assumed
export function parseContextWarning(screen) {
  const tail = nonEmpty(linesOf(screen)).slice(-8);
  for (let i = tail.length - 1; i >= 0; i--) {
    let m = /\bContext low \((\d+(?:\.\d+)?)% remaining\)/.exec(tail[i]); // assumed
    if (m) return { kind: 'low', percentLeft: Number(m[1]), hint: /\/compact/.test(tail[i]) ? '/compact' : undefined };
    m = /\bContext left until auto-compact:\s*(\d+(?:\.\d+)?)%/.exec(tail[i]); // assumed
    if (m) return { kind: 'auto-compact', percentLeft: Number(m[1]) };
  }
  return null;
}

// ---- list picker (/model, /resume, ...) ----
// Not a permission prompt: claude.parsePrompt / codex.parsePrompt own those. A picker has a title, 2+ rows with one
// marked ❯ or ›, and a navigation hint line. Rows may be numbered ("2. Sonnet") or plain.
const NAV_HINT = /\b(?:enter to (?:confirm|select|choose|set as default)|esc to (?:cancel|go back|exit|close)|↑\/↓|↑↓|to navigate)\b/i; // confirmed: model-switch/05-model-picker ("Esc to cancel")
const PERMISSIONISH = /do you want|\ballow\b|\bpermission|\btrust\b|\bapprove\b|proceed\?/i;
const MORE = /[↑↓]\s*\d*\s*more\b|\bmore (?:above|below)\b|\(\d+\s*(?:\/|of)\s*\d+\)/i; // assumed
export function parsePicker(screen) {
  const ls = linesOf(screen);
  while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
  if (!ls.some((l) => NAV_HINT.test(l))) return null;
  const hint = ls.findLastIndex((l) => NAV_HINT.test(l)); // the picker is the ❯ row nearest above its hint: an earlier "❯ /model" input echo is not a row
  let sel = -1;
  for (let i = hint; i >= 0; i--) if (/^\s*[❯›]\s+\S/.test(ls[i])) { sel = i; break; }
  if (sel < 0) return null;
  const col = ls[sel].search(/[❯›]/) + 2;
  const parse = (l) => {
    const m = /^\s*(?:[❯›]\s+)?(?:(\d+)\.\s+)?(\S.*?)\s*$/.exec(l);
    return m ? { num: m[1] ? Number(m[1]) : null, label: m[2] } : null;
  };
  // rows share one text column: the marked row's text starts at col, unmarked rows are indented to col
  const rowAt = (l) => l.trim() && !NAV_HINT.test(l) && !MORE.test(l) && (/^\s*[❯›]\s+\S/.test(l) || l.search(/\S/) === col);
  let a = sel, b = sel;
  while (a > 0 && rowAt(ls[a - 1])) a--;
  while (b < ls.length - 1 && rowAt(ls[b + 1])) b++;
  const rows = ls.slice(a, b + 1).filter((l) => !/^\s*▸\s/.test(l)).map(parse); // "▸ More models" expander row: confirmed model-switch/05-model-picker
  if (rows.length < 2 || rows.some((r) => !r)) return null;
  const numbered = rows.every((r) => r.num !== null);
  if (!numbered && rows.some((r) => r.num !== null)) return null;
  const options = rows.map((r, i) => ({ index: numbered ? r.num : i + 1, label: r.label }));
  if (options.some((o) => /^(?:yes|no)\b|don'?t ask again/i.test(o.label))) return null; // a permission prompt, not a picker
  let t = a - 1;
  while (t >= 0 && !ls[t].trim()) t--;
  while (t > 0 && ls[t - 1].trim() && !RULE.test(ls[t - 1]) && !/▔{8,}/.test(ls[t - 1])) t--;
  const title = t >= 0 && !RULE.test(ls[t]) ? ls[t].trim() : '';
  if (!title || PERMISSIONISH.test(title) || /Claude Code v\d|▔{8,}/.test(title) || options.some((o) => /^⎿/.test(o.label))) return null; // transcript, not a picker: confirmed model-switch/07-help
  return { title, options, selected: options[sel - a].index, scrolls: ls.some((l) => MORE.test(l)) };
}
