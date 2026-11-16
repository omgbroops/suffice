import path from 'node:path';
import { builtinAgents } from '../../../../src/sessions/adapters.mjs';
import { jsonlSource, ts } from '../lines.mjs';

export default jsonlSource({
  id: 'claude-code', label: 'Claude Code', root: ['.claude', 'projects'], match: (n) => n.endsWith('.jsonl'), agent: builtinAgents.claude,
  // Markers (field names only): path under subagents/ or isSidechain -> subagent; promptSource 'typed' or origin.kind 'human' or entrypoint 'cli' -> interactive;
  // entrypoint 'sdk*' -> headless; anything else (e.g. claude-desktop with no human marker) -> unknown.
  kind: (recs, p) => {
    if (p.includes(`${path.sep}subagents${path.sep}`) || recs.some((r) => r.isSidechain === true)) return 'subagent';
    const ep = recs.find((r) => typeof r.entrypoint === 'string')?.entrypoint;
    if (ep === 'cli' || recs.some((r) => r.promptSource === 'typed' || r.origin?.kind === 'human')) return 'interactive';
    return ep?.startsWith('sdk') ? 'headless' : 'unknown';
  },
  meta: (recs, p) => ({ sessionId: path.basename(p, '.jsonl'), cwd: recs.find((r) => typeof r.cwd === 'string')?.cwd, startedAt: ts(recs.find((r) => typeof r.timestamp === 'string')?.timestamp) }),
});
