// Grader-image entry point only. Never include this file or /grader in an actor image.
import {mkdir, readFile, writeFile, readdir, lstat, copyFile, chmod, rm, symlink, mkdtemp} from 'node:fs/promises';
import {resolve, join, dirname, basename, relative, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runProcess} from '../src/v9/process.mjs';
import {parseGoCounts, parseJUnitCounts, parseJestCounts} from './poly27-public-check.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const empty = () => ({tests: 0, passed: 0, failed: 0, skipped: 0});
const sum = rows => rows.reduce((total, row) => Object.fromEntries(Object.keys(total).map(k => [k, total[k] + row[k]])), empty());
const json = value => JSON.stringify(value, null, 2) + '\n';
function relPath(path) {
  if (typeof path !== 'string' || !path || /[\\\0:]/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || ['.', '..', '.git'].includes(p) || /[. ]$/.test(p))) throw Error(`Unsafe relative path: ${path}`);
  return path;
}
function inside(root, path) {
  relPath(path); const target = resolve(root, ...path.split('/')), rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep)) throw Error('Path escaped workspace');
  return target;
}
async function exists(path) {try {await lstat(path); return true;} catch (error) {if (error.code === 'ENOENT') return false; throw error;}}
async function inventory(root, prefix = '', state = {files: 0, bytes: 0}, skipGit = false) {
  const out = new Map();
  for (const entry of await readdir(join(root, prefix), {withFileTypes: true})) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (skipGit && path === '.git') continue;
    relPath(path); const source = join(root, path), stat = await lstat(source);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw Error(`Nonregular source entry: ${path}`);
    if (stat.isDirectory()) for (const row of await inventory(root, path, state, skipGit)) out.set(...row);
    else {
      if (++state.files > (state.maxFiles ?? 5000) || (state.bytes += stat.size) > (state.maxBytes ?? 64 * 1024 * 1024)) throw Error('Source inventory exceeds bounds');
      out.set(path, {bytes: await readFile(source), mode: stat.mode & 0o777});
    }
  }
  return out;
}
async function replaceFile(workspace, path, bytes, mode = 0o644) {
  const destination = inside(workspace, path), pieces = path.split('/'); let parent = workspace;
  for (const piece of pieces.slice(0, -1)) {
    parent = join(parent, piece);
    if (await exists(parent)) {const st = await lstat(parent); if (!st.isDirectory() || st.isSymbolicLink()) await rm(parent, {force: true, recursive: true});}
    await mkdir(parent, {recursive: true});
  }
  if (await exists(destination)) await rm(destination, {force: true, recursive: true});
  await writeFile(destination, bytes, {flag: 'wx', mode}); await chmod(destination, mode);
}
async function copyDirectory(source, destination) {
  await mkdir(destination, {recursive: true});
  for (const [path, record] of await inventory(source, '', {files: 0, bytes: 0, maxFiles: 50000, maxBytes: 1024 * 1024 * 1024})) await replaceFile(destination, path, record.bytes, record.mode);
}

