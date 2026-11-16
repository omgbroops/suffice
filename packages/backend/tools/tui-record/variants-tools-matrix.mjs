// Builds variants/tools/MATRIX.json: every planned (tool, state), its capture, and what the mapper does with it. Run: node variants-tools-matrix.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createClaudeMapper } from '../../src/tui/claude.mjs';
import { itemProblem } from '../../src/tui/model.mjs';

export const DIR = fileURLToPath(new URL('../../test/fixtures/tui-real/claude/variants/tools/', import.meta.url));
const NOT = {
  'Write--running': 'completes in under 200 ms; no screen with the tool row and a running state could be sampled',
  'Read--running': 'completes in under 200 ms; not samplable',
  'Edit--running': 'completes in under 200 ms; not samplable',
  'Bash--running': 'sampled screen showed only the spinner (Processing...) before the tool row drew; kept as Bash--running capture of the spinner state only if present',
  'Bash--permission-prompt-ls': 'auto-allowed in default mode, no prompt shown',
  'Bash--permission-prompt-multiline': 'multi-line echo auto-allowed in default mode, no prompt shown',
  'Bash--permission-prompt-git': 'git status auto-allowed in default mode, no prompt shown',
  'Bash--timeout-real': 'the harness blocked sleep 30 with timeout 3000, so no real timeout result was produced',
  'WebFetch--permission-prompt': 'first example.com fetch ran without a domain prompt (no dialog appeared)',
  'MultiEdit--any': 'tool not present in this version; Haiku answered without it',
  'TodoWrite--permission-prompt': 'no prompt shown',
  'TodoWrite--any': 'no TodoWrite tool in this session; Haiku printed a table in chat instead (see TodoWrite--finished)',
  'Agent--permission-prompt': 'no prompt shown',
  'Skill--permission-prompt': 'no prompt shown',
  'ExitPlanMode--approved': 'not answered: choosing Yes would start edits; only the dialog is captured',
  'ExitPlanMode--denied-feedback': 'not captured, run stopped at the dialog (one session per dialog)',
  'Read--permission-prompt': 'reads inside the project folder are auto-allowed',
  'Bash--denied-esc-on-prompt': 'not captured',
  'Glob--permission-prompt': 'read-only tool, no prompt shown',
  'Grep--permission-prompt': 'read-only tool, no prompt shown',
  'NotebookEdit--diff': 'no separate diff screen; see NotebookEdit--finished',
};
const toolOf = (f) => f.split('--')[0]; const stateOf = (f) => f.split('--').slice(1).join('--');
const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const isPromptState = (s) => /(^|-)(prompt|dialog)|permission-prompt/.test(s) && !/^(approved|denied)|no-prompt/.test(s);
const optionLabels = (t) => t.split('\n').map((l) => /^\s*(?:❯)?\s*(\d+)\.\s+(\S.*)$/.exec(l)).filter(Boolean).map((m) => m[2].trim());

