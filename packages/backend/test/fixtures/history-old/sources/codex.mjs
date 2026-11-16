import { builtinAgents } from '../../../../src/sessions/adapters.mjs';
import { jsonlSource, ts } from '../lines.mjs';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
export default jsonlSource({
  id: 'codex', label: 'Codex', root: ['.codex', 'sessions'], match: (n) => n.startsWith('rollout-') && n.endsWith('.jsonl'), agent: builtinAgents.codex,
  // session_meta.payload.source: {subagent} -> subagent, 'exec' -> headless, 'cli'/'vscode' -> interactive; else unknown.
  kind: (recs) => {
    const pl = recs.find((r) => r.type === 'session_meta')?.payload, src = pl?.source;
    if (src && typeof src === 'object' && 'subagent' in src) return 'subagent';
    if (src === 'exec' || pl?.originator === 'codex_exec') return 'headless';
    return src === 'cli' || src === 'vscode' ? 'interactive' : 'unknown';
  },
  meta: (recs, p) => { const m = recs.find((r) => r.type === 'session_meta')?.payload; return { sessionId: p.match(UUID)?.[0] ?? m?.id ?? p, cwd: m?.cwd, startedAt: ts(m?.timestamp) }; },
});