export function parseCatchCounts(text) {
  const passed = [...String(text).matchAll(/^All tests passed \([^\n]*? in (\d+) test case(?:s)?\)\s*$/gm)];
  const mixed = [...String(text).matchAll(/^test cases:\s*(\d+)\s*\|([^\n]+)$/gm)];
  if (passed.length + mixed.length !== 1) return null;
  if (passed.length) return {tests: Number(passed[0][1]), passed: Number(passed[0][1]), failed: 0, skipped: 0};
  const fields = mixed[0][2], count = word => Number(fields.match(new RegExp(`(?:^|\\|)\\s*(\\d+) ${word}(?:\\s|$)`))?.[1] ?? 0);
  const row = {passed: count('passed'), failed: count('failed'), skipped: count('skipped')};
  if (Number(mixed[0][1]) !== row.passed + row.failed + row.skipped || /(?:filtered|ignored)/.test(fields)) return null;
  return {tests: row.passed + row.failed, ...row};
}
export function parseCanonicalRustCounts(text) {
  const matches = [...String(text).matchAll(/^test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out;.*$/gm)];
  if (!matches.length) return null;
  const rows = [];
  for (const match of matches) {
    const [passed, failed, skipped, measured, filtered] = match.slice(1).map(Number);
    if (measured || filtered) return null;
    rows.push({tests: passed + failed, passed, failed, skipped});
  }
  return sum(rows);
}
export function canonicalRustArgs(descriptor) {
  const targets = descriptor.hiddenFiles.map(file => file.path.match(/^tests\/([^/]+)\.rs$/)?.[1]).filter(Boolean).sort();
  if (!targets.length || new Set(targets).size !== targets.length) throw Error('Missing or duplicate frozen Rust integration targets');
  const locked = descriptor.actorFiles.some(file => file.path === 'Cargo.lock');
  return ['test', '--offline', ...(locked ? ['--locked'] : []), ...targets.flatMap(target => ['--test', target]), '--', '--include-ignored'];
}
export function activateTests(lang, text) {
  if (lang === 'java') return text.replace(/@Disabled\([^)]*\)\s*\n/g, '');
  if (lang === 'javascript') return text.replace(/xtest\(/g, 'test(');
  return text;
}
export function classifyResult({calls, counts, expectedTests} = {}) {
  if (!Array.isArray(calls) || !calls.length || calls.some(c => c.error || c.timedOut || c.overflow || c.aborted)) return {status: 'unverified', accepted: null, kind: 'incomplete_process'};
  const last = calls.at(-1), output = calls.map(c => `${c.stdout ?? ''}\n${c.stderr ?? ''}`).join('\n');
  if (/(?:Could not resolve all|Could not download|No cached version|not found in offline mode|Failed to fetch|No module named ['"]?pytest\b|could not execute process|compiler.*not found|Could not find CMAKE|No CMAKE_\w+_COMPILER|CMAKE_\w+_COMPILER.*not set)/i.test(output)) return {status: 'unverified', accepted: null, kind: 'toolchain_or_dependency'};
  const compileFailure = last.exitCode !== 0 && /(?:\S+:\d+(?::\d+)?: (?:fatal )?error:|fatal error:|\[build failed\]|\[setup failed\]|compilation failed|could not compile|compileJava FAILED|compileTestJava FAILED|Cannot find source file|SyntaxError|ImportError|ModuleNotFoundError|error\[E\d+\])/i.test(output);
  if ((!counts || !counts.tests) && compileFailure) return {status: 'failed', accepted: false, kind: 'compile_error'};
  if (!counts || Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0) || counts.tests <= 0 || counts.tests !== counts.passed + counts.failed || counts.skipped) return {status: 'unverified', accepted: null, kind: 'missing_or_skipped_tests'};
  if (last.exitCode !== 0 || counts.failed > 0) return {status: 'failed', accepted: false, kind: 'test_failure'};
  if (expectedTests !== undefined && counts.tests !== expectedTests) return {status: 'unverified', accepted: null, kind: 'test_count_mismatch'};
  return {status: 'passed', accepted: true, kind: 'pass'};
}
const noncanonicalTest = (lang, path) => path.startsWith('.suffice-v10-checks/') || ({
  cpp: /(?:_test|\.test)\.cpp$/i, go: /_test\.go$/i, java: /(?:^|\/)src\/test\//i,
  javascript: /\.(?:test|spec)\.[cm]?[jt]s$/i, python: /(?:^|\/)(?:test_.*\.py|.*_test\.py|conftest\.py)$/i,
  rust: /(?:^|\/)(?:tests|benches)\//i,
}[lang]?.test(path) ?? false);

export async function restoreGradingInputs({workspace, inputFiles, descriptor, graderRoot}) {
  const hidden = new Set(descriptor.hiddenFiles.map(f => relPath(f.path)));
  const configurations = new Set((descriptor.build?.configurations ?? []).map(c => relPath(c.path)));
  const immutable = new Set(descriptor.actorFiles.map(f => relPath(f.path)).filter(path => !descriptor.files.solution.includes(path) || configurations.has(path)));
  for (const path of immutable) {
    const record = inputFiles.get(path); if (!record) throw Error(`Missing immutable input: ${path}`);
    await replaceFile(workspace, path, record.bytes, record.mode);
  }
  const actorFiles = await inventory(workspace, '', undefined, true);
  for (const path of actorFiles.keys()) if ((!hidden.has(path) && noncanonicalTest(descriptor.lang, path)) || /(?:^|\/)__pycache__\//.test(path) || /\.py[co]$/.test(path)) await rm(inside(workspace, path), {force: true});
  const restored = [];
  for (const item of descriptor.hiddenFiles) {
    const path = relPath(item.path), raw = await readFile(inside(join(graderRoot, 'hidden'), path));
    if (hash(raw) !== item.sha256 || raw.length !== item.bytes) throw Error(`Frozen hidden file hash mismatch: ${path}`);
    const activated = Buffer.from(activateTests(descriptor.lang, raw.toString('utf8')));
    await replaceFile(workspace, path, activated, item.mode);
    restored.push({path, originalSha256: item.sha256, activeSha256: hash(activated)});
  }
  return {immutablePaths: [...immutable].sort(), restored};
}
async function findXml(root) {
  if (!await exists(root)) return [];
  const paths = [];
  for (const entry of await readdir(root, {withFileTypes: true})) {
    if (entry.isDirectory()) paths.push(...await findXml(join(root, entry.name)));
    else if (entry.isFile() && entry.name.endsWith('.xml')) paths.push(join(root, entry.name));
  }
  return paths.sort();
}

export async function runGrader({config = {}, input = '/input', graderRoot = '/grader', patch = '/patch/patch.diff', results = '/results', workRoot = '/work', tempRoot = tmpdir(), env = process.env, run = runProcess} = {}) {
  const started = Date.now(), calls = [], reports = []; let descriptor, workspace, restored, counts = null, final;
  const timeoutMs = config.timeoutMs ?? 120_000;
  await mkdir(results, {recursive: true});
  const temporary = await mkdtemp(join(tempRoot, 'suffice-canonical-grade-'));
  const runtimeEnv = {...env, CARGO_NET_OFFLINE: 'true', CARGO_TARGET_DIR: join(temporary, 'cargo-target'), GOPROXY: 'off', GOSUMDB: 'off', PYTHONDONTWRITEBYTECODE: '1'};
  for (const key of ['NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'PYTEST_ADDOPTS', 'RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'GOFLAGS']) delete runtimeEnv[key];
  const exec = async (command, args, phase = 'test') => {
    const id = String(calls.length + 1).padStart(2, '0'), stdoutPath = `${id}-${phase}.stdout.txt`, stderrPath = `${id}-${phase}.stderr.txt`;
    const outcome = await run(command, args, {cwd: workspace, env: runtimeEnv, timeoutMs: Math.max(1, timeoutMs - (Date.now() - started)), maxBytes: 8_000_000,
      stdoutPath: join(results, stdoutPath), stderrPath: join(results, stderrPath)});
    // Real runProcess writes complete streams; injected unit-test runners may return them only.
    if (!await exists(join(results, stdoutPath))) await writeFile(join(results, stdoutPath), outcome.stdout ?? '');
    if (!await exists(join(results, stderrPath))) await writeFile(join(results, stderrPath), outcome.stderr ?? '');
    const recorded = {...outcome, stdout: await readFile(join(results, stdoutPath), 'utf8'), stderr: await readFile(join(results, stderrPath), 'utf8')};
    calls.push({command, args, phase, ...recorded, stdoutPath, stderrPath}); return recorded;
  };
  const succeeded = result => result.exitCode === 0 && !result.error && !result.timedOut && !result.overflow && !result.aborted;
  const setup = async (command, args) => {const result = await exec(command, args, 'setup'); if (!succeeded(result)) throw Error(`Grader setup command failed: ${command}`);};
  const saveReport = async path => {
    const bytes = await readFile(path), destination = `report-${reports.length + 1}${path.endsWith('.json') ? '.json' : '.xml'}`;
    await writeFile(join(results, destination), bytes); reports.push({path: destination, sha256: hash(bytes), bytes: bytes.length}); return bytes.toString('utf8');
  };
  try {
    if (!['baseline', 'gold', 'candidate'].includes(config.mode) || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || (config.expectedTests !== undefined && (!Number.isSafeInteger(config.expectedTests) || config.expectedTests <= 0))) throw Error('Invalid grader configuration');
    descriptor = JSON.parse(await readFile(join(graderRoot, 'descriptor.json'), 'utf8'));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(descriptor.name) || !['cpp', 'go', 'java', 'javascript', 'python', 'rust'].includes(descriptor.lang)) throw Error('Invalid frozen task descriptor');
    const inputFiles = await inventory(input), expected = new Map(descriptor.actorFiles.map(f => [relPath(f.path), f]));
    if (inputFiles.size !== expected.size) throw Error('Public input inventory mismatch');
    for (const [path, record] of inputFiles) if (!expected.has(path) || hash(record.bytes) !== expected.get(path).sha256 || record.bytes.length !== expected.get(path).bytes) throw Error(`Public input hash mismatch: ${path}`);
    await mkdir(workRoot, {recursive: true}); workspace = join(workRoot, descriptor.name); await mkdir(workspace);
    for (const [path, record] of inputFiles) await replaceFile(workspace, path, record.bytes, record.mode);
    await setup('git', ['init', '--quiet']); await setup('git', ['config', 'core.autocrlf', 'false']); await setup('git', ['add', '--all', '--force']);
    if (config.mode === 'candidate') {
      const patchBytes = await readFile(patch); if (patchBytes.length > 5 * 1024 * 1024) throw Error('Candidate patch exceeds bounds');
      if (patchBytes.length) {
        const checked = await exec('git', ['apply', '--check', '--binary', '--index', '--whitespace=nowarn', patch], 'patch-check');
        if (!succeeded(checked)) {const error = Error('Candidate patch cannot be applied to the frozen input'); error.kind = 'invalid_patch'; throw error;}
        const applied = await exec('git', ['apply', '--binary', '--index', '--whitespace=nowarn', patch], 'patch');
        if (!succeeded(applied)) throw Error('Checked candidate patch application failed');
      }
      let candidateFiles;
      try {candidateFiles = await inventory(workspace, '', undefined, true);} catch (error) {error.kind = 'invalid_patch'; throw error;}
      if ([...candidateFiles.keys()].some(path => path.split('/').some(p => ['.meta', '.approaches'].includes(p)))) {const error = Error('Candidate creates forbidden metadata paths'); error.kind = 'invalid_patch'; throw error;}
    } else if (config.mode === 'gold') {
      const references = new Map(descriptor.referenceFiles.map(f => [relPath(f.path), f]));
      for (const mapping of descriptor.referenceMapping) {
        const metadata = references.get(relPath(mapping.from)); if (!metadata) throw Error('Reference mapping lacks frozen inventory');
        const bytes = await readFile(inside(join(graderRoot, 'reference'), mapping.from));
        if (hash(bytes) !== metadata.sha256 || bytes.length !== metadata.bytes) throw Error('Frozen reference hash mismatch');
        await replaceFile(workspace, mapping.to, bytes, metadata.mode);
      }
    }
    restored = await restoreGradingInputs({workspace, inputFiles, descriptor, graderRoot});
    const testStart = calls.length; let result;
    if (descriptor.lang === 'cpp') {
      result = await exec('cmake', ['-S', '.', '-B', 'build', '-DEXERCISM_RUN_ALL_TESTS=ON'], 'configure');
      if (succeeded(result)) result = await exec('cmake', ['--build', 'build', '--config', 'Debug'], 'compile-and-test');
      counts = parseCatchCounts(result.stdout);
    } else if (descriptor.lang === 'go') {
      result = await exec('go', ['test', '-json', '-count=1', './...']); counts = parseGoCounts(result.stdout);
    } else if (descriptor.lang === 'java') {
      const gradleHome = runtimeEnv.GRADLE_USER_HOME || '/home/node/.gradle';
      if (!await exists(join(gradleHome, 'caches')) && await exists('/opt/gradle-cache')) await copyDirectory('/opt/gradle-cache', gradleHome);
      runtimeEnv.GRADLE_USER_HOME = gradleHome;
      const init = join(temporary, 'grader.init.gradle'), build = join(temporary, 'java-build');
      await writeFile(init, `allprojects { layout.buildDirectory = file(${JSON.stringify(build)}) }\n`);
      result = await exec(runtimeEnv.POLY27_GRADLE_BIN || '/opt/gradle/gradle-8.7/bin/gradle', ['test', '--offline', '--no-daemon', '--console=plain', '--project-cache-dir', join(temporary, 'gradle-project-cache'), '--init-script', init]);
      const xml = await findXml(join(build, 'test-results/test')), parsed = [];
      for (const path of xml) parsed.push(parseJUnitCounts(await saveReport(path)));
      if (parsed.length && parsed.every(Boolean)) counts = sum(parsed);
    } else if (descriptor.lang === 'javascript') {
      const modules = runtimeEnv.POLY27_NODE_MODULES || '/opt/bench/node_modules', link = join(workspace, 'node_modules');
      if (await exists(link)) await rm(link, {recursive: true, force: true});
      await symlink(modules, link, process.platform === 'win32' ? 'junction' : 'dir');
      const report = join(temporary, 'jest-report.json');
      result = await exec(process.execPath, [join(modules, 'jest/bin/jest.js'), './*', '--runInBand', '--no-cache', '--watch=false', '--json', '--outputFile', report]);
      if (await exists(report)) counts = parseJestCounts(await saveReport(report));
    } else if (descriptor.lang === 'python') {
      const report = join(temporary, 'pytest-report.xml'); runtimeEnv.PYTHONPATH = workspace;
      result = await exec(runtimeEnv.PYTHON || 'python3', ['-m', 'pytest', '-q', '-rA', '-p', 'no:cacheprovider', '--junitxml', report]);
      if (await exists(report)) counts = parseJUnitCounts(await saveReport(report));
    } else if (descriptor.lang === 'rust') {
      result = await exec('cargo', canonicalRustArgs(descriptor)); counts = parseCanonicalRustCounts(result.stdout);
    }
    final = classifyResult({calls: calls.slice(testStart), counts, expectedTests: config.expectedTests});
  } catch (error) {final = {status: error.kind === 'invalid_patch' ? 'failed' : 'unverified', accepted: error.kind === 'invalid_patch' ? false : null, kind: error.kind ?? 'grader_error', error: error.message};}
  const result = {schemaVersion: 1, mode: config.mode, id: descriptor?.id, taskId: descriptor?.taskId, lang: descriptor?.lang, ...final, counts, expectedTests: config.expectedTests ?? null,
    latencyMs: Date.now() - started, workspace, restored, reports,
    calls: calls.map(({stdout, stderr, ...call}) => call)};
  await writeFile(join(results, 'result.json'), json(result));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [configPath = '/config/grader.json', extra] = process.argv.slice(2);
  if (extra) throw Error('Usage: node poly27-grader-entry.mjs [/config/grader.json]');
  const config = JSON.parse(await readFile(configPath, 'utf8')), result = await runGrader({config});
  console.log(json({mode: result.mode, taskId: result.taskId, status: result.status, counts: result.counts, kind: result.kind}));
  process.exitCode = result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : 2;
}
