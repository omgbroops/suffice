// Free metamorphic gate for ptr-425, derived from the prompt sentence "a parameter should not start with the separator that precedes it".
// Usage: node scripts/property-gate.mjs <workspaceDir...>  -> per dir: acceptance, property violations over an enumerated probe grid.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runNodeTests } from '../src/workspace.mjs';
// Tried and dropped: also rejecting captures ENDING with the separator -> rejects the reference itself (4 violations).
const atoms = ['/a', '/:a', '/*', ':a', '-:b', '-:c', '*', '/x.y', '?', '+', '.:d', '_:e'];
const pats = new Set(process.env.LEAKFREE === '1' ? ['/:a-:b-:c'] : ['/:a-:b-:c', '/:a-:b', '/a*-:b-:c', '/*-:a-:b']); // LEAKFREE=1 drops the hidden test's patterns/strings (refuter-10)
for (const x of atoms) for (const y of atoms) for (const z of atoms) pats.add('/' + x.replace(/^\//, '') + y + z);
const strs = process.env.LEAKFREE === '1' ? ['/1-2-3--4', '/1--2', '/x.y-1-2--3', '/1.-2', '/1_-2'] : ['/1-2-3--4', '/ab-1-2--3', '/1--2', '/x.y-1-2--3', '/a/b-1-2--3', '/1.-2', '/1_-2', '/q.-1-2'];
const valid = [['/:a-:b-:c', '/1-2-3'], ['/:a', '/x'], ['/:a/:b', '/x/y'], ['/:a.:b', '/x.y']];
export function violations(ws) {
  const rq = createRequire(resolve(ws, 'src/package.json')); delete rq.cache[rq.resolve('./index.js')]; // repair loop re-checks the same path: a stale cache hid fixes (found iter 11)
  const f = rq('./index.js'), bad = [];
  for (const p of pats) { let keys = []; try { const re = f(p, keys); for (const s of strs) { const m = re.exec(s); if (m) keys.forEach((k, i) => { const sep = p.match(new RegExp(`([^\\w/]):${k.name}`))?.[1], v = m[i + 1]; if (sep && (v?.startsWith(sep))) bad.push(`${p} ~ ${s}`); }); } } catch {} } // grid crashes are NOT violations: the reference itself throws on nonsense grid patterns (e.g. /a?+)
  for (const [p, s] of valid) { try { if (!f(p, []).exec(s)) bad.push(`${p} ~ ${s} MUST-MATCH`); } catch (e) { bad.push(`${p} ~ CRASH ${e.message}`); } } // crash or lost valid match = reject (refuter-10)
  return bad;
}
if (import.meta.url === `file://${process.argv[1]}`) for (const ws of process.argv.slice(2)) {
  const acc = (await runNodeTests(ws, resolve(import.meta.dirname, '../benchmarks/real/path-to-regexp-425.test.mjs'))).status === 'passed', v = violations(ws);
  console.log(JSON.stringify({ ws: ws.split('/').pop(), acceptance: acc, violations: v.length, first: v[0] }));
}
