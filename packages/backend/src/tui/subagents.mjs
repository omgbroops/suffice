// Live subagent tracker. A Claude Code subagent (Task/Agent tool) writes its own transcript:
//   <dir>/<sessionId>.jsonl                                  parent (has the tool_use + result)
//   <dir>/<sessionId>/subagents/agent-<id>.jsonl             child lines (isSidechain true, agentId)
//   <dir>/<sessionId>/subagents/agent-<id>.meta.json         { agentType, description, toolUseId, parentAgentId? }
// meta.toolUseId equals the parent's tool_use id, so a child links before the parent has a result. Nested children sit in the same flat dir.
import path from 'node:path';
import { createClaudeMapper } from './claude.mjs';

const MAX_DEPTH = 8;
const first = (t) => String(t ?? '').trim().split('\n')[0].slice(0, 120);

export function createSubagentTracker({ fs, mapper = createClaudeMapper({ includeSidechain: true }) }) {
  function attach(parentPath, onUpdate) {
    const dir = path.dirname(parentPath);
    const sid = path.basename(parentPath, '.jsonl');
    const subDir = path.join(dir, sid, 'subagents');
    const tails = new Map(); // file -> { offset, rest, state, order, byId }
    const metas = new Map(); // meta file name -> parsed meta
    let dirty = true; let stopped = false; let watcher = null; let settle = null;

    const tailOf = (file) => { if (!tails.has(file)) tails.set(file, { offset: 0, rest: Buffer.alloc(0), state: mapper.newState(), order: [], byId: new Map() }); return tails.get(file); };
    function readFrom(file) {
      const t = tailOf(file);
      let size; try { size = fs.statSync(file).size; } catch { return false; }
      if (size < t.offset) Object.assign(t, { offset: 0, rest: Buffer.alloc(0), state: mapper.newState(), order: [], byId: new Map() });
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
        if (!l.trim()) continue;
        let o; try { o = JSON.parse(l); } catch { continue; }
        let items; try { items = mapper.mapLine(o, t.state) || []; } catch { continue; }
        for (const it of items) { if (!t.byId.has(it.id)) t.order.push(it.id); t.byId.set(it.id, it); }
      }
      return n > 0;
    }
    function readMetas() {
      let names; try { names = fs.readdirSync(subDir); } catch { return false; }
      let got = false;
      for (const f of names) {
        if (!f.endsWith('.meta.json') || metas.has(f)) continue;
        try { metas.set(f, { ...JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf8')), agentId: f.slice(6, -10) }); got = true; } catch { /* half-written: retried on the next event */ }
      }
      return got;
    }
    function refresh() {
      if (stopped) return;
      let any = readFrom(parentPath);
      if (readMetas()) any = true;
      const ids = new Set([...metas.values()].map((m) => m.agentId));
      for (const i of itemsOf(tailOf(parentPath))) if (i.kind === 'subagent' && i.agentId) ids.add(i.agentId);
      for (const id of ids) if (readFrom(path.join(subDir, `agent-${id}.jsonl`))) any = true;
      if (any) { dirty = true; clearTimeout(settle); settle = setTimeout(refresh, 40); settle.unref?.(); } // watch events can coalesce: re-read once, ends at the first empty read
      emit();
    }
    const itemsOf = (t) => t.order.map((id) => t.byId.get(id));
    function enrich(it, byTool, depth) {
      if (it.kind !== 'subagent') return it;
      const meta = byTool.get(it.callId);
      const agentId = it.agentId ?? meta?.agentId;
      const file = agentId ? path.join(subDir, `agent-${agentId}.jsonl`) : null;
      const t = file ? tails.get(file) : null;
      const kids = t ? itemsOf(t) : [];
      const items = depth >= MAX_DEPTH ? [] : kids.filter((k) => k.kind !== 'usage').map((k) => enrich(k, byTool, depth + 1));
      const tools = kids.filter((k) => k.kind === 'tool' || k.kind === 'subagent');
      const last = kids.findLast((k) => k.kind === 'tool' || k.kind === 'subagent' || k.kind === 'assistant');
      // shortcut: summed per-message input+output tokens double-counts cached context, upgrade when the result's totalTokens is missing often
      const sum = kids.filter((k) => k.kind === 'usage').reduce((a, u) => a + u.inputTokens + u.outputTokens, 0);
      const done = it.status !== 'running';
      const lastTs = kids.at(-1)?.ts;
      const out = { ...it, type: it.name, description: it.description ?? meta?.description ?? '', startedAt: it.ts,
        toolUses: it.totalToolUseCount ?? tools.length, tokens: it.totalTokens ?? (sum || undefined),
        lastAction: last?.kind === 'assistant' ? first(last.text) : last ? last.title ?? last.name : '', items };
      if (agentId) out.agentId = agentId;
      if (t?.offset) out.childTranscriptPath = file;
      if (done) out.endedAt = typeof it.totalDurationMs === 'number' ? it.ts + it.totalDurationMs : lastTs ?? it.ts;
      return out;
    }
    function snapshot() {
      const byTool = new Map();
      for (const m of metas.values()) if (m?.toolUseId) byTool.set(m.toolUseId, m);
      return itemsOf(tailOf(parentPath)).filter((i) => i.kind === 'subagent').map((i) => enrich(i, byTool, 0));
    }
    function emit() {
      if (!dirty) return;
      dirty = false;
      const list = snapshot();
      try { onUpdate(list); } catch { /* a bad listener must not stop the tail */ }
    }

    refresh();
    // one recursive watch on the project dir (also sees <sid>/subagents appear); other sessions' events are filtered out by name
    try { watcher = fs.watch(dir, { recursive: true }, (_e, f) => { if (!f || String(f).startsWith(sid)) refresh(); }); watcher.on?.('error', () => {}); } catch { /* no dir: the catch-up reads below still run */ }
    // shortcut: FSEvents can drop writes made just after a watch is armed, so two catch-up reads (as in sessions/index.mjs tail), no polling beyond that
    for (const ms of [250, 1000]) { const c = setTimeout(refresh, ms); c.unref?.(); }
    return () => { stopped = true; clearTimeout(settle); try { watcher?.close(); } catch { /* closed */ } };
  }
  return { attach };
}
