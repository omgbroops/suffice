import {createHash} from 'node:crypto';
import {lstat, readFile, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'reports']);
const SOURCE = /\.(?:[cm]?[jt]sx?|py|rs|go|java|c(?:pp|xx)?|h(?:pp)?|json|md|toml|ya?ml)$/i;
const hash = value => createHash('sha256').update(value).digest('hex');
const bounded = (value, fallback, ceiling) => Number.isInteger(value) && value > 0 ? Math.min(value, ceiling) : fallback;

export async function workspaceFile(workspace, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath) || relativePath.includes('\\')) throw Error('Expected a relative workspace path');
  const root = await realpath(workspace);
  const candidate = path.resolve(root, relativePath);
  const inside = value => { const rel = path.relative(root, value); return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); };
  if (!inside(candidate)) throw Error('Path escapes workspace');
  const actual = await realpath(candidate);
  if (!inside(actual)) throw Error('Path resolves outside workspace');
  if (!(await lstat(actual)).isFile()) throw Error('Expected a source file');
  return {root, absolutePath: actual, path: path.relative(root, candidate).split(path.sep).join('/')};
}

async function candidates(workspace, limit, maxDepth) {
  const output = [];
  let visited = 0;
  async function visit(directory, depth) {
    const entries = (await readdir(directory, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (++visited > limit) return;
      if (entry.name.startsWith('.') || SKIP.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && depth < maxDepth) await visit(absolute, depth + 1);
      else if (entry.isFile() && SOURCE.test(entry.name)) output.push(path.relative(workspace, absolute).split(path.sep).join('/'));
      if (visited >= limit) return;
    }
  }
  await visit(workspace, 0);
  return {paths: output, visited, limited: visited >= limit};
}

/** Only public task text, explicit guidance and workspace files enter this bundle. */
export async function prepareTaskContext(options) {
  const {workspace, task = '', contracts = [], guidance = [], commands = {}} = options;
  if (!workspace || typeof task !== 'string') throw Error('workspace and task text are required');
  if (![contracts, guidance].every(items => Array.isArray(items) && items.every(item => typeof item === 'string'))) throw Error('contracts and guidance must be explicit string arrays');
  if (!commands || typeof commands !== 'object' || Array.isArray(commands) || Object.values(commands).some(value => typeof value !== 'string')) throw Error('commands must map names to command strings');
  const root = await realpath(workspace);
  const maxFiles = bounded(options.maxFiles, 6, 20);
  const maxBytes = bounded(options.maxBytes, 18000, 100000);
  const maxFileBytes = bounded(options.maxFileBytes, 6000, 20000);
  const maxSourceBytes = bounded(options.maxSourceBytes, 256000, 1000000);
  let scan = {paths: options.paths, visited: 0, limited: false};
  if (options.paths === undefined) scan = await candidates(root, bounded(options.maxEntries, 300, 2000), bounded(options.maxDepth, 4, 8));
  if (!Array.isArray(scan.paths) || scan.paths.some(item => typeof item !== 'string') || scan.paths.length > 2000) throw Error('paths must be a bounded string array');
  const tokens = [...new Set(task.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [])].slice(0, 100);
  const score = name => tokens.reduce((n, token) => n + (name.toLowerCase().includes(token) ? 1 : 0), 0);
  const ranked = [...new Set(scan.paths)].sort((a, b) => score(b) - score(a) || a.localeCompare(b, 'en'));
  const instructions = JSON.stringify({contracts, guidance, commands});
  if (Buffer.byteLength(instructions) > maxBytes / 2) throw Error('Explicit guidance and commands exceed the context allowance');
  const sources = [];
  const skipped = [];
  let used = Buffer.byteLength(instructions);
  for (const relative of ranked) {
    if (sources.length >= maxFiles || used >= maxBytes) break;
    try {
      const file = await workspaceFile(root, relative);
      if ((await lstat(file.absolutePath)).size > maxSourceBytes) { skipped.push({path: relative, reason: 'source_size_limit'}); continue; }
      const bytes = await readFile(file.absolutePath);
      if (bytes.includes(0) || bytes.length > maxSourceBytes) { skipped.push({path: relative, reason: 'binary_or_source_size_limit'}); continue; }
      const metadata = {path: file.path, sha256: hash(bytes), bytes: bytes.length};
      const available = Math.min(maxFileBytes, maxBytes - used - Buffer.byteLength(JSON.stringify(metadata)) - 100);
      if (available <= 0) break;
      // Back off incomplete UTF-8 characters so the preview does not invent replacement text.
      const content = new TextDecoder('utf-8', {fatal: false}).decode(bytes.subarray(0, available), {stream: bytes.length > available});
      const entry = {...metadata, content, truncated: Buffer.byteLength(content) < bytes.length};
      const cost = Buffer.byteLength(JSON.stringify(entry));
      if (used + cost > maxBytes) { skipped.push({path: relative, reason: 'serialized_context_limit'}); continue; }
      sources.push(entry);
      used += cost;
    } catch (error) { skipped.push({path: relative, reason: error.message}); }
  }
  return {version: 'prepared-context-v1', contracts: [...contracts], guidance: [...guidance], commands: {...commands}, sources, references: sources.map(({path, sha256}) => ({path, sha256})), byteUsage: used, maxBytes, scan: {visited: scan.visited, limited: scan.limited}, skipped};
}

export async function verifySourceReferences({workspace, references = []}) {
  if (!Array.isArray(references) || references.length > 100) throw Error('Expected bounded source references');
  const results = [];
  for (const reference of references) {
    try {
      if (!/^[a-f0-9]{64}$/.test(reference.sha256)) throw Error('Invalid source hash');
      const file = await workspaceFile(workspace, reference.path);
      if ((await lstat(file.absolutePath)).size > 1000000) throw Error('Source exceeds verification limit');
      const bytes = await readFile(file.absolutePath);
      results.push({path: reference.path, fresh: hash(bytes) === reference.sha256});
    } catch (error) { results.push({path: reference?.path, fresh: false, reason: error.message}); }
  }
  return {fresh: results.every(item => item.fresh), results};
}
