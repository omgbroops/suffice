// One-line summary of a run of tool / todo / subagent items: "Made 3 edits +12 -4, ran 2 shell commands, 1 failed".
// Pure: items in (model.mjs shapes), { text, parts: [{ category, count, added?, removed? }] } out.

const WORDS = { // [past verb, present verb, singular, plural]
  edit: ['made', 'making', 'edit', 'edits'],
  shell: ['ran', 'running', 'shell command', 'shell commands'],
  read: ['read', 'reading', 'file', 'files'],
  search: ['searched', 'searching', 'time', 'times'],
  web: ['fetched', 'fetching', 'page', 'pages'],
  subagent: ['ran', 'running', 'subagent', 'subagents'],
  todo: ['updated', 'updating', 'todo list', 'todo lists'],
  ask: ['asked', 'asking', 'question', 'questions'],
  plan: ['proposed', 'proposing', 'plan', 'plans'],
  other: ['used', 'using', 'tool', 'tools'],
};

const lines = (s) => (typeof s === 'string' && s ? s.split('\n').length - (s.endsWith('\n') ? 1 : 0) : 0);

/** +/- line counts of one diff entry, or null when it carries no usable text. */
function diffCounts(d) {
  if (typeof d?.patch === 'string' && d.patch) {
    let added = 0, removed = 0;
    for (const l of d.patch.split('\n')) {
      if (l.startsWith('+') && !l.startsWith('+++')) added++;
      else if (l.startsWith('-') && !l.startsWith('---')) removed++;
    }
    return { added, removed };
  }
  if (typeof d?.oldText === 'string' || typeof d?.newText === 'string') return { added: lines(d.newText), removed: lines(d.oldText) };
  return null;
}

// working=false (session idle/done/stopped): a leftover 'running' item reads as past tense. Activity clauses cap at MAX, then 'and N more'; failures always show.
const MAX = 3;
export function summarizeTools(items, { working = true } = {}) {
  const parts = new Map(); // category -> { part, done, running }
  let failed = 0, denied = 0, running = 0;
  for (const it of items || []) {
    const category = it.kind === 'todo' ? 'todo' : it.kind === 'subagent' ? 'subagent' : it.kind === 'tool' ? (it.name === 'AskUserQuestion' ? 'ask' : it.name === 'ExitPlanMode' ? 'plan' : it.category === 'write' ? 'edit' : it.category) : null;
    if (!category) continue;
    const key = WORDS[category] ? category : 'other'; // mcp and unknown categories
    let e = parts.get(key);
    if (!e) parts.set(key, (e = { part: { category: key, count: 0 }, done: 0, running: 0 }));
    e.part.count++;
    if (it.status === 'running' && working) { e.running++; running++; } else e.done++;
    if (it.status === 'error') failed++;
    if (it.status === 'denied') denied++;
    if (key === 'edit') for (const d of it.output?.diff || []) {
      const c = diffCounts(d);
      if (!c) continue;
      e.part.added = (e.part.added || 0) + c.added;
      e.part.removed = (e.part.removed || 0) + c.removed;
    }
  }
  const phrase = (verb, n, one, many) => `${verb} ${n} ${n === 1 ? one : many}`;
  const out = [];
  for (const { part, done, running: run } of parts.values()) {
    const [past, now, one, many] = WORDS[part.category];
    if (done) {
      let s = phrase(past, done, one, many);
      if (part.added !== undefined) s += ` +${part.added}${part.removed ? ` -${part.removed}` : ''}`;
      out.push(s);
    }
    if (run) out.push(phrase(now, run, one, many));
  }
  if (out.length > MAX) out.splice(MAX, out.length, `and ${out.length - MAX} more`);
  if (failed) out.push(`${failed} failed`);
  if (denied) out.push(`${denied} denied`);
  let text = out.join(', ');
  if (running) text += '…';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return { text, parts: [...parts.values()].map((e) => e.part) };
}
