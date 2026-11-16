// Rewrites owner identifiers in tui-real captures. Usage: SCRUB_USER=<login> SCRUB_NAMES=a,b node scrub-privacy.mjs <dir>...
import fs from 'node:fs';
import path from 'node:path';
const dirs = process.argv.slice(2);
const U = process.env.SCRUB_USER, N = (process.env.SCRUB_NAMES || '').split(',').filter(Boolean);
const rules = [[new RegExp('/Users/' + U, 'gi'), '~'], [new RegExp([U, ...N].sort((a, b) => b.length - a.length).join('|'), 'gi'), 'user']];
function scrubLine(line) {
  let out = line;
  for (const [re, rep] of rules) {
    out = out.replace(re, (m, off, s) => {
      const diff = m.length - rep.length;
      return rep + '\u0000'.repeat(Math.max(diff, 0));
    });
  }
  // absorb the shrink from the next run of 2+ spaces so padded rows keep their width
  return out.replace(/(\u0000+)([^\u0000]*?)( {2,})/g, (_, nul, mid, sp) => {
    const take = Math.min(nul.length, sp.length - 1);
    return mid + sp.slice(0, sp.length - take) ;
  }).replace(/\u0000/g, '');
}
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  const p = path.join(d, f);
  const t = fs.readFileSync(p, 'utf8');
  const n = t.split('\n').map(scrubLine).join('\n');
  if (n !== t) fs.writeFileSync(p, n);
}