export function analyze() {
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, '_meta.json'), 'utf8'));
  const names = Object.keys(meta).filter((f) => fs.existsSync(path.join(DIR, `${f}.txt`))).sort();
  const cache = {}; const mapper = createClaudeMapper();
  const sess = (s) => cache[s] ??= (() => {
    const recs = readJsonl(path.join(DIR, 'transcripts', `${s}.jsonl`)); const st = mapper.newState();
    const items = recs.flatMap((r) => mapper.mapLine(r, st)); const last = new Map(items.map((i) => [i.id, i]));
    return { recs, items: [...last.values()], all: items };
  })();
  const rows = [];
  for (const file of names) {
    const tool = toolOf(file), state = stateOf(file), session = meta[file].session; const screen = fs.readFileSync(path.join(DIR, `${file}.txt`), 'utf8');
    const { recs, items, all } = sess(session);
    const types = [...new Set(recs.map((r) => r.type))].sort(); const uses = new Set(); let results = 0, tur = 0;
    for (const r of recs) for (const b of Array.isArray(r.message?.content) ? r.message.content : []) { if (b.type === 'tool_use' && b.name === tool) uses.add(b.id); }
    for (const r of recs) for (const b of Array.isArray(r.message?.content) ? r.message.content : []) if (b.type === 'tool_result' && uses.has(b.tool_use_id)) { results++; if (r.toolUseResult !== undefined) tur++; }
    const row = { tool, state, file: `${file}.txt`, how: meta[file].how, session, transcriptRecords: { lineTypes: types, [`tool_use:${tool}`]: uses.size, tool_result: results, toolUseResult: tur } };
    const mine = items.filter((i) => i.kind === 'tool' && i.name === tool);
    const key = (i) => String(i.input?.command ?? i.input?.file_path ?? i.input?.notebook_path ?? i.input?.pattern ?? i.input?.url ?? i.input?.query ?? i.input?.skill ?? i.input?.description ?? '').split('\n')[0].slice(0, 24);
    const base = (k) => k.split('/').pop();
    const hit = mine.filter((i) => { const k = base(key(i)); return k && screen.includes(k); });
    const pick = hit[hit.length - 1] ?? mine[mine.length - 1] ?? null; // collapsed screens (Searched for 1 pattern) omit the argument, so fall back to the last item of that tool
    const res = { itemsValid: all.every((i) => itemProblem(i) === null), toolPresent: mine.length > 0, matchedOnScreen: !!pick };
    const wrong = [];
    if (!res.itemsValid) wrong.push(`an item fails itemProblem: ${all.map(itemProblem).find(Boolean)}`);
    if (isPromptState(state)) {
      const p = mapper.parsePrompt(screen); const want = optionLabels(screen);
      res.state = !!p; res.stateNote = 'screen dialog via parsePrompt';
      res.optionsMatch = !!p && p.options.length === want.length;
      const body = p ? `${p.title}\n${p.body ?? ''}` : ''; const k = pick ? base(key(pick)) : '';
      res.keyContent = !!p && (!k || body.includes(k)) ;
      if (!p) wrong.push('parsePrompt returns null for this dialog'); else { if (!res.optionsMatch) wrong.push(`parsePrompt options ${p.options.length} vs ${want.length} on screen`); if (!res.keyContent) wrong.push('prompt title/body lacks the command or path'); }
    } else if (/running|interrupted|background-started/.test(state)) {
      res.state = null; res.stateNote = 'transcript mapper cannot show a live state: transcripts hold only finished results';
      res.keyContent = !!pick; if (!pick) wrong.push('no tool item matches the call on screen');
    } else {
      const want = /denied/.test(state) ? 'denied' : /error/.test(state) ? 'error' : 'ok';
      const okSt = pick && (pick.status === want || (want === 'denied' && pick.status === 'error'));
      res.state = !!okSt; res.stateNote = `want status ${want}, item has ${pick?.status ?? 'no item'}`;
      if (!pick) wrong.push(`no ${tool} item matches the call on screen`); else if (!okSt) wrong.push(`status ${pick.status}, expected ${want}`);
      let kc = !!pick;
      if (pick) {
        if (/error|denied/.test(state)) kc = !!(pick.output?.text || pick.output?.error);
        else if ((tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') && /diff|finished|approved|auto/.test(state)) kc = !!pick.output?.diff?.length;
        else if (tool === 'Bash' && /finished|long|approved|after-wait/.test(state)) kc = typeof pick.output?.text === 'string' && pick.output.text.length > 0;
        if (!kc) wrong.push(/diff/.test(state) || tool === 'Write' || tool === 'Edit' ? 'no diff in the item output (path, add/remove counts missing)' : 'item output has no text for the result shown on screen');
      }
      res.keyContent = kc;
    }
    if (mine.length && !pick?.__x && !new RegExp(tool + '\\(').test(screen) && !/denied/.test(state) && !isPromptState(state) && wrong.length) { res.state = null; res.stateNote = 'cannot pair the screen with one of several calls of this tool; not judged'; wrong.length = 0; }
    if (!mine.length && !isPromptState(state)) { res.state = null; res.stateNote = 'tool absent from transcript (model did not call it)'; wrong.length = 0; }
    row.mapper = res; row.wrong = wrong; row.handledCorrectly = wrong.length === 0 && res.state !== null; row.handled = res.state === null ? 'n/a (no tool call in transcript, or live state)' : wrong.length ? 'wrong' : 'correct';
    rows.push(row);
  }
  const have = new Set(names.map((f) => f)); const missing = Object.entries(NOT).filter(([k]) => !have.has(k)).map(([k, why]) => ({ tool: toolOf(k), state: stateOf(k), file: null, captured: false, reason: `not captured: ${why}` }));
  return { rows, missing };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { rows, missing } = analyze();
  const sum = { captured: rows.length, notCaptured: missing.length, correct: rows.filter((r) => r.handled === 'correct').length, wrong: rows.filter((r) => r.handled === 'wrong').length, notApplicable: rows.filter((r) => r.handled.startsWith('n/a')).length };
  fs.writeFileSync(path.join(DIR, 'MATRIX.json'), JSON.stringify({ summary: sum, rows: [...rows.map((r) => ({ ...r, captured: true })), ...missing] }, null, 1));
  console.log(JSON.stringify(sum));
}
