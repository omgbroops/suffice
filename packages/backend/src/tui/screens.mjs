// Recognise WHAT a Claude Code screen is before reading anything off it. A region becomes clickable options only for a
// known prompt grammar (numbered options under a permission / question / plan / trust cue). Everything else is a picker
// (own parser), or is shown in the terminal view: no options, no text scraped from the screen.
// Rows may be a string or an array of strings. All patterns are written from recalled Claude Code output and the
// recordings in test/fixtures/tui-real; synthetic screens in tui-screens.test.mjs are marked unverified only where no capture exists.
import { createHash } from 'node:crypto';

const stripAnsi = (s) => String(s ?? '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
export const SPIN = /^\s*[·✢✳✶✻✽*●]\s+(\p{L}[\p{L}'-]*(?: \p{L}[\p{L}'-]*)?)…\s*\((.*)\)\s*$/u;

const LOGO = '▐▛█▜▌▝▘▀▄▗▖';
const BANNER = new RegExp(`^[\\s${LOGO}]*[▐▛█▜▌▝▘]`);
const LEAD = new RegExp(`^[\\s${LOGO}]+`);
const TMUX = [/^[\s─━▔╌│]*tmux (?:detected|focus-events off)\s*·/, /[─━▔╌]{3,}.*\btmux (?:detected|focus-events off)\s*·/];
export const RULE = /^\s*[─━▔╌╍]{4,}|[─━▔╌╍]{8,}\s*$/;
const BOX = /^\s*[╭╰│┌└├╮╯┐┘┤]/;
const HINT = /\b(?:esc|enter|tab|space|ctrl\+\w|shift\+tab|←\/→|↑\/↓|↑↓)\b.{0,40}\bto\b|^\s*[↑↓←→]+(?:\/[↑↓←→])?\s+to\b|^\s*type to search/i;
const TABBAR = /^\s{1,4}\S(?:[^\s]| (?=\S)){0,19}(?:\s{2,}\S(?:[^\s]| (?=\S)){0,19}){2,}\s*$/;
const MARKED = /^\s*[❯›]\s+\S/;
const NUMBERED = /^\s*(❯)?\s*(\d+)\.\s+(\S.*)$/;
const INPUT_ROW = /^\s*(?:│\s*)?[❯>!](?:\s|$)/;
const isHint = (l) => HINT.test(l) && !SPIN.test(l) && !/interrupt/.test(l) && l.length < 220 && !NUMBERED.test(l) && !MARKED.test(l);

/** Split off the chrome. rows keeps rule rows and blanks (a diff panel sits between rules); banner and tmux rows are gone. */
export function chrome(input) {
  const all = (Array.isArray(input) ? input : String(input ?? '').split('\n')).map((l) => stripAnsi(l).replace(/\r/g, '').replace(/\s+$/, ''));
  // A dialog opens under a ▔ top rule (or a tmux advisory ending in one); scrollback above it is not part of the screen.
  // Scrolling-capture recordings separate frames with "--- page N ---": only the last frame is the screen.
  const page = all.findLastIndex((l) => /^--- page \d+ ---$/.test(l));
  const top = all.findLastIndex((l) => /^▔{4,}|▔$/.test(l));
  const box = all.findLastIndex((l) => /⌕/.test(l));
  // A dialog with no ▔ top rule (history search) opens under the last plain rule above its ⌕ box.
  const plain = top < 0 && box >= 0 ? all.slice(0, box).findLastIndex((l) => /^─{20,}$/.test(l)) : -1;
  const src = all.slice(Math.max(0, page + 1, top, plain));
  const rows = [];
  const texts = [];
  let tmux = 0, rules = 0;
  for (const l of src) {
    if (BANNER.test(l)) { const t = l.replace(LEAD, ''); if (t) texts.push(t); continue; }
    if (TMUX.some((re) => re.test(l))) { tmux++; continue; }
    if (RULE.test(l)) rules++;
    rows.push(l);
  }
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows.at(-1).trim()) rows.pop();
  const v = texts.findIndex((t) => /^Claude Code v\S+/.test(t));
  const header = v < 0 ? null : { version: /^Claude Code v(\S+)/.exec(texts[v])[1], model: texts[v + 1] ?? '', folder: texts[v + 2] ?? '' };
  return { rows, header, tmux, rules };
}

// ---- dialogs: the only place options are created from a screen ----
const hash = (title, labels) => createHash('sha1').update(`${title}\n${labels.join('\n')}`).digest('hex').slice(0, 12);

