import { readFileSync, existsSync } from 'node:fs';
const arms = { haiku:'reports/v6/r27-haiku-alone.jsonl', sonnet:'reports/v6/r27-sonnet-alone.jsonl', opus:'reports/v6/r27-opus-alone-fair.jsonl', v5b:'reports/v6/r27-v5b.jsonl', v6:'reports/v7/r27-v6-fixed-merged.jsonl', v7:'reports/v7/r27-v7-merged.jsonl', v7ag:'reports/v7/r27-v7agree-merged.jsonl', v7in:'reports/v7/r27-v7indep-merged.jsonl', v7res:'reports/v7/r27-v7rescue-merged.jsonl', self:'reports/v10/r27-selffix.jsonl', v8:['reports/v11/ladder-fails.jsonl','reports/v11/ladder2-fails.jsonl','reports/v11/ladder3-rest.jsonl','reports/v11/ladder4-rest.jsonl'] };
const g = {};
for (const [a, f] of Object.entries(arms)) for (const p of [].concat(f)) { if (!existsSync(p)) continue; for (const l of readFileSync(p,'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); const t = r.task.replace("/", "_"); g[t] ??= {}; g[t][a] = (g[t][a] === 1) || r.finalPass === true ? 1 : 0; } }
const A = Object.keys(arms);
console.log('| task | ' + A.join(' | ') + ' | any |'); console.log('|' + '---|'.repeat(A.length + 2));
const tot = Object.fromEntries(A.map(a => [a, 0])); let any = 0;
for (const t of Object.keys(g).sort()) { const row = A.map(a => g[t][a] === undefined ? '·' : g[t][a] ? 'P' : '-'); const y = row.includes('P'); any += y; A.forEach(a => tot[a] += g[t][a] || 0); console.log(`| ${t} | ${row.join(' | ')} | ${y ? 'P' : '-'} |`); }
console.log('| **total** | ' + A.map(a => tot[a]).join(' | ') + ` | ${any} |`);
