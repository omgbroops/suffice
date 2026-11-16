// Removes personal data from recorded screens and transcripts. Pure: one scrubber per scenario so uuid placeholders stay consistent.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PRIVATE = /theme|plugin|CLAUDE\.md|Abhay|neon|MEMORY\.md|\.claude\/(?!projects)/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createScrubber({ cwd = '', user = '' } = {}) {
  const uuids = new Map();
  const real = cwd ? [cwd, cwd.replace(/^\/private/, '')] : [];
  const slugs = cwd ? [cwd.replace(/[^a-zA-Z0-9]/g, '-')] : [];
  const base = cwd ? cwd.split('/').pop() : '';
  const names = ['abhayg', user].filter(Boolean);
  const text = (s) => {
    for (const p of real) if (p) s = s.split(p).join('/tmp/PROJECT');
    for (const p of slugs) if (p) s = s.split(p).join('-tmp-PROJECT');
    if (base) s = s.split(base).join('PROJECT');
    s = s.replace(/[\w.*+-]*\*+[\w.*+-]*@[\w.*-]+/g, 'user@example.com'); // masked form g***@gmail.com
    s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'user@example.com');
    s = s.replace(/\/Users\/[^/\s"'\\]+/g, '/Users/USER').replace(/-Users-[A-Za-z0-9]+(?=-)/g, '-Users-USER');
    s = s.replace(/claude-\d+/g, 'claude-UID');
    for (const n of names) s = s.replace(new RegExp(esc(n), 'gi'), 'USER');
    s = s.replace(/Abhay\w*/g, 'USER');
    s = s.replace(UUID, (u) => { const k = u.toLowerCase(); if (!uuids.has(k)) uuids.set(k, `00000000-0000-4000-8000-${String(uuids.size + 1).padStart(12, '0')}`); return uuids.get(k); });
    return s;
  };
  // Screen line rules run on plain text: theme/plugin lines are blanked, usage numbers zeroed, account values redacted.
  const line = (l) => {
    if (/theme|plugin/i.test(l)) return '';
    if (/[●○]{4,}/.test(l)) l = l.replace(/[●○]+/g, (m) => '○'.repeat(m.length)).replace(/\d/g, '0');
    else if (/\d+%|\busage\b|\blimit|\bresets?\b/i.test(l)) l = l.replace(/\d/g, '0');
    l = l.replace(/^(\s*(?:Email|Organization|Org|Account|Login method|Plan)\s*:?\s*).+$/i, '$1REDACTED');
    return text(l);
  };
  return {
    text,
    screen: (s) => s.split('\n').map((l) => line(l.replace(ANSI, ''))).join('\n'),
    // ansi: lines the rules do not touch keep their colors; changed lines fall back to plain text
    ansi: (s) => s.split('\n').map((l) => { const p = l.replace(ANSI, ''); const q = line(p); return q === p ? l : q; }).join('\n'),
    // transcripts: leaves that quote the owner's setup (theme, plugins, CLAUDE.md, memory) are replaced whole
    jsonl: (s) => s.split('\n').map((l) => {
      if (!l) return l;
      try { const walk = (v) => (typeof v === 'string' ? (PRIVATE.test(v) || text(v).replace(/user@example\.com/g, '').includes('@') ? '[scrubbed]' : text(v)) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [text(k), walk(x)])) : v); return JSON.stringify(walk(JSON.parse(l))); } catch { return text(l); }
    }).join('\n'),
  };
}
export const stripAnsi = (s) => s.replace(ANSI, '');