function numberedGroup(lines) {
  let group = [];
  lines.forEach((l, i) => { // a "1." starts a new group so a numbered plan above the options is ignored
    const m = NUMBERED.exec(l);
    if (!m) return;
    if (Number(m[2]) === 1) group = [];
    group.push({ i, n: Number(m[2]), label: m[3].trim(), marked: !!m[1] });
  });
  return group.length >= 2 && group.every((r, k) => r.n === k + 1) ? group.map((r) => ({ ...r, hotkey: String(r.n) })) : [];
}

/** Options + title + body for a dialog already known to be one of `type`. Null when the grammar does not fit. */
export function parseDialog(rows, type) {
  const lines = rows.filter((l) => l.trim()).map((l) => l.replace(/\s+$/, '')).slice(-25);
  let found = numberedGroup(lines);
  if (!found.length && type === 'trust') { // unnumbered trust dialog: ❯ row plus rows indented 3+, directly above the footer
    const footer = lines.findLastIndex((l) => /Enter to (confirm|select)|Esc to cancel/.test(l));
    const up = [];
    for (let i = footer - 1; footer > 0 && i >= 0 && (MARKED.test(lines[i]) || /^\s{3,}\S/.test(lines[i])); i--) up.unshift({ i, label: lines[i].replace(/^\s*❯?\s*/, '').trim(), marked: /^\s*❯/.test(lines[i]) });
    if (up.length >= 2 && up.some((r) => r.marked)) found = up; // shortcut: multi-line option labels unsupported, upgrade when one shows up
  }
  if (found.length < 2) return null;
  const options = found.map((r, k) => {
    const box = /^\[([ ✔])\]\s+(.*)$/.exec(r.label); // multi-select row: "[✔] apple"
    return { index: k, label: box ? box[2] : r.label, ...(box ? { checked: box[1] === '✔' } : {}), ...(/^Type something/.test(box ? box[2] : r.label) ? { other: true } : {}), ...(r.hotkey ? { hotkey: r.hotkey } : {}) };
  });
  const selected = Math.max(0, found.findIndex((r) => r.marked));
  let ti = -1;
  for (let j = found[0].i - 1; j >= 0; j--) if (lines[j].includes('?')) { ti = j; break; }
  if (ti < 0) ti = Math.max(0, found[0].i - 1);
  const title = type === 'trust' ? 'Is this a project you created or one you trust?' : lines[ti].trim();
  let above = lines.slice(Math.max(0, ti - 6), ti).filter((l) => !SPIN.test(l));
  const rl = above.map((l, k) => (/^[\s╌─━╍-]{3,}$/.test(l) ? k : -1)).filter((k) => k >= 0); // diff/preview panel between rules is not dialog text
  if (rl.length) above = [...above.slice(0, rl[0]), ...above.slice(rl.length > 1 ? rl.at(-1) + 1 : rl[0] + 1).filter(() => rl.length > 1)];
  const body = above.map((l) => l.trim()).join('\n');
  const ptype = type === 'trust' ? 'trust' : type === 'permission' ? 'permission' : 'choice';
  return { promptId: hash(title, options.map((o) => o.label)), type: ptype, title, ...(body ? { body } : {}), ...(options.some((o) => 'checked' in o) ? { multiSelect: true } : {}), options, selected };
}

// ---- picker ----
const indent = (l) => l.search(/\S/);
const DETAIL = /·|\bago\b|\d\s?(?:KB|MB|GB|B)\b/;
const textOf = (l) => l.replace(/^\s*[❯›]?\s*(?:[✔✓]\s+)?/, '').trim();

