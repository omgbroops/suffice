// Structured readers for recorded Claude Code screens. Each returns plain data (or null when the screen is not that
// shape) and `keys` holds the bytes that drive it. Written against test/fixtures/tui-real/claude/screens; no model, no guessing.
const strip = (s) => String(s ?? '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
const rowsOf = (input) => (Array.isArray(input) ? input : strip(input).split('\n')).map((l) => l.replace(/\s+$/, ''));
const lastFrame = (rows) => { const i = rows.findLastIndex((l) => /^--- page \d+ ---$/.test(l)); return i < 0 ? rows : rows.slice(i + 1); };
const bodyRows = (input) => { const r = lastFrame(rowsOf(input)); const i = r.findLastIndex((l) => /^▔{10,}/.test(l)); return i < 0 ? r : r.slice(i + 1); };

export const KEYS = { esc: '\x1b', down: '\x1b[B', up: '\x1b[A', left: '\x1b[D', right: '\x1b[C', tab: '\t', shiftTab: '\x1b[Z', enter: '\r', ctrlU: '\x15', ctrlR: '\x12', ctrlO: '\x0f', backspace: '\x7f' };
const keysFor = (...n) => Object.fromEntries(n.map((k) => [k, KEYS[k]]));

const pct = (v) => Number(v);

export function parseSlashList(input) {
  const rows = lastFrame(rowsOf(input)).map((l) => /^\s*(❯)?\s*(\/[\w:.-]+)\s{2,}(\S.*)$/.exec(l)).filter(Boolean);
  if (rows.length < 2) return null;
  return { commands: rows.map((m) => ({ name: m[2], description: m[3], selected: !!m[1] })), keys: keysFor('up', 'down', 'enter', 'esc') };
}

const typeOf = (v) => (/^(true|false)$/.test(v) ? 'boolean' : /^\d+(\.\d+)?$/.test(v) ? 'number' : /›$/.test(v) ? 'enum' : 'string');
export function parseSettings(input) {
  const rows = bodyRows(input).map((l) => /^\s*(❯)?\s{1,4}([^\s│╭╰].*?)\s{3,}(\S.*)$/.exec(l)).filter((m) => m && !/\s{3,}/.test(m[3]) && !/^Settings\s/.test(m[2]));
  if (rows.length < 2) return null;
  return { settings: rows.map((m) => ({ label: m[2], value: m[3], type: typeOf(m[3]), selected: !!m[1] })), keys: keysFor('up', 'down', 'enter', 'esc', 'tab') };
}

// "Label:   value" rows plus "████ 32% used" bars (the label is the nearest row above the bar).
export function parseDashboard(input) {
  const rows = bodyRows(input);
  const fields = [];
  const bars = [];
  rows.forEach((l, i) => {
    const bar = /[█▓▒░]+\s+(\d+)%\s*(used)?/.exec(l);
    if (bar && /[█░]/.test(l)) { const label = rows.slice(0, i).findLast((x) => x.trim() && !/[█░]/.test(x))?.trim() ?? ''; bars.push({ label, percent: pct(bar[1]) }); return; }
    const cat = /[⛁⛶⛝]\s+([A-Z][\w ]+?):\s+(.+?)\s+\((\d+(?:\.\d+)?)%\)\s*$/.exec(l);
    if (cat) { fields.push({ key: cat[1], value: cat[2] }); bars.push({ label: cat[1], percent: Number(cat[3]) }); return; }
    const kv = /^\s{2,}([A-Z][\w ()/.'-]{1,40}?):\s+(\S.*)$/.exec(l);
    if (!kv) return;
    const [first, ...rest] = kv[2].split(/\s{3,}/);
    fields.push({ key: kv[1], value: first });
    for (const c of rest) { const m = /^([A-Z][\w ]{1,30}?):\s+(\S.*)$/.exec(c); if (m) fields.push({ key: m[1], value: m[2] }); }
  });
  if (!fields.length && !bars.length) return null;
  return { fields, bars, keys: keysFor('left', 'right', 'tab', 'esc') };
}

export function parseHelp(input) {
  const out = [];
  for (const l of rowsOf(input)) {
    if (!/\s{3,}|^\s+\S/.test(l) || /^\s*[⚠↑↓]/.test(l)) continue;
    for (const cell of l.trim().split(/\s{3,}/)) { const m = /^((?:(?:ctrl|shift|opt|alt|cmd)(?: \+ \S+)+(?: [=\/-]+)?)|double tap esc|\/\w+|[^\sA-Za-z]\S*) (to|for) (.+)$/.exec(cell); if (m) out.push({ key: m[1], action: `${m[2]} ${m[3]}` }); }
  }
  return out.length >= 4 ? { shortcuts: out, keys: keysFor('esc') } : null;
}

export function parsePermissions(input) {
  const rows = bodyRows(input).map((l) => /^\s*([❯↓↑])?\s*(\d+)\.\s+(\S.*)$/.exec(l)).filter(Boolean);
  if (!rows.length) return null;
  return { rules: rows.map((m) => ({ n: Number(m[2]), rule: m[3], selected: m[1] === '❯' })), moreBelow: rows.some((m) => m[1] === '↓'), keys: keysFor('left', 'right', 'down', 'up', 'enter', 'esc') };
}

export function parseMcp(input) {
  const rows = bodyRows(input).map((l) => /^\s*(❯)?\s*([✔◯✘✗⚠])\s+(\S+?)(?:\s{2,}(\S.*))?$/.exec(l)).filter(Boolean);
  if (!rows.length) return null;
  return { servers: rows.map((m) => ({ name: m[3], status: { '✔': 'connected', '◯': 'disabled' }[m[2]] ?? 'failed', detail: m[4] ?? '', selected: !!m[1] })), keys: keysFor('up', 'down', 'enter', 'esc') };
}

// /list-agents output: "[state]  ·  a  ·  b  ·  started 10m ago".
export function parseAgents(input) {
  const rows = rowsOf(input).map((l) => /^\s*\[(\w+)\]\s+·\s+(.+?)\s+·\s+(.+?)\s+·\s+started (.+)$/.exec(l)).filter(Boolean);
  if (!rows.length) return null;
  return { agents: rows.map((m) => ({ state: m[1], name: m[2], detail: m[3], started: m[4] })), keys: keysFor('esc') };
}

export function parseTasks(input) {
  const rows = bodyRows(input);
  const i = rows.findIndex((l) => /^\s*Background\s*$/.test(l));
  if (i < 0) return null;
  const earlier = rows.map((l) => /Earlier in this session \((\d+)\)/.exec(l)).find(Boolean);
  const running = rows.slice(i + 1).some((l) => /No tasks currently running/.test(l)) ? 0 : null;
  return { running, earlier: earlier ? Number(earlier[1]) : null, keys: keysFor('up', 'down', 'enter', 'esc') };
}

export function parseModeFooter(input) {
  const m = rowsOf(input).map((l) => /^\s*(?:⏵⏵|⏸)\s+(.+?)\s+on\b/.exec(l)).findLast(Boolean);
  return m ? { mode: m[1].replace(/ mode$/, ''), keys: keysFor('shiftTab') } : null;
}

// "@query" in the input row, plus any path rows of the popup under it.
export function parseFilePopup(input) {
  const rows = rowsOf(input);
  const i = rows.findLastIndex((l) => /^❯\s.*@\S*$/.test(l));
  if (i < 0) return null;
  const query = /@(\S*)$/.exec(rows[i])[1];
  const files = rows.slice(i + 2).map((l) => /^\s*(❯)?\s*([\w./-]+\/?)\s*$/.exec(l)).filter((m) => m && /[./]/.test(m[2])).map((m) => ({ path: m[2], selected: !!m[1] }));
  return { query, files, keys: keysFor('up', 'down', 'tab', 'enter', 'esc') };
}

export function parseHistorySearch(input) {
  const rows = rowsOf(input);
  const box = rows.map((l) => /⌕\s*(.*?)\s*│?$/.exec(l)).findLast(Boolean);
  const entries = rows.map((l) => /^\s*([❯↑↓])?\s*(\d+\w+ ago)\s+(\S.*?)\s*(?:[╭│╰].*)?$/.exec(l)).filter(Boolean);
  if (!box || !entries.length) return null;
  return { filter: box[1], entries: entries.map((m) => ({ age: m[2], text: m[3], selected: m[1] === '❯' })), keys: keysFor('up', 'down', 'enter', 'esc', 'ctrlR') };
}

// One entry point: file name hint -> parser. Used by the coverage report.
export const PARSERS = { slash: parseSlashList, settings: parseSettings, dashboard: parseDashboard, help: parseHelp, permissions: parsePermissions, mcp: parseMcp, agents: parseAgents, tasks: parseTasks, mode: parseModeFooter, file: parseFilePopup, history: parseHistorySearch };
