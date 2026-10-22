// v5 code-localization index: BM25 over files, plus path / symbol / literal-mention boosts.
// Node stdlib only. Never calls a model. localize() = buildIndex() + locate().
import { readFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', '__pycache__', '.venv', 'venv', 'dist', 'build', 'target']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tgz', '.tar', '.jar',
  '.class', '.so', '.dylib', '.dll', '.exe', '.bin', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.mov', '.wasm', '.pyc', '.o', '.a', '.lock']);
const LANG = { '.py': 'py', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js', '.ts': 'js', '.tsx': 'js', '.go': 'go',
  '.rs': 'rust', '.java': 'java', '.kt': 'java', '.cs': 'java', '.c': 'c', '.h': 'c', '.cc': 'c', '.cpp': 'c', '.cxx': 'c', '.hpp': 'c' };
// shortcut: regex symbol extraction, not a parser. Misses decorators/macros/nested defs; upgrade to tree-sitter if recall stalls.
const SYM_RE = {
  py: [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^\s*class\s+([A-Za-z_]\w*)/],
  js: [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)/,
    /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>/],
  go: [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/],
  rust: [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+|const\s+|unsafe\s+)*fn\s+([A-Za-z_]\w*)/,
    /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/],
  java: [/^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|native|default)\s+)*(?:<[^>]+>\s*)?[\w<>\[\],.?]+\s+([A-Za-z_]\w*)\s*\([^;]*$/,
    /^\s*(?:(?:public|private|protected|abstract|final|static)\s+)*(?:class|interface|enum)\s+([A-Za-z_]\w*)/],
  c: [/^(?:[\w:<>*&~]+\s+)+[*&]?([A-Za-z_]\w*(?:::\w+)*)\s*\([^;]*$/, /^\s*(?:class|struct)\s+([A-Za-z_]\w*)\s*(?::|\{|$)/],
};
// Lines starting with a control keyword are calls or statements, not declarations (e.g. `return f(x)` looks like `Type name(`).
const NOT_DECL = /^\s*(return|if|else|for|while|switch|catch|throw|new|case|do|try|elif|with|yield|await|print)\b/;
const STOP = new Set(('a an and are as at be but by can could do does for from had has have how i if in into is it its of on or ' +
  'so that the their then there these this to was we what when where which while who why will with would not no yes also get set ' +
  'use used using instead issue bug problem steps reproduce example one true false null none undefined self').split(' '));
const K1 = 1.2;
const B = 0.75;

// Splits identifiers on _ and camelCase; keeps the whole lowercased identifier too, so exact names still match.
export function terms(text) {
  const out = [];
  for (const [word] of text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
    const whole = word.toLowerCase();
    const parts = word.split('_').flatMap(p => p.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []).map(p => p.toLowerCase());
    if (parts.length > 1) out.push(whole);
    out.push(...parts);
  }
  return out.filter(t => t.length >= 2 && !STOP.has(t));
}

export function symbolsOf(lang, text) {
  const res = SYM_RE[lang];
  if (!res) return [];
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (NOT_DECL.test(line)) return;
    for (const re of res) {
      const m = re.exec(line);
      if (m && !STOP_SYM.has(m[1])) { out.push({ name: m[1], line: i + 1 }); return; }
    }
  });
  return out;
}
const STOP_SYM = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'else', 'do', 'try', 'elif', 'with', 'case']);

async function walk(root, rel, out, maxBytes) {
  for (const ent of await readdir(join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) await walk(root, r, out, maxBytes);
    } else if (ent.isFile() && !BINARY_EXT.has(extname(ent.name).toLowerCase())) {
      const full = join(root, r);
      if ((await stat(full)).size > maxBytes) continue;
      const buf = await readFile(full);
      if (buf.subarray(0, 8000).includes(0)) continue; // NUL byte => binary
      out.push({ rel: r, text: buf.toString('utf8') });
    }
  }
}

// Returns { docs, df, avgLen }. Build once per repo state; locate() is cheap per issue.
export async function buildIndex(repoDir, { maxBytes = 300 * 1024 } = {}) {
  const raw = [];
  await walk(repoDir, '', raw, maxBytes);
  const df = new Map();
  let total = 0;
  const docs = raw.map(({ rel, text }) => {
    const tf = new Map();
    const ts = terms(text);
    for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
    const pathTerms = new Set(terms(rel));
    for (const t of new Set([...tf.keys(), ...pathTerms])) df.set(t, (df.get(t) ?? 0) + 1);
    total += ts.length;
    const lang = LANG[extname(rel).toLowerCase()];
    return { rel, tf, len: ts.length, pathTerms, syms: symbolsOf(lang, text).map(s => ({ ...s, terms: terms(s.name) })) };
  });
  return { docs, df, N: docs.length, avgLen: docs.length ? total / docs.length || 1 : 1 };
}

