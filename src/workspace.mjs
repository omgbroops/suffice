import { readFile, writeFile, readdir, lstat, realpath, mkdir } from 'node:fs/promises';
import { resolve, relative, sep, dirname, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Type } from 'typebox';

export const MAX_FILE_BYTES = 128 * 1024;
export function hash(value) { return createHash('sha256').update(value).digest('hex'); }

export async function scopedPath(root, requested, { write = false } = {}) {
  if (typeof requested !== 'string' || !requested || isAbsolute(requested) || requested.includes(':')) throw new Error('Use a relative workspace path.');
  const target = resolve(root, requested);
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new Error('Path escapes workspace.');
  if (rel.split(sep).some(p => p.startsWith('.'))) throw new Error('Hidden paths are not available.');
  if (write && !rel.startsWith(`src${sep}`)) throw new Error('Only src/ may be modified.');
  let current = root;
  for (const part of rel.split(sep)) {
    current = resolve(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Links are not available.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const actualRoot = await realpath(root);
  let parent = dirname(target);
  while (true) {
    try {
      const actual = await realpath(parent);
      const within = relative(actualRoot, actual);
      if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new Error('Resolved path escapes workspace.');
      break;
    } catch (error) { if (error.code !== 'ENOENT') throw error; parent = dirname(parent); }
  }
  return target;
}

export async function filesIn(root, directory = '') {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink() || entry.name === 'node_modules') continue;
    const path = [directory, entry.name].filter(Boolean).join('/');
    if (entry.isDirectory()) result.push(...await filesIn(root, path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export async function readText(root, path) {
  const target = await scopedPath(root, path);
  if ((await lstat(target)).size > MAX_FILE_BYTES) throw new Error('File exceeds experiment size limit.');
  return readFile(target, 'utf8');
}

export async function runNodeTests(workspace, testPath, { signal, timeoutMs = 15_000 } = {}) {
  const canonicalWorkspace = await realpath(workspace);
  const absoluteTest = await realpath(testPath);
  const testSource = await readFile(absoluteTest, 'utf8');
  const expectedNames = [...testSource.matchAll(/\btest\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]).filter(n => !n.startsWith('acceptance requires'));
  const args = ['--permission', `--allow-fs-read=${canonicalWorkspace}`, `--allow-fs-read=${absoluteTest}`,
    '--max-old-space-size=128', '--test-reporter=tap', absoluteTest];
  const started = Date.now();
  return new Promise(resolveResult => {
    const child = spawn(process.execPath, args, { cwd: canonicalWorkspace, windowsHide: true, env: {
      SystemRoot: process.env.SystemRoot ?? '', WINDIR: process.env.WINDIR ?? '',
      SUFFICE_WORKSPACE: canonicalWorkspace, NODE_NO_WARNINGS: '1',
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', truncated = false, timedOut = false;
    const add = key => chunk => {
      const text = chunk.toString();
      if (key === 'stdout') { stdout += text; if (stdout.length > 100_000) { stdout = stdout.slice(0, 100_000); truncated = true; } }
      else { stderr += text; if (stderr.length > 30_000) { stderr = stderr.slice(0, 30_000); truncated = true; } }
    };
    child.stdout.on('data', add('stdout')); child.stderr.on('data', add('stderr'));
    const stop = () => { timedOut = true; child.kill(); };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    child.on('error', error => { clearTimeout(timer); resolveResult({ status: 'infrastructure_error', errorCode: error.code, stdout: '', stderr: '', latencyMs: Date.now() - started }); });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      const count = name => { const values = [...stdout.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))]; return values.length === 1 ? Number(values[0][1]) : null; };
      const tests = count('tests'), passed = count('pass'), failed = count('fail'), skipped = count('skipped'), cancelled = count('cancelled'), todo = count('todo');
      const observedNames = [...stdout.matchAll(/^ok \d+ - (.*)$/gm)].map(m => m[1]);
      const namesMatch = expectedNames.length > 0 && JSON.stringify(observedNames) === JSON.stringify(expectedNames);
      const validPass = code === 0 && !truncated && tests === expectedNames.length && passed === tests && failed === 0 && skipped === 0 && cancelled === 0 && todo === 0 && namesMatch;
      const status = timedOut ? 'timeout' : validPass ? 'passed' : code === 0 ? 'invalid_result' : 'failed';
      resolveResult({ status, exitCode: code, tests, passed, failed, skipped, cancelled, todo, expectedTests: expectedNames.length, namesMatch, stdout, stderr, truncated, latencyMs: Date.now() - started });
    });
  });
}

function toolResult(data) { return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }], structuredContent: data, details: {} }; }
const unknown = Type.Unknown();
export function workspaceTools({ workspace, log = () => {}, artifactsDir, signal, defaultReadLimit = 200 }) {
  let serial = Promise.resolve();
  const mutate = fn => { const result = serial.then(fn); serial = result.catch(() => {}); return result; };
  const make = (name, description, parameters, operation) => ({ name, label: name, description, parameters, outputSchema: unknown,
    async execute(_id, args) { if (signal?.aborted) throw new Error('Run aborted.'); const result = await operation(args); log({ type: 'tool', name, args, resultHash: hash(JSON.stringify(result)), resultChars: JSON.stringify(result).length }); return toolResult(result); } });
  return [
    make('files', 'List all non-hidden files in the workspace.', Type.Object({}), async () => filesIn(workspace)),
    make('file_read', 'Read a UTF-8 workspace file. Optional one-based offset and line limit. Returns numbered source, total lines and omitted counts.',
      Type.Object({ path: Type.String(), offset: Type.Optional(Type.Integer({ minimum: 1 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })) }),
      async ({ path, offset = 1, limit = defaultReadLimit }) => { const content = await readText(workspace, path); const lines = content.split('\n'); return { path, version: hash(content), totalLines: lines.length, offset, omittedBefore: offset - 1, omittedAfter: Math.max(0, lines.length - offset + 1 - limit), text: lines.slice(offset - 1, offset - 1 + limit).map((l, i) => `${offset + i}: ${l}`).join('\n') }; }),
    make('search', 'Search literal text across workspace source and documentation. Returns matching paths and numbered lines; max 40 matches.', Type.Object({ query: Type.String({ minLength: 1 }), path: Type.Optional(Type.String()) }),
      async ({ query, path }) => { const paths = path ? [path] : await filesIn(workspace); const matches = []; for (const p of paths) { const text = await readText(workspace, p); text.split('\n').forEach((line, i) => { if (line.toLowerCase().includes(query.toLowerCase()) && matches.length < 40) matches.push({ path: p, line: i + 1, text: line.slice(0, 500) }); }); } return matches; }),
    make('file_edit', 'Replace one exact unique text occurrence in a src/ file. Fails if old text is missing or ambiguous.', Type.Object({ path: Type.String(), oldText: Type.String({ minLength: 1 }), newText: Type.String() }),
      args => mutate(async () => { const content = await readText(workspace, args.path); if (content.split(args.oldText).length !== 2) throw new Error('oldText must match exactly once.'); const next = content.replace(args.oldText, args.newText); if (Buffer.byteLength(next) > MAX_FILE_BYTES) throw new Error('File too large.'); await writeFile(await scopedPath(workspace, args.path, { write: true }), next); return { path: args.path, version: hash(next), edited: true }; })),
    make('file_write', 'Write a complete UTF-8 src/ file; use file_edit for smaller changes.', Type.Object({ path: Type.String(), content: Type.String() }),
      args => mutate(async () => { if (Buffer.byteLength(args.content) > MAX_FILE_BYTES) throw new Error('File too large.'); const target = await scopedPath(workspace, args.path, { write: true }); await mkdir(dirname(target), { recursive: true }); await writeFile(target, args.content); return { path: args.path, version: hash(args.content), written: true }; })),
    make('test', 'Run the visible Node test suite. Returns status and diagnostic output. Acceptance tests are run separately by the evaluator.', Type.Object({}),
      async () => { const result = await runNodeTests(workspace, resolve(workspace, 'tests/visible.test.mjs'), { signal }); await mkdir(artifactsDir, { recursive: true }); const id = `test-${Date.now()}.json`; await writeFile(resolve(artifactsDir, id), JSON.stringify(result)); return { ...result, stdout: result.stdout.slice(0, 12_000), stderr: result.stderr.slice(0, 3000), artifact: id }; }),
  ];
}
