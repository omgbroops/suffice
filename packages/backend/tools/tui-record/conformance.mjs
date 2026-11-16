// Conformance of the current claude parsers against recorded real sessions.
// Usage (from packages/backend): node tools/tui-record/conformance.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClaudeMapper, parseStatus } from '../../src/tui/claude.mjs';
import { itemProblem, promptProblem } from '../../src/tui/model.mjs';

const root = fileURLToPath(new URL('../../test/fixtures/tui-real/claude/', import.meta.url));
const ESC = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const EXPECT_CAT = (n) => /^mcp__/.test(n) ? 'mcp' : ({ Bash: 'shell', BashOutput: 'shell', KillShell: 'shell', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Write: 'write', Read: 'read', Grep: 'search', Glob: 'search', WebFetch: 'web', WebSearch: 'web', TodoWrite: 'todo', TaskCreate: 'todo', TaskUpdate: 'todo', TaskList: 'todo', TaskGet: 'todo', Agent: 'subagent', Task: 'subagent' }[n]);
const DIALOG_CUE = /Esc to cancel|Enter to (confirm|select)|Do you want|Would you like|trust this folder|keep planning/;
const SPIN_CUE = /^\s*[·✢✳✶✻✽*●]\s+\p{L}[\p{L}' -]*…\s*\(|esc to interrupt|ctrl\+c to interrupt/u;

const lineKinds = (obj) => { // content-block types that mapLine should be able to turn into items
  const c = obj?.message?.content;
  return Array.isArray(c) ? c.map((b) => b?.type).filter(Boolean) : [];
};

function scenario(dir) {
  const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const steps = JSON.parse(rd('steps.json'));
  const out = { status: steps.status, notes: steps.notes, sessionFiles: {}, dialogs: [], lineTypesWithoutItems: {}, blockTypesWithoutItems: {}, toolCategoryMismatches: [], invalidItems: [], subagent: [], workingNotParsed: [], onScreenNoItem: {} };
  const m = createClaudeMapper({ includeSidechain: false });
  const lines = fs.existsSync(path.join(dir, 'transcript.jsonl')) ? rd('transcript.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const st = m.newState(); const items = [];
  const typeSeen = {}; const typeItems = {}; const blkSeen = {}; const blkItems = {};
  for (const o of lines) {
    const got = m.mapLine(o, st); items.push(...got);
    const t = o.isSidechain ? 'sidechain' : o.type || 'unknown';
    bump(typeSeen, t); if (got.length) bump(typeItems, t);
    if (!got.length) for (const k of lineKinds(o)) bump(blkSeen, `${t}/${k}`);
    else for (const k of lineKinds(o)) bump(blkItems, `${t}/${k}`);
  }
  for (const [t, n] of Object.entries(typeSeen)) if (!typeItems[t]) out.lineTypesWithoutItems[t] = n;
  for (const [k, n] of Object.entries(blkSeen)) out.blockTypesWithoutItems[k] = n;
  const byId = new Map(items.map((i) => [i.id, i])); const final = [...byId.values()];
  out.itemCounts = {}; for (const i of final) bump(out.itemCounts, i.kind);
  for (const i of items) { const p = itemProblem(i); if (p) out.invalidItems.push({ id: i.id, kind: i.kind, problem: p }); }
  for (const o of lines) for (const b of o.message?.content || []) if (b?.type === 'tool_use') {
    const it = byId.get(`tool:${b.id}`) || byId.get(`sub:${b.id}`); const want = EXPECT_CAT(b.name);
    if (!it) { if (want !== 'todo') out.toolCategoryMismatches.push({ tool: b.name, expected: want ?? '?', produced: 'no item' }); continue; }
    const got = it.kind === 'subagent' ? 'subagent' : it.category;
    if (want && got !== want) out.toolCategoryMismatches.push({ tool: b.name, expected: want, produced: got });
    if (!want) out.toolCategoryMismatches.push({ tool: b.name, expected: 'unknown to conformance', produced: got });
  }
  const files = fs.existsSync(path.join(dir, 'subagents')) ? fs.readdirSync(path.join(dir, 'subagents')) : [];
  out.sessionFiles = { screens: fs.readdirSync(path.join(dir, 'screens')).filter((f) => f.endsWith('.txt')).length, subagentFiles: files };
  for (const it of final.filter((i) => i.kind === 'subagent')) {
    const hit = files.find((f) => it.childSessionId && f.includes(it.childSessionId));
    out.subagent.push({ callId: it.callId, childSessionId: it.childSessionId ?? null, agentId: it.agentId ?? null, childFileFound: !!hit, childFile: hit ?? null });
  }
  if (!out.subagent.length) for (const f of files.filter((f) => /^agent-/.test(f))) out.subagent.push({ callId: null, childFileFound: true, childFile: f, note: 'child file saved but no subagent item produced' });

  const names = fs.readdirSync(path.join(dir, 'screens')).filter((f) => f.endsWith('.txt')).sort();
  const text = final.map((i) => `${i.text ?? ''} ${i.title ?? ''} ${i.prompt ?? ''}`).join('\n');
  for (const f of names) {
    const scr = rd(`screens/${f}`).replace(ESC, '');
    const p = m.parsePrompt(scr);
    const cue = DIALOG_CUE.test(scr.split('\n').filter((l) => l.trim()).slice(-25).join('\n')) && /^\s*❯\s*\S/m.test(scr);
    if (p) {
      const prob = promptProblem(p);
      const marked = scr.split('\n').map((l) => /^\s*❯\s*(?:\d+\.\s+)?(\S.*)$/.exec(l)?.[1]?.trim()).filter(Boolean);
      const issues = [];
      if (prob) issues.push(prob);
      if (!scr.includes(p.title)) issues.push('title not on screen');
      if (!p.options.some((o) => marked.includes(o.label))) issues.push('no option equals the marked row'); else if (!marked.includes(p.options[p.selected]?.label)) issues.push('selected is not the marked row');
      if (issues.length) out.dialogs.push({ screen: f, recognised: true, issues, title: p.title, options: p.options.map((o) => o.label) });
    } else if (cue) out.dialogs.push({ screen: f, recognised: false, issues: ['dialog cue and marker on screen, parsePrompt returned null'] });
    if (SPIN_CUE.test(scr.split('\n').filter((l) => l.trim()).slice(-12).join('\n')) && !parseStatus(scr)) out.workingNotParsed.push({ screen: f, line: scr.split('\n').filter((l) => SPIN_CUE.test(l))[0]?.trim() });
  }
  // last non-trust screen: what is on screen but nowhere in items
  const last = rd(`screens/${names.at(-1)}`).replace(ESC, '');
  const all = names.map((f) => rd(`screens/${f}`).replace(ESC, '')).join('\n');
  const feat = {
    summaryLine: [/^\s*»\s+(.+)$/m, (s) => text.includes(s.slice(0, 20))],
    turnTiming: [/(?:Churned|Cooked|Brewed|Worked|Baked|Sautéed|Cogitated)\s+for\s+[\dhms ]+/i, () => final.some((i) => i.kind === 'usage' && i.durationMs != null) || /Churned|Cooked/.test(text)],
    tokenCounter: [/[↓↑]\s*[\d.,]+\s*[km]?\s*tokens/i, () => final.some((i) => i.kind === 'usage')],
    modeIndicator: [/(manual|accept edits|plan|auto|bypass permissions) mode on/i, () => final.some((i) => i.kind === 'notice' && i.code === 'mode_changed')],
    queuedMessage: [/queued|Press up to edit queued/i, () => false],
    backgroundTask: [/background (task|shell)|running in the background|⏵⏵|\d+ shells?/i, () => false],
  };
  for (const [k, [re, has]] of Object.entries(feat)) { const mm = re.exec(all); if (mm && !has(mm[1] ?? mm[0])) out.onScreenNoItem[k] = (mm[0] || '').slice(0, 80); }
  void last;
  return out;
}

const result = {};
for (const d of fs.readdirSync(root).sort()) {
  const dir = path.join(root, d);
  if (!fs.statSync(dir).isDirectory() || !fs.existsSync(path.join(dir, 'steps.json'))) continue;
  try { result[d] = scenario(dir); } catch (e) { result[d] = { error: String(e.message || e) }; }
}
fs.writeFileSync(path.join(root, 'CONFORMANCE.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(`wrote CONFORMANCE.json for ${Object.keys(result).length} scenarios`);