// Literal mentions in the issue: backtick spans (identifiers) and file paths (incl. stack-trace paths).
const PATH_RE = /(?:[\w.-]+\/)*[\w.-]+\.(?:py|pyi|mjs|cjs|jsx|tsx|js|ts|go|java|kt|cs|cc|cpp|cxx|hpp|rs|rb|c|h|md|txt|json|ya?ml|toml|html|css)\b/g;
function literals(issue) {
  const paths = [...issue.matchAll(PATH_RE)].map(m => m[0].replace(/^\.?\/+/, '').replace(/^[ab]\//, ''));
  const idents = new Set();
  for (const [, span] of issue.matchAll(/`([^`\n]{1,200})`/g)) for (const [w] of span.matchAll(/[A-Za-z_]\w*/g)) idents.add(w);
  return { paths, idents };
}

// Returns { files: [{path, score, symbols:[{name,line}]}], symbols: [{path,name,line,score}] }, top-k each.
export function locate(index, issue, { k = 10, symK = 5 } = {}) {
  const { docs, df, N, avgLen } = index;
  const qTerms = new Set(terms(issue));
  const { paths, idents } = literals(issue);
  const idf = t => { const d = df.get(t) ?? 0; return Math.log(1 + (N - d + 0.5) / (d + 0.5)); };
  const litPath = new Map();
  for (const doc of docs) {
    for (const p of paths) {
      if (doc.rel === p) litPath.set(doc.rel, 1.5);
      else if (!litPath.has(doc.rel) && doc.rel.endsWith('/' + p)) litPath.set(doc.rel, 1.0);
      else if (!litPath.has(doc.rel) && !p.includes('/') && doc.rel.split('/').pop() === p) litPath.set(doc.rel, 0.75);
    }
  }
  const scored = docs.map(doc => {
    let bm = 0;
    let pathS = 0;
    for (const t of qTerms) {
      const tf = doc.tf.get(t);
      if (tf) bm += idf(t) * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * doc.len / avgLen));
      if (doc.pathTerms.has(t)) pathS += idf(t);
    }
    const symRel = doc.syms.map(s => {
      let r = s.terms.reduce((a, t) => a + (qTerms.has(t) ? idf(t) : 0), 0);
      if (idents.has(s.name)) r += 3;
      return { ...s, score: r };
    });
    const symS = Math.max(0, ...symRel.map(s => s.score));
    return { doc, bm, pathS, symRel, symS, lit: (litPath.get(doc.rel) ?? 0) + (symRel.some(s => idents.has(s.name)) ? 0.5 : 0) };
  });
  const max = key => Math.max(1e-9, ...scored.map(s => s[key]));
  const [mb, mp, ms] = [max('bm'), max('pathS'), max('symS')];
  const files = scored.map(s => ({
    path: s.doc.rel,
    score: s.bm / mb + 0.5 * s.pathS / mp + 0.5 * s.symS / ms + s.lit,
    symRel: s.symRel,
  })).filter(f => f.score > 0).sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : 1));
  const top = files.slice(0, k).map(f => ({
    path: f.path,
    score: Math.round(f.score * 1000) / 1000,
    symbols: f.symRel.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, symK).map(({ name, line }) => ({ name, line })),
  }));
  const symbols = files.flatMap(f => f.symRel.filter(s => s.score > 0).map(s => ({ path: f.path, name: s.name, line: s.line, score: Math.round(s.score * 1000) / 1000 })))
    .sort((a, b) => b.score - a.score).slice(0, k);
  return { files: top, symbols };
}

export async function localize(repoDir, issue, opts = {}) {
  return locate(await buildIndex(repoDir, opts), issue, opts);
}

// Compact excerpt around a symbol line (1-based). Without a line, returns the file head. path must be absolute or cwd-relative.
export function snippet(path, symbolLine, ctx = 15) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const from = symbolLine ? Math.max(0, symbolLine - 1 - ctx) : 0;
  const to = symbolLine ? Math.min(lines.length, symbolLine + ctx) : Math.min(lines.length, 2 * ctx + 1);
  return lines.slice(from, to).map((l, i) => `${from + i + 1}: ${l}`).join('\n');
}