/** Selectable list (resume, model, rewind, agents, mcp, ...): { title, searchable, groups, entries:[{label, detail, selected, group?}], hints, selected }. */
export function parsePickerScreen(input) {
  const { rows: R } = chrome(input);
  const hints = [];
  const searchable = R.some((l) => /⌕|Search(?:…|\.\.\.)/.test(l));
  const rows = R.filter((l) => !RULE.test(l) && !BOX.test(l) && !/⌕|^\s*Search(?:…|\.\.\.)/.test(l)).filter((l) => (isHint(l) ? (hints.push(...l.trim().split(/\s+·\s+/)), false) : true));
  const sel = rows.findIndex((l) => MARKED.test(l));
  const ti = rows.findIndex((l) => l.trim());
  if (sel < 0 || ti < 0 || ti >= sel) return null;
  const col = /^\s*[❯›]\s+(?:[✔✓]\s+)?/.exec(rows[sel])[0].length; // text column; a ✔ after the marker is part of the marker
  const isEntry = (l) => !/^\s*▸/.test(l) && (MARKED.test(l) || indent(l) === col || (/^\s*[✔✓]\s/.test(l) && indent(l) === col - 2));
  const blocks = [];
  let cur = [];
  for (const l of rows.slice(ti + 1)) { if (l.trim()) cur.push(l); else if (cur.length) { blocks.push(cur); cur = []; } }
  if (cur.length) blocks.push(cur);
  const twoLine = blocks.some((b) => b.length >= 2 && isEntry(b[0]) && indent(b[1]) >= col && DETAIL.test(b[1]));
  const entries = [], groups = [];
  let group;
  const push = (label, detail, selected) => entries.push({ label, detail, selected, ...(group ? { group } : {}) });
  for (const b of blocks) {
    if (twoLine) {
      if (isEntry(b[0]) && b.length >= 2 && indent(b[1]) >= col && DETAIL.test(b[1])) push(textOf(b[0]), b[1].trim(), MARKED.test(b[0]));
      else if (b.length === 1 && MARKED.test(b[0])) push(textOf(b[0]), '', true);
      else if (b.length === 1) { group = textOf(b[0]); groups.push(group); }
    } else {
      for (const l of b) {
        if (isEntry(l)) {
          const [label, ...rest] = textOf(l).replace(/^\d+\.\s+/, '').split(/\s{2,}/);
          push(label, rest.join('  '), MARKED.test(l));
        } else if (entries.length && indent(l) > col && !entries.at(-1).detail) entries.at(-1).detail = l.trim();
      }
    }
  }
  if (!entries.some((e) => e.selected)) return null;
  return { title: textOf(rows[ti]), searchable, groups, entries, hints, selected: entries.findIndex((e) => e.selected) };
}

const enc = (s) => ({ bytes: new TextEncoder().encode(s) });
/** Key bytes that move the picker's selection to entry n and confirm. */
export function pickerSelect(picker, n) {
  if (!Number.isInteger(n) || n < 0 || n >= picker.entries.length) throw new RangeError(`no entry ${n}`);
  const d = n - picker.selected;
  return enc((d > 0 ? '\x1b[B' : '\x1b[A').repeat(Math.abs(d)) + '\r');
}
export const pickerCancel = () => enc('\x1b');
export function pickerSearch(picker, text) {
  if (!picker.searchable) throw new RangeError('picker has no search');
  if (/[\x00-\x1f\x7f]/.test(text)) throw new RangeError('control characters not allowed');
  return enc(text);
}

// ---- classifier ----
const PLAN_CUE = /Ready to code\?|Would you like to proceed\?|Here is Claude'?s plan/;
const PLAN_OPT = /keep planning|manually approve|Tell Claude what to change|auto[- ]accept|auto mode|bypass permissions/i;
const PERM_CUE = /Do you want|Would you like to|\bAllow\b/;
const TRUST_CUE = /Quick safety check|trust this folder|Do you trust the files/i;
const LOGIN_CUE = /Select login method|Paste code here if prompted|Browser didn'?t open|Claude account with subscription|Anthropic Console account|Login successful/i;
const MENU_CUE = /^\s*(?:Settings|Config)\s*$|Space to change|Enter\/Space to(?! cycle)/im;
const DASH_CUE = /^\s*(?:⎿\s+)?(?:Total cost:|Context Usage\b|Diagnostics\b|Current session\b|Claude Code status\b|Status\s{2,}Config|Settings:\s+Status|Shortcuts\b)/m;

function hasInput(L) {
  for (let i = 0; i < L.length; i++) {
    if (RULE.test(L[i]) && L[i + 1] && INPUT_ROW.test(L[i + 1]) && !NUMBERED.test(L[i + 1]) && L.slice(i + 2, i + 9).some((l) => RULE.test(l))) return i;
    if (/^\s*╭[─┄]+╮/.test(L[i]) && L[i + 1] && INPUT_ROW.test(L[i + 1])) return i;
  }
  return -1;
}

