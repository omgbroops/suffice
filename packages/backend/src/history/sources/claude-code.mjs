import path from 'node:path';
import { builtinAgents } from '../../sessions/adapters.mjs';
import { jsonlSource, ts } from '../lines.mjs';

export default jsonlSource({
  id: 'claude-code', label: 'Claude Code', root: ['.claude', 'projects'], match: (n) => n.endsWith('.jsonl'), agent: builtinAgents.claude,
  meta: (recs, p) => ({ sessionId: path.basename(p, '.jsonl'), cwd: recs.find((r) => typeof r.cwd === 'string')?.cwd, startedAt: ts(recs.find((r) => typeof r.timestamp === 'string')?.timestamp) }),
});
