// opencode keeps sessions in SQLite: <home>/.local/share/opencode/opencode.db, tables session / message / part
// (message.data = JSON with `role`; part.data = JSON with `type` 'text' | 'tool' ...). Opened read-only via node:sqlite.
import path from 'node:path';
import { oneLine } from '../lines.mjs';

const dbPath = (home) => path.join(home, '.local', 'share', 'opencode', 'opencode.db');
async function open(file) {
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(file, { readOnly: true });
}
const j = (s) => { try { return JSON.parse(s); } catch { return {}; } };

export default {
  id: 'opencode', label: 'opencode',
  detect: ({ home, fs }) => fs.existsSync(dbPath(home)),
  async *list({ home, known }) {
    const file = dbPath(home), db = await open(file);
    try {
      const rows = db.prepare('SELECT s.id, s.directory, s.time_created, s.time_updated, (SELECT count(*) FROM message m WHERE m.session_id = s.id) AS n FROM session s').all();
      const firstUser = db.prepare(`SELECT p.data FROM message m JOIN part p ON p.message_id = m.id
        WHERE m.session_id = ? AND json_extract(m.data, '$.role') = 'user' AND json_extract(p.data, '$.type') = 'text' ORDER BY m.time_created, m.id, p.id LIMIT 1`);
      for (const r of rows) {
        const p = `${file}#${r.id}`, sig = `${r.time_updated}:${r.n}`, k = known?.(p);
        if (k && k.sig === sig) { yield k; continue; }
        const fu = oneLine(j(firstUser.get(r.id)?.data).text, 300);
        yield { source: 'opencode', sessionId: r.id, path: p, cwd: r.directory ?? null, startedAt: r.time_created, updatedAt: r.time_updated,
          title: fu.slice(0, 80) || '(untitled)', firstUser: fu, messageCount: r.n, sig };
      }
    } finally { db.close(); }
  },
  async read(p) {
    const [file, sid] = [p.slice(0, p.lastIndexOf('#')), p.slice(p.lastIndexOf('#') + 1)];
    const db = await open(file);
    try {
      const out = [];
      const parts = db.prepare('SELECT id, data FROM part WHERE message_id = ? ORDER BY id');
      for (const m of db.prepare('SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created, id').all(sid)) {
        const role = j(m.data).role === 'user' ? 'user' : 'assistant';
        for (const x of parts.all(m.id)) {
          const d = j(x.data), id = `${m.id}:${x.id}`;
          if (d.type === 'text' && d.text) out.push({ id, role, text: d.text, ts: m.time_created });
          else if (d.type === 'tool') out.push({ id, role: 'tool', text: '', tool: { name: d.tool ?? '', input: d.state?.input, output: typeof d.state?.output === 'string' ? d.state.output : undefined }, ts: m.time_created });
        }
      }
      return out;
    } finally { db.close(); }
  },
};
