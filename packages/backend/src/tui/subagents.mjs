// Live subagent tracker. A Claude Code subagent (Task/Agent tool) writes its own transcript:
//   <dir>/<sessionId>.jsonl                                  parent (has the tool_use + result)
//   <dir>/<sessionId>/subagents/agent-<id>.jsonl             child lines (isSidechain true, agentId)
//   <dir>/<sessionId>/subagents/agent-<id>.meta.json         { agentType, description, toolUseId, parentAgentId? }
// meta.toolUseId equals the parent's tool_use id, so a child links before the parent has a result. Nested children sit in the same flat dir.
import path from 'node:path';
import { createClaudeMapper } from './claude.mjs';

const MAX_DEPTH = 8;
const str = (v) => (typeof v === 'string' ? v : '');
const first = (t) => String(t ?? '').trim().split('\n')[0].slice(0, 120);

const NOTE = /<task-notification>([\s\S]*?)<\/task-notification>/;
const tag = (t, n) => (new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(t)?.[1] ?? '').trim();
const noteStatus = (s) => (/^(completed|done|success)/i.test(s) ? 'ok' : /^(killed|cancel|stopped)/i.test(s) ? 'stopped' : /^(failed|error)/i.test(s) ? 'error' : 'running');
const blank = () => ({ offset: 0, rest: Buffer.alloc(0), state: null, order: [], byId: new Map(), lineNo: 0 });