export function classifyScreen(input) {
  const c = chrome(input);
  const L = c.rows.filter((l) => l.trim());
  const text = L.join('\n');
  const out = (kind, confidence, extra = {}) => ({ kind, confidence, chrome: { header: c.header, tmux: c.tmux, rules: c.rules }, ...extra });
  if (!L.length) return out('unknown', 0);
  const inp = hasInput(L);
  const group = numberedGroup(L);
  const firstOpt = group.length ? group[0].i : -1;
  const noInputBelow = inp < 0 || inp < firstOpt;
  const marked = L.some((l) => MARKED.test(l) && !NUMBERED.test(l) || (NUMBERED.test(l) && MARKED.test(l)));
  const dialog = (kind, type, confidence) => {
    const prompt = parseDialog(c.rows, type);
    return prompt ? out(kind, confidence, { prompt }) : null;
  };
  if (inp < 0 && LOGIN_CUE.test(text)) return out('login', 0.9);
  if (/Showing detailed transcript/.test(text)) return out('transcript-view', 0.95);
  if (TRUST_CUE.test(text) && noInputBelow) { const d = dialog('trust', 'trust', 0.95); if (d) return d; }
  const labels = group.map((r) => r.label);
  // A tab bar (3+ short words separated by 2+ spaces) heads a tabbed dialog: never a permission/question prompt.
  const bar = L.find((l) => !RULE.test(l));
  if (inp < 0 && bar && TABBAR.test(bar) && !bar.includes('·')) return L.some((l) => MARKED.test(l) || NUMBERED.test(l) || /⌕|Search…/.test(l)) ? out('menu', 0.8) : out('dashboard', 0.6);
  if (group.length && noInputBelow) {
    let d = null;
    if (PLAN_CUE.test(text) && labels.some((x) => PLAN_OPT.test(x))) d = dialog('plan', 'plan', 0.95);
    else if (PERM_CUE.test(L.slice(Math.max(0, firstOpt - 8), firstOpt).join('\n')) || (/^Yes\b/.test(labels[0]) && labels.some((x) => /^No\b/.test(x)))) d = dialog('permission', 'permission', 0.95);
    else if (L.some((l) => /^\s*[☐☒✔]\s+\S/.test(l)) || labels.some((x) => /^(Chat about this|Type something)/.test(x)) || /\?\s*$/.test(L[Math.max(0, firstOpt - 1)] ?? '') || (L.slice(0, firstOpt).findLast((l) => l.trim())?.includes('?') && L.some((l) => /Enter to select/.test(l)))) d = dialog('question', 'question', 0.9);
    if (d) return d;
  }
  if (inp < 0 && marked && (L.some(isHint) || c.rows.some((l) => /⌕|Search…/.test(l)))) {
    if (MENU_CUE.test(text)) return out('menu', 0.8);
    const picker = parsePickerScreen(c.rows);
    if (picker) return out('picker', 0.9, picker);
  }
  if (inp < 0 && MENU_CUE.test(text) && L.some(isHint)) return out('menu', 0.7);
  // Command list with no title or hint (the "/" popup scrolled on its own): a marked row plus /name rows.
  const cmds = L.filter((l) => /^\s*(?:[❯›]\s+)?\/[\w:-]+(?:\s{2,}|$)/.test(l));
  if (inp < 0 && marked && cmds.length >= 3 && cmds.length >= L.length - 2) {
    const entries = cmds.map((l) => { const [label, ...d] = textOf(l).split(/\s{2,}/); return { label, detail: d.join('  '), selected: MARKED.test(l) }; });
    return out('picker', 0.7, { title: '', searchable: false, groups: [], entries, hints: [], selected: entries.findIndex((e) => e.selected) });
  }
  if (inp < 0 && !marked && L.some(isHint)) return out('dashboard', 0.6);
  // Only output newer than the last user message counts: a /context block scrolled above a later turn is chat.
  const lastUser = L.findLastIndex((l) => /^❯\s+\S/.test(l));
  if (DASH_CUE.test(L.slice(lastUser + 1).join('\n'))) return out('dashboard', 0.7);
  if (inp >= 0) return out('chat', 0.9);
  if (group.length && marked) return out('menu', 0.6); // numbered choice dialog that is not a permission, question or plan (rewind confirm)
  return out('unknown', 0.2);
}

// ---- mapper side ----
// True for a recognised Claude picker/menu/dashboard/chat screen: other agents' prompt parsers must not read options off it.
export const claudeNonPrompt = (input) => { const c = classifyScreen(input); if (!/[❯▔⌕✔◯⏵⏸]/.test(String(input))) return false; if (c.kind === 'menu' && c.confidence <= 0.6 && !c.chrome?.rules && !c.chrome?.header) return false; // bare numbered list, no Claude chrome: a generic agent's own prompt
  return ['picker', 'menu', 'dashboard', 'transcript-view', 'login'].includes(c.kind) || (c.kind === 'chat' && !!c.chrome?.header?.version); };
export const TERMINAL_KINDS = ['unknown', 'menu', 'dashboard', 'login', 'transcript-view'];
/** The one item for a screen the chat view cannot show: a notice carrying openTerminal so the app can offer "Open terminal". */
export function screenItems(input, ts = Date.now()) {
  const { kind } = classifyScreen(input);
  return TERMINAL_KINDS.includes(kind) ? [{ id: `screen:${kind}`, ts, kind: 'notice', level: 'info', code: 'other', text: 'This screen is shown in the terminal view', openTerminal: true, screenKind: kind }] : [];
}
