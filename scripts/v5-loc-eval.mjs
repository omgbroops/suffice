// v5 localization eval: file recall@k and excerpt-bundle tokens vs gold files. Zero model calls.
// Usage: nice -n 19 node scripts/v5-loc-eval.mjs [--out reports/v5/loc-eval.md]
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, cp, rm, mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, locate, snippet } from '../src/v5-index.mjs';
import { prepWorkspace } from '../src/v4-polyglot.mjs';
import { patchFiles } from '../src/v4-swebpro.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLY = join(homedir(), 'bench-repos', 'polyglot-benchmark');
const SWE_CACHE = join(homedir(), '.cache', 'v4-swebpro');
const V5_CACHE = join(homedir(), '.cache', 'v5-loc');
const KS = [1, 3, 5, 10];
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : join(ROOT, 'reports', 'v5', 'loc-eval.md');

const readJson = async f => JSON.parse(await readFile(f, 'utf8'));
const tokens = s => Math.ceil(s.length / 4);

// Excerpt bundle for the top-5 files: one snippet at the top symbol, or the file head when no symbol matched.
function bundle(repoDir, files) {
  return files.slice(0, 5).map(f => {
    const sym = f.symbols[0];
    return snippet(join(repoDir, f.path), sym?.line, 15);
  }).join('\n----\n');
}

// Scores one task. Returns recall@k (fraction of gold files in top k), hit@k (any gold in top k), bundle tokens.
function score(files, gold) {
  const rec = {};
  const hit = {};
  for (const k of KS) {
    const top = new Set(files.slice(0, k).map(f => f.path));
    const found = gold.filter(g => top.has(g)).length;
    rec[k] = found / gold.length;
    hit[k] = found > 0 ? 1 : 0;
  }
  return { rec, hit };
}

// Polyglot: agent view = stub workspace (hidden tests removed). Issue = instructions. Gold = .meta solution files.
async function polyTasks() {
  const seen = new Map();
  for (const m of ['config/bench-manifest.polyglot27.json', 'config/bench-manifest.polyglot.json']) {
    for (const t of await readJson(join(ROOT, m))) if (!seen.has(t.taskId)) seen.set(t.taskId, t);
  }
  return [...seen.values()];
}

async function evalPoly() {
  const rows = [];
  for (const task of await polyTasks()) {
    const src = join(POLY, task.lang, 'exercises', 'practice', task.taskId.split('/')[1]);
    const cfg = await readJson(join(src, '.meta', 'config.json'));
    const gold = cfg.files.solution;
    const docs = ['instructions.md', 'instructions.append.md'].map(f => join(src, '.docs', f)).filter(existsSync);
    const issue = (await Promise.all(docs.map(f => readFile(f, 'utf8')))).join('\n');
    const prep = await prepWorkspace(task);
    try {
      const idx = await buildIndex(prep.dir);
      const { files } = locate(idx, issue, { k: 10 });
      const { rec, hit } = score(files, gold);
      const bytes = bundle(prep.dir, files);
      rows.push({ id: task.taskId, n: gold.length, rec, hit, tokens: tokens(bytes), gold, top: files.slice(0, 3).map(f => f.path) });
    } finally { await prep.cleanup(); }
  }
  return rows;
}

// SWE-bench Pro: repo at base_commit. The eval image is not pulled here (multi-GB), so the checkout is a
// shallow git fetch of row.base_commit from the upstream repo. Test files from test_patch are removed as in v4-swebpro.
function git(args, cwd) {
  return new Promise((res, rej) => execFile('git', args, { cwd, maxBuffer: 64 << 20 }, (e, out) => (e ? rej(e) : res(out))));
}

async function sweCheckout(row) {
  const dir = join(V5_CACHE, 'swe', row.instance_id);
  if (!existsSync(join(dir, '.ready'))) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    await git(['init', '-q'], dir);
    await git(['remote', 'add', 'origin', `https://github.com/${row.repo}.git`], dir);
    await git(['fetch', '-q', '--depth', '1', 'origin', row.base_commit], dir);
    await git(['checkout', '-q', 'FETCH_HEAD'], dir);
    await writeFile(join(dir, '.ready'), '');
  }
  const work = await mkdtemp(join(tmpdir(), 'v5-swe-'));
  await cp(dir, work, { recursive: true, filter: p => !/\/\.(git|ready)$/.test(p) && !p.endsWith('/.ready') });
  for (const f of patchFiles(row.test_patch)) await rm(join(work, f), { force: true });
  return work;
}

async function evalSwe() {
  const pilot = await readJson(join(ROOT, 'config/bench-manifest.swebpro-pilot.json'));
  const all = await readJson(join(SWE_CACHE, 'rows.json'));
  const rows = [];
  for (const t of pilot) {
    const row = all.find(r => r.instance_id === t.taskId);
    if (!row) throw new Error(`row missing: ${t.taskId}`);
    const dir = await sweCheckout(row);
    try {
      const idx = await buildIndex(dir);
      const { files } = locate(idx, row.problem_statement, { k: 10 });
      const gold = patchFiles(row.patch);
      const { rec, hit } = score(files, gold);
      rows.push({ id: t.taskId.slice(0, 60), n: gold.length, rec, hit, tokens: tokens(bundle(dir, files)), gold, top: files.slice(0, 3).map(f => f.path) });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  return rows;
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = x => `${(100 * x).toFixed(1)}%`;

function summary(name, rows) {
  const cells = KS.map(k => pct(mean(rows.map(r => r.rec[k]))));
  const hits = KS.map(k => pct(mean(rows.map(r => r.hit[k]))));
  return `| ${name} | ${rows.length} | ${cells.join(' | ')} | ${hits.join(' | ')} | ${Math.round(mean(rows.map(r => r.tokens)))} |`;
}

function perTask(rows) {
  return ['| task | gold | R@1 | R@3 | R@5 | R@10 | tokens | top-3 |', '|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.id} | ${r.gold.join(', ')} | ${KS.map(k => r.rec[k].toFixed(2)).join(' | ')} | ${r.tokens} | ${r.top.join(', ')} |`)].join('\n');
}

const poly = await evalPoly();
const swe = await evalSwe();
const md = [
  '# v5 localization eval (free, no model calls)', '',
  `Date: ${new Date().toISOString().slice(0, 10)}. Index: src/v5-index.mjs (BM25 + path/symbol/literal boosts).`,
  'Recall@k = mean fraction of gold files in top k. Hit@k = share of tasks with at least one gold file in top k.',
  'Tokens = chars/4 of the top-5 excerpt bundle (one 31-line snippet per file at its top symbol, or file head).', '',
  '| set | tasks | R@1 | R@3 | R@5 | R@10 | hit@1 | hit@3 | hit@5 | hit@10 | mean bundle tokens |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  summary('polyglot (27+ manifest union)', poly),
  summary('SWE-bench Pro pilot', swe), '',
  '### polyglot per task', perTask(poly), '',
  '### SWE-bench Pro per task', perTask(swe), '',
  'Notes: polyglot issue = .docs/instructions(.append).md; gold = .meta/config.json solution files; index runs on the',
  'prepWorkspace stub copy (hidden tests removed). SWE-bench Pro repo = shallow fetch of base_commit from upstream,',
  'not the eval docker image (not pulled: multi-GB, disk 96% full); test_patch files removed; issue = problem_statement.',
  '',
].join('\n');
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, md);
console.log(JSON.stringify({ poly: summary('poly', poly), swe: summary('swe', swe), out: OUT }));