export function createSubagentTracker({ fs, mapper = createClaudeMapper({ includeSidechain: true }) }) {
  // open: tail one session (parent + children). watch:false = read what is on disk once (history of a finished session).
  function open(parentPath, { watch = true, onUpdate = () => {} } = {}) {
    const dir = path.dirname(parentPath);
    const sid = path.basename(parentPath, '.jsonl');
    const subDir = path.join(dir, sid, 'subagents');
    const tails = new Map(); // file -> { offset, rest, state, order, byId, lineNo }
    const metas = new Map(); // meta file name -> parsed meta
    const fileIds = new Set(); // agent ids that have a transcript file
    const skips = new Set(); // keys of lines/files that could not be used
    const badMeta = new Set();
    let dirty = true; let stopped = false; let watcher = null; let settle = null;

    const fresh = (t) => Object.assign(t, blank(), { state: mapper.newState() });
    const tailOf = (file) => { if (!tails.has(file)) tails.set(file, fresh({})); return tails.get(file); };
    function readFrom(file) {
      const t = tailOf(file);
      let size; try { size = fs.statSync(file).size; } catch { return false; }
      if (size < t.offset) fresh(t);
      if (size === t.offset) return false;
      const buf = Buffer.alloc(size - t.offset);
      let n = 0;
      const fd = fs.openSync(file, 'r');
      try { n = fs.readSync(fd, buf, 0, buf.length, t.offset); } finally { fs.closeSync(fd); }
      t.offset += n;
      const all = Buffer.concat([t.rest, buf.subarray(0, n)]);
      const cut = all.lastIndexOf(10) + 1; // only whole lines; a half-written line waits for the next read
      t.rest = all.subarray(cut);
      for (const l of all.subarray(0, cut).toString('utf8').split('\n')) {
        t.lineNo++;
        if (!l.trim()) continue;
        let o; try { o = JSON.parse(l); } catch { skips.add(`${file}:${t.lineNo}`); continue; }
        let items; try { items = mapper.mapLine(o, t.state) || []; } catch { skips.add(`${file}:${t.lineNo}`); continue; }
        for (const it of items) { if (!t.byId.has(it.id)) t.order.push(it.id); t.byId.set(it.id, it); }
      }
      return n > 0;
    }
    function readMetas() {
      let names; try { names = fs.readdirSync(subDir); } catch { return false; }
      let got = false;
      for (const f of names) {
        if (/^agent-.+\.jsonl$/.test(f)) fileIds.add(f.slice(6, -6));
        if (!f.endsWith('.meta.json') || metas.has(f)) continue;
        try { metas.set(f, { ...JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf8')), agentId: f.slice(6, -10) }); badMeta.delete(f); got = true; } catch { badMeta.add(f); /* half-written: retried on the next event */ }
      }
      return got;
    }
    const itemsOf = (t) => t.order.map((id) => t.byId.get(id));
    const fileOf = (id) => path.join(subDir, `agent-${id}.jsonl`);
    function refresh() {
      if (stopped) return;
      let any = readFrom(parentPath);
      if (readMetas()) any = true;
      const ids = new Set([...metas.values()].map((m) => m.agentId)); for (const i of fileIds) ids.add(i);
      for (let grew = true; grew;) { // nested spawns name their agentId inside a child file: follow until nothing new
        grew = false;
        for (const t of tails.values()) for (const i of itemsOf(t)) if (i.kind === 'subagent' && i.agentId && !ids.has(i.agentId)) { ids.add(i.agentId); grew = true; }
        if (grew) for (const id of ids) if (!tails.has(fileOf(id))) tailOf(fileOf(id));
      }
      for (const id of ids) if (readFrom(fileOf(id))) any = true;
      if (any) { dirty = true; if (watch) { clearTimeout(settle); settle = setTimeout(refresh, 40); settle.unref?.(); } } // watch events can coalesce: re-read once, ends at the first empty read
      emit();
    }
    // per-call lookups rebuilt for each snapshot: who spawned a call, task notices, metas by tool call
    function index() {
      const byTool = new Map(); const byAgent = new Map();
      for (const m of metas.values()) { byAgent.set(m.agentId, m); if (m?.toolUseId) byTool.set(m.toolUseId, m); }
      const spawn = new Map(); const notes = new Map();
      for (const [file, t] of tails) {
        const owner = file === parentPath ? null : path.basename(file).slice(6, -6);
        for (const i of itemsOf(t)) if (i.kind === 'subagent') spawn.set(i.callId, { item: i, owner, state: t.state });
        for (const k of Object.values(t.state?.tasks ?? {})) { const n = { status: noteStatus(k.status), summary: k.label === k.id ? '' : k.label, ts: k.ts || 0, result: k.result ?? '', usage: k.usage ?? {} }; for (const key of [k.id, k.toolUseId]) if (key) notes.set(key, n); }
      }
      return { byTool, byAgent, spawn, notes };
    }
    function enrich(it, ix, depth) {
      if (it.kind !== 'subagent') return it;
      const meta = ix.byTool.get(it.callId);
      const agentId = it.agentId ?? meta?.agentId;
      const t = agentId ? tails.get(fileOf(agentId)) : null;
      const kids = t ? itemsOf(t) : [];
      const items = depth >= MAX_DEPTH ? [] : kids.filter((k) => k.kind !== 'usage').map((k) => enrich(k, ix, depth + 1));
      const tools = kids.filter((k) => k.kind === 'tool' || k.kind === 'subagent');
      const last = kids.findLast((k) => k.kind === 'tool' || k.kind === 'subagent' || k.kind === 'assistant');
      const usage = kids.filter((k) => k.kind === 'usage');
      // shortcut: summed per-message input+output tokens double-counts cached context, upgrade when the result's totalTokens is missing often
      const inputTokens = usage.reduce((a, u) => a + u.inputTokens, 0); const outputTokens = usage.reduce((a, u) => a + u.outputTokens, 0);
      const sp = ix.spawn.get(it.callId);
      const input = sp?.state?.calls?.get(it.callId)?.input ?? {}; const tur = sp?.state?.results?.get(it.callId)?.tur ?? {};
      const background = input.run_in_background === true || tur.isAsync === true;
      const note = ix.notes.get(agentId) ?? ix.notes.get(it.callId) ?? null;
      let status = it.status;
      if (background && status === 'ok') status = note ? note.status : 'running'; // the launch result returns at once; the notice is the real end
      if (meta?.stoppedByUser === true && !note) status = 'stopped'; // Esc by the user; the meta file records it
      const done = status !== 'running';
      const lastTs = kids.at(-1)?.ts;
      const startedAt = it.ts;
      const endedAt = !done ? 0 : background && note ? (note.usage.durationMs != null ? Math.max(note.ts, startedAt + note.usage.durationMs) : note.ts) : typeof it.totalDurationMs === 'number' ? it.ts + it.totalDurationMs : lastTs ?? it.ts;
      const out = { ...it, status, type: it.name, description: it.description ?? meta?.description ?? '', startedAt, endedAt, durationMs: done ? Math.max(0, endedAt - startedAt) : 0,
        toolUses: note?.usage.toolUses ?? it.totalToolUseCount ?? tools.length, tokens: note?.usage.tokens ?? it.totalTokens ?? (inputTokens + outputTokens), result: note?.result ?? '', inputTokens, outputTokens,
        model: usage.findLast((u) => u.model)?.model ?? (typeof meta?.model === 'string' ? meta.model : ''),
        background, notice: note, group: str(meta?.group) || str(input.group) || str(meta?.workflow) || '', phase: str(meta?.phase) || str(input.phase) || '',
        lastAction: last?.kind === 'assistant' ? first(last.text) : last ? last.title ?? last.name : '', items };
      if (agentId) out.agentId = agentId;
      if (t?.offset) out.childTranscriptPath = fileOf(agentId);
      return out;
    }
    function snapshot() {
      const ix = index();
      return itemsOf(tailOf(parentPath)).filter((i) => i.kind === 'subagent').map((i) => enrich(i, ix, 0));
    }
    // flat list of every agent in the session, any depth, with parent link and depth
    function agents() {
      const ix = index();
      const ids = new Set([...ix.byAgent.keys(), ...fileIds]);
      for (const { item } of ix.spawn.values()) if (item.agentId) ids.add(item.agentId);
      const spawnOf = new Map(); for (const sp of ix.spawn.values()) if (sp.item.agentId) spawnOf.set(sp.item.agentId, sp);
      const rec = new Map();
      for (const id of ids) {
        const meta = ix.byAgent.get(id);
        const callId = meta?.toolUseId ?? spawnOf.get(id)?.item.callId ?? id;
        const sp = ix.spawn.get(callId);
        const base = sp?.item ?? { id: `sub:${callId}`, ts: tails.get(fileOf(id))?.order.length ? itemsOf(tails.get(fileOf(id)))[0].ts : 0, kind: 'subagent', callId, name: str(meta?.agentType) || 'agent', prompt: '', status: 'running' };
        const e = enrich({ ...base, agentId: id }, ix, 0);
        let parentId = str(meta?.parentAgentId) || sp?.owner || null;
        if (parentId === id || (parentId && !ids.has(parentId))) parentId = null;
        rec.set(id, { ...e, agentId: id, parentId, orphan: !sp && !parentId, parentCallId: callId });
      }
      for (const r of rec.values()) { // depth = hops to the root; a cycle stops at the first repeat
        const seen = new Set([r.agentId]); let d = 1; let p = r.parentId; r.cycle = false;
        while (p) { if (seen.has(p)) { r.cycle = true; break; } seen.add(p); d++; p = rec.get(p)?.parentId ?? null; }
        r.depth = d;
        if (r.cycle) r.parentId = null; // break the loop for consumers
      }
      return [...rec.values()].sort((a, b) => a.startedAt - b.startedAt || (a.agentId < b.agentId ? -1 : 1));
    }
    function groups() {
      const out = new Map();
      for (const a of agents()) {
        if (!a.group) continue;
        const g = out.get(a.group) ?? { group: a.group, total: 0, running: 0, ok: 0, error: 0, stopped: 0, phases: [], agentIds: [] };
        out.set(a.group, g);
        let ph = g.phases.find((p) => p.phase === a.phase);
        if (!ph) g.phases.push(ph = { phase: a.phase, total: 0, running: 0, ok: 0, error: 0, stopped: 0 });
        for (const o of [g, ph]) { o.total++; o[a.status]++; }
        g.agentIds.push(a.agentId);
      }
      return [...out.values()];
    }
    function transcript(id) {
      const t = tails.get(fileOf(id)); if (!t) return [];
      const ix = index();
      return itemsOf(t).map((i) => enrich(i, ix, 1));
    }
    // a parent-screen prompt titled "<Tool> · from the <name> agent": the name is the agent type (or description) of the running agent
    function attributePrompt(prompt) {
      const text = `${prompt?.title ?? ''}\n${prompt?.body ?? ''}`;
      const name = /from the (.+?) agent/i.exec(prompt?.title ?? '')?.[1]?.trim().toLowerCase();
      const run = agents().filter((a) => a.status === 'running');
      let cand = run.filter((a) => text.includes(a.agentId));
      if (!cand.length && name) {
        cand = run.filter((a) => a.type?.toLowerCase() === name || a.description?.toLowerCase().includes(name));
        if (cand.length > 1) { // same type twice: the one whose running tool the prompt names
          const by = cand.filter((a) => { const k = itemsOf(tails.get(fileOf(a.agentId)) ?? blank()).findLast((x) => x.kind === 'tool' && x.status === 'running'); return k && (text.includes(k.title) || (k.name && text.includes(k.name))); });
          if (by.length) cand = by;
        }
      }
      const hit = cand.length === 1 ? cand[0] : null;
      return { ...prompt, subagentId: hit?.agentId ?? null, parentCallId: hit?.parentCallId ?? null, subagentType: hit?.type ?? null };
    }
    function skipped() {
      let n = skips.size + badMeta.size;
      for (const id of fileIds) {
        const t = tails.get(fileOf(id));
        if (!t || (t.offset === 0 && t.rest.length === 0)) n++; // empty file
        if (!metas.has(`agent-${id}.meta.json`) && !badMeta.has(`agent-${id}.meta.json`)) n++; // no meta file
      }
      if (!watch) for (const t of tails.values()) if (t.rest.length) n++; // a last line cut short, only final once nothing more is coming
      return n;
    }
    function emit() {
      if (!dirty) return;
      dirty = false;
      try { onUpdate(snapshot()); } catch { /* a bad listener must not stop the tail */ }
    }

    refresh();
    if (watch) {
      // one recursive watch on the project dir (also sees <sid>/subagents appear); other sessions' events are filtered out by name
      try { watcher = fs.watch(dir, { recursive: true }, (_e, f) => { if (!f || String(f).startsWith(sid)) refresh(); }); watcher.on?.('error', () => {}); } catch { /* no dir: the catch-up reads below still run */ }
      // shortcut: FSEvents can drop writes made just after a watch is armed, so two catch-up reads (as in sessions/index.mjs tail), no polling beyond that
      for (const ms of [250, 1000]) { const c = setTimeout(refresh, ms); c.unref?.(); }
    }
    return { refresh, subagents: snapshot, agents, groups, transcript, attributePrompt, skipped,
      close: () => { stopped = true; clearTimeout(settle); try { watcher?.close(); } catch { /* closed */ } } };
  }
  const attach = (parentPath, onUpdate) => open(parentPath, { onUpdate }).close;
  // history: a finished session read once from disk
  function load(parentPath) {
    const o = open(parentPath, { watch: false });
    const r = { subagents: o.subagents(), agents: o.agents(), groups: o.groups(), skipped: o.skipped(), transcript: o.transcript };
    o.close();
    return r;
  }
  return { attach, open, load };
}
