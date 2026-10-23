// Prepare actor inputs and separate evaluator payloads. This file never runs a model or a grader.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {mkdir, readFile, writeFile, lstat, realpath} from 'node:fs/promises';
import {resolve, dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE = Object.freeze({
  repository: 'https://github.com/Aider-AI/polyglot-benchmark',
  revision: '7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f',
  archiveSha256: '331eb06fddbbc145e4a800b34c5afc2209b3664ce9a3267604fd9550b60bc68f',
  archiveBytes: 6265518,
});
const repo = resolve(import.meta.dirname, '..');
const languages = new Set(['cpp', 'go', 'java', 'javascript', 'python', 'rust']);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

// Frozen crates.io registry records, verified before any actor attempt. Cargo.lock
// includes the full default-feature dependency graph and registry checksums.
export const RUST_CRATE_PINS = Object.freeze({
  'regex': {version: '1.11.1', checksum: 'b544ef1b4eac5dc2db33ea63606ae9ffcfac26c1416a2806ae0bf5f56b201191', dependencies: ['aho-corasick', 'memchr', 'regex-automata', 'regex-syntax']},
  'regex-automata': {version: '0.4.9', checksum: '809e8dc61f6de73b46c85f4c96486310fe304c434cfa43669d7b40f711150908', dependencies: ['aho-corasick', 'memchr', 'regex-syntax']},
  'regex-syntax': {version: '0.8.5', checksum: '2b15c43186be67a4fd63bee50d0303afffcef381492ebe2c5d87f324e1b8815c', dependencies: []},
  'aho-corasick': {version: '1.1.3', checksum: '8e60d3430d3a69478ad0993f19238d2df97c507009a52b3c10addcd7f6bcb916', dependencies: ['memchr']},
  'memchr': {version: '2.7.4', checksum: '78ca9ab1a0babb1e7d5695e3530886289c18cf2f87ec19a575a0abdce112e3a3', dependencies: []},
  'num-bigint': {version: '0.4.6', checksum: 'a5e44f723f1133c9deac646763579fdb3ac745e418f2a7af9cd0c431da1f20b9', dependencies: ['num-integer', 'num-traits']},
  'num-integer': {version: '0.1.46', checksum: '7969661fd2958a5cb096e56c8e1ad0444ac2bbcd0061bd28660485a44879858f', dependencies: ['num-traits']},
  'num-traits': {version: '0.2.19', checksum: '071dfc062690e90b734c0b2273ce72ad0ffa95f0c74596bc250dcfd960262841', dependencies: ['autocfg']},
  'autocfg': {version: '1.4.0', checksum: 'ace50bade8e6234aa140d9a2f552bbee1db4d353f69b8217bc503490fc1a9f26', dependencies: []},
});
const rustDependencies = {'rust/pig-latin': ['regex'], 'rust/decimal': ['num-bigint', 'num-traits']};
export function supplementRustBuild(taskId, publicFiles) {
  const direct = rustDependencies[taskId]; if (!direct) return null;
  const original = publicFiles.get('Cargo.toml'); if (!original || publicFiles.has('Cargo.lock')) throw Error('Unexpected original Rust build files');
  const text = original.bytes.toString('utf8');
  if (/^\[dependencies\]/m.test(text)) throw Error('Original dependency declarations changed');
  const name = text.match(/^name\s*=\s*"([^"]+)"/m)?.[1], version = text.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!name || !version) throw Error('Original Cargo package identity missing');
  const all = new Set(), visit = dependency => {if (all.has(dependency)) return; const pin = RUST_CRATE_PINS[dependency]; if (!pin) throw Error(`Unpinned Rust dependency: ${dependency}`); all.add(dependency); pin.dependencies.forEach(visit);};
  direct.forEach(visit);
  const dependencies = Object.fromEntries(direct.map(dependency => [dependency, RUST_CRATE_PINS[dependency].version]));
  const manifest = Buffer.from(text.trimEnd() + '\n\n# Frozen public benchmark build dependencies; available to both agents.\n[dependencies]\n' +
    direct.map(dependency => `${dependency} = "=${RUST_CRATE_PINS[dependency].version}"`).join('\n') + '\n');
  const packageBlock = (packageName, packageVersion, packageDependencies, checksum) => `[[package]]\nname = ${JSON.stringify(packageName)}\nversion = ${JSON.stringify(packageVersion)}\n` +
    (checksum ? `source = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = ${JSON.stringify(checksum)}\n` : '') +
    (packageDependencies.length ? `dependencies = [\n${packageDependencies.map(d => ` ${JSON.stringify(d)},`).join('\n')}\n]\n` : '');
  const packages = [...all].map(dependency => ({name: dependency, ...RUST_CRATE_PINS[dependency]}));
  packages.push({name, version, dependencies: direct}); packages.sort((a, b) => a.name.localeCompare(b.name));
  const lock = Buffer.from('# Frozen benchmark dependency resolution; registry checksums verified against crates.io.\nversion = 3\n\n' +
    packages.map(p => packageBlock(p.name, p.version, p.dependencies, p.checksum)).join('\n'));
  publicFiles.set('Cargo.toml', {bytes: manifest, mode: original.mode}); publicFiles.set('Cargo.lock', {bytes: lock, mode: 0o644});
  return {kind: 'public-rust-build-dependencies', requiredToolchain: '1.85.1', minimumReferenceRustVersion: taskId === 'rust/pig-latin' ? '1.80.0' : '1.60.0',
    origin: 'Build support for imports in the pinned upstream reference; the same public manifest and lockfile are supplied to both arms before execution. No reference implementation or acceptance assertions are exposed.',
    originalFiles: [{path: 'Cargo.toml', sha256: sha256(original.bytes), bytes: original.bytes.length}],
    suppliedFiles: [{path: 'Cargo.toml', sha256: sha256(manifest), bytes: manifest.length}, {path: 'Cargo.lock', sha256: sha256(lock), bytes: lock.length}],
    dependencies, registryPins: Object.fromEntries([...all].sort().map(dependency => [dependency, RUST_CRATE_PINS[dependency]]))};
}

export function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || /[\\\0:]/.test(value) || value.startsWith('/') ||
      value.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error(`Unsafe relative path: ${value}`);
  return value;
}
function paxFields(bytes) {
  const out = {};
  for (let at = 0; at < bytes.length;) {
    const space = bytes.indexOf(32, at), length = Number(bytes.subarray(at, space).toString());
    if (space <= at || !Number.isSafeInteger(length) || length < 5 || at + length > bytes.length || bytes[at + length - 1] !== 10) throw Error('Invalid PAX record');
    const record = bytes.subarray(space + 1, at + length - 1).toString(), equal = record.indexOf('=');
    if (equal < 1 || Object.hasOwn(out, record.slice(0, equal))) throw Error('Invalid or duplicate PAX field');
    out[record.slice(0, equal)] = record.slice(equal + 1); at += length;
  }
  if (Object.keys(out).some(k => /sparse/i.test(k) || ['linkpath', 'size'].includes(k))) throw Error('Unsupported PAX link/size/sparse metadata');
  return out;
}

// Validate the entire tar before writing any archive member; links are never extracted.
export function unpackSourceArchive(bytes, prefix = `polyglot-benchmark-${SOURCE.revision}`) {
  safeRelativePath(prefix);
  const tar = gunzipSync(bytes, {maxOutputLength: 256 * 1024 * 1024});
  const files = new Map(), names = new Map();
  const text = b => b.toString('utf8').replace(/\0.*$/s, '');
  let nextPax = {}, longName, ended = false;
  for (let at = 0; at + 512 <= tar.length;) {
    const header = tar.subarray(at, at + 512); at += 512;
    if (header.every(b => b === 0)) {ended = true; break;}
    const checksum = Number.parseInt(text(header.subarray(148, 156)).trim(), 8);
    const actual = [...header].reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    if (checksum !== actual) throw Error('Invalid tar checksum');
    const size = Number.parseInt(text(header.subarray(124, 136)).trim() || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0 || at + Math.ceil(size / 512) * 512 > tar.length) throw Error('Invalid tar member size');
    const body = tar.subarray(at, at + size); at += Math.ceil(size / 512) * 512;
    const type = String.fromCharCode(header[156] || 48);
    if (type === 'g') {const fields = paxFields(body); if ('path' in fields) throw Error('Global PAX path forbidden'); continue;}
    if (type === 'x') {nextPax = paxFields(body); continue;}
    if (type === 'L') {longName = text(body); continue;}
    const name = (nextPax.path || longName || [text(header.subarray(345, 500)), text(header.subarray(0, 100))].filter(Boolean).join('/')).replace(/\/$/, '');
    nextPax = {}; longName = undefined; safeRelativePath(name);
    if (!['0', '5'].includes(type)) throw Error(`Nonregular archive member (${type}): ${name}`);
    if (name !== prefix && !name.startsWith(prefix + '/')) throw Error(`Unexpected archive root: ${name}`);
    if (names.has(name.toLowerCase())) throw Error(`Duplicate or case-colliding archive member: ${name}`);
    names.set(name.toLowerCase(), type);
    if (type === '5') {if (size) throw Error('Nonempty tar directory'); continue;}
    const path = name.slice(prefix.length + 1); safeRelativePath(path);
    if (files.size >= 30000) throw Error('Source archive has too many files');
    files.set(path, {bytes: Buffer.from(body), mode: Number.parseInt(text(header.subarray(100, 108)).trim() || '0', 8) & 0o777});
  }
  if (!ended || !files.size || longName || Object.keys(nextPax).length) throw Error('Incomplete source archive');
  for (const name of names.keys()) for (let i = name.indexOf('/'); i >= 0; i = name.indexOf('/', i + 1)) {
    if (names.get(name.slice(0, i)) === '0') throw Error('Archive file/directory collision');
  }
  return files;
}

const publicApis = {
  'cpp/sublist': 'namespace sublist { enum class List_comparison { equal, sublist, superlist, unequal }; List_comparison sublist(const std::vector<int>&, const std::vector<int>&); }',
  'cpp/phone-number': 'namespace phone_number { class phone_number { public: phone_number(const std::string&); std::string area_code() const; std::string number() const; explicit operator std::string() const; }; }',
  'cpp/all-your-base': 'namespace all_your_base { std::vector<unsigned int> convert(unsigned int input_base, const std::vector<unsigned int>& input_digits, unsigned int output_base); }',
  'cpp/complex-numbers': 'namespace complex_numbers { class Complex { public: Complex(double real, double imaginary); Complex operator+(const Complex&) const; Complex operator-(const Complex&) const; Complex operator*(const Complex&) const; Complex operator/(const Complex&) const; double abs() const; Complex conj() const; double real() const; double imag() const; Complex exp() const; }; bool operator==(const Complex&, const Complex&); std::ostream& operator<<(std::ostream&, const Complex&); }\nAlso provide free arithmetic operators +, -, *, / for (Complex, double) and (double, Complex).',
  'javascript/alphametics': 'solve(puzzle: string): Record<string, number> | null. Return the letter-to-digit assignment, or null when no solution exists.',
  'javascript/house': 'House.verse(verseNumber: number): string[] returns the lines of one verse, numbered from 1. House.verses(start: number, end: number): string[] returns the inclusive verse range, with an empty string between verses.',
  'javascript/two-bucket': 'new TwoBucket(size1: number, size2: number, goal: number, start: "one" | "two"). solve(): {moves: number, goalBucket: "one" | "two", otherBucket: number}.',
  'javascript/grade-school': 'new GradeSchool(). add(student: string, grade: number): void. grade(grade: number): string[] returns alphabetically sorted students. roster(): Record<number, string[]> groups students by grade. A student has one grade; adding the same student again updates that grade.',
};
const isExtraTest = path => /(?:^|\/)(?:tests?|benches)\//i.test(path) || /(?:_test\.(?:go|py|cpp)|\.(?:spec|test)\.[cm]?[jt]s|Test\.java)$/i.test(path);
const cppHarness = new Set(['test/catch.hpp', 'test/tests-main.cpp']);
export function selectTaskFiles(sourceFiles, task) {
  const [lang, name, extra] = String(task.taskId).split('/');
  if (!languages.has(lang) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || extra !== undefined) throw Error(`Invalid taskId: ${task.taskId}`);
  const prefix = `${lang}/exercises/practice/${name}/`, exercise = new Map();
  for (const [path, record] of sourceFiles) if (path.startsWith(prefix)) exercise.set(path.slice(prefix.length), record);
  const configBytes = exercise.get('.meta/config.json')?.bytes;
  if (!configBytes) throw Error(`Missing canonical metadata: ${task.taskId}`);
  const config = JSON.parse(configBytes.toString()), files = config.files;
  if (!files || !['solution', 'test', 'example'].every(k => Array.isArray(files[k]) && files[k].length)) throw Error(`Incomplete canonical files metadata: ${task.taskId}`);
  for (const [key, paths] of Object.entries(files)) {
    if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string')) throw Error(`Invalid metadata file list: ${key}`);
    for (const path of paths) {safeRelativePath(path); if (!exercise.has(path)) throw Error(`Metadata file missing: ${task.taskId}/${path}`);}
  }
  const hiddenPaths = new Set(files.test), examples = new Set(files.example), publicFiles = new Map(), hiddenTests = new Map(), referenceFiles = new Map();
  for (const path of exercise.keys()) if (isExtraTest(path) && !(lang === 'cpp' && cppHarness.has(path))) hiddenPaths.add(path);
  for (const path of files.solution) if (hiddenPaths.has(path) || examples.has(path) || path.split('/').some(p => ['.meta', '.approaches'].includes(p))) throw Error(`Solution overlaps hidden inputs: ${path}`);
  for (const [path, record] of exercise) {
    if (hiddenPaths.has(path)) {hiddenTests.set(path, record); continue;}
    if (examples.has(path)) {referenceFiles.set(path, record); continue;}
    if (path.split('/').some(p => ['.meta', '.approaches'].includes(p))) continue;
    if (path.startsWith('.docs/') && !/^\.docs\/(?:instructions(?:\.append)?|introduction)\.md$/.test(path)) continue;
    publicFiles.set(path, record);
  }
  if (!publicFiles.has('.docs/instructions.md') || files.solution.some(p => !publicFiles.has(p))) throw Error(`Incomplete public input: ${task.taskId}`);
  const referenceMapping = files.example.map((from, i) => ({from, to: files.solution[i] ?? join(dirname(files.solution[0]), from.split('/').at(-1)).split(sep).join('/')}));
  return {lang, name, publicFiles, hiddenTests, referenceFiles, config, configBytes, referenceMapping, publicApi: publicApis[task.taskId] ?? null};
}

export function buildMetadata(lang, publicFiles) {
  const configPaths = [...publicFiles.keys()].filter(p => /(?:^|\/)(?:package\.json|Cargo\.toml|go\.mod|build\.gradle|gradle-wrapper\.properties|CMakeLists\.txt)$/.test(p));
  const configurations = configPaths.map(path => ({path, sha256: sha256(publicFiles.get(path).bytes), content: publicFiles.get(path).bytes.toString('utf8')}));
  const specs = {
    cpp: {binaries: ['cmake', 'C++17 compiler'], steps: [['cmake', '-S', '.', '-B', 'build', '-DEXERCISM_RUN_ALL_TESTS=ON'], ['cmake', '--build', 'build', '--config', 'Debug']], notes: ['Keep the exercise slug as the workspace basename: canonical CMake derives source names from it.', 'The default ALL build target runs the Catch test executable; ctest alone is insufficient.']},
    go: {binaries: ['go'], steps: [['go', 'test', '-json', '-count=1', './...']]},
    java: {binaries: ['java', 'Gradle wrapper'], steps: [['./gradlew', 'test', '--no-daemon']], windowsSteps: [['cmd.exe', '/d', '/c', 'gradlew.bat', 'test', '--no-daemon']], notes: ['Warm and freeze Gradle distribution plus Maven dependencies before offline grading.']},
    javascript: {binaries: ['node', 'npm'], steps: [['npm', 'test', '--', '--runInBand']], notes: ['Install and lock the declared Jest/Babel dependencies before grading. npm test without hidden files is not an acceptance check.']},
    python: {binaries: ['python with pytest'], steps: [['python', '-m', 'pytest', '-q', '-rA']]},
    rust: {binaries: ['cargo', 'rustc'], steps: [['cargo', 'test', '--', '--include-ignored']]},
  };
  return {...specs[lang], configurations, dependencyResolutionFrozen: lang === 'rust' && publicFiles.has('Cargo.lock'),
    activation: lang === 'java' ? {name: 'remove-disabled-annotations', pattern: '@Disabled\\([^)]*\\)\\s*\\n', replacement: ''} :
      lang === 'javascript' ? {name: 'activate-xtest', pattern: 'xtest\\(', replacement: 'test('} : null};
}
const inventory = files => [...files].map(([path, {bytes, mode}]) => ({path, bytes: bytes.length, sha256: sha256(bytes), mode})).sort((a, b) => a.path.localeCompare(b.path));
async function writeNewOrIdentical(root, path, bytes, mode = 0o644) {
  safeRelativePath(path); const destination = resolve(root, ...path.split('/'));
  if (relative(root, destination).startsWith('..' + sep)) throw Error('Output escaped root');
  const parts = relative(root, dirname(destination)).split(sep).filter(Boolean); let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {const stat = await lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error(`Unsafe output ancestor: ${current}`);}
    catch (error) {if (error.code !== 'ENOENT') throw error; await mkdir(current);}
  }
  try {const stat = await lstat(destination); if (!stat.isFile() || stat.isSymbolicLink() || !(await readFile(destination)).equals(Buffer.from(bytes))) throw Error(`Refusing to replace existing output: ${destination}`);}
  catch (error) {if (error.code !== 'ENOENT') throw error; await writeFile(destination, bytes, {flag: 'wx', mode});}
}

export async function preparePoly27({output, manifestPath = join(repo, 'config/bench-manifest.polyglot27.json'), archivePath} = {}) {
  if (!output) throw Error('An explicit output directory is required');
  const manifestBytes = await readFile(manifestPath), tasks = JSON.parse(manifestBytes);
  if (!Array.isArray(tasks) || tasks.length !== 27 || new Set(tasks.map(t => t.taskId)).size !== 27) throw Error('Expected exactly 27 distinct manifest tasks');
  let archive;
  if (archivePath) archive = await readFile(archivePath);
  else {
    const response = await fetch(`https://codeload.github.com/Aider-AI/polyglot-benchmark/tar.gz/${SOURCE.revision}`, {signal: AbortSignal.timeout(120_000)});
    if (!response.ok) throw Error(`Source download failed: ${response.status}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {size += chunk.length; if (size > 16 * 1024 * 1024) throw Error('Source download exceeds cap'); chunks.push(chunk);}
    archive = Buffer.concat(chunks);
  }
  if (sha256(archive) !== SOURCE.archiveSha256 || archive.length !== SOURCE.archiveBytes) throw Error('Source archive pin mismatch');
  const sourceFiles = unpackSourceArchive(archive), selected = tasks.map(task => ({task, ...selectTaskFiles(sourceFiles, task)}));
  await mkdir(resolve(output), {recursive: true}); const root = await realpath(resolve(output));
  await writeNewOrIdentical(root, 'preparation/downloads/source.tar.gz', archive);
  await writeNewOrIdentical(root, 'manifest.json', manifestBytes);
  const publicTasks = [], descriptors = [];
  for (const item of selected) {
    const {task, lang, name, publicFiles, hiddenTests, referenceFiles, config, configBytes, referenceMapping, publicApi} = item;
    const environmentSupplement = supplementRustBuild(task.taskId, publicFiles);
    const id = task.taskId.replace('/', '_'), fixtureRel = `fixtures/${id}/${name}`, evaluatorRel = `evaluators/${id}`;
    const instructions = ['.docs/introduction.md', '.docs/instructions.md', '.docs/instructions.append.md'].filter(p => publicFiles.has(p)).map(p => publicFiles.get(p).bytes.toString()).join('\n\n');
    const prompt = `Implement the ${name} exercise in ${lang}. Use the supplied skeleton and public interface. You may create and run your own checks. Preserve the supplied instructions and build configuration.\n\n${instructions}` +
      (publicApi ? `\n\n## Public interface\n\n${publicApi}\n` : '\n') +
      (environmentSupplement ? '\n## Public build environment\n\nRust 1.85.1 is provided. Cargo.toml and Cargo.lock include frozen public dependencies available offline. You may use those libraries. Preserve both build files.\n' : '');
    if (publicFiles.has('TASK.md') || publicFiles.has('PUBLIC-API.md')) throw Error('Generated public instructions collide with canonical files');
    publicFiles.set('TASK.md', {bytes: Buffer.from(prompt), mode: 0o644});
    if (publicApi) publicFiles.set('PUBLIC-API.md', {bytes: Buffer.from(`# Public interface\n\n${publicApi}\n`), mode: 0o644});
    for (const [path, {bytes, mode}] of publicFiles) await writeNewOrIdentical(root, `${fixtureRel}/${path}`, bytes, mode);
    for (const [path, {bytes, mode}] of hiddenTests) await writeNewOrIdentical(root, `${evaluatorRel}/hidden/${path}`, bytes, mode);
    for (const [path, {bytes, mode}] of referenceFiles) await writeNewOrIdentical(root, `${evaluatorRel}/reference/${path}`, bytes, mode);
    await writeNewOrIdentical(root, `${evaluatorRel}/canonical-config.json`, configBytes);
    const actorFiles = inventory(publicFiles), hiddenFiles = inventory(hiddenTests), examples = inventory(referenceFiles);
    const descriptor = {schemaVersion: 1, id, taskId: task.taskId, lang, name, source: SOURCE, files: config.files,
      hiddenTests: hiddenFiles.map(f => f.path), additionalHiddenTests: hiddenFiles.map(f => f.path).filter(p => !config.files.test.includes(p)),
      referenceMapping, publicApiSupplement: publicApi ? {path: 'PUBLIC-API.md', origin: 'Type signatures and return shape transcribed from the pinned public exercise API; no implementation or assertions.'} : null,
      build: buildMetadata(lang, publicFiles), environmentSupplement, actorFiles, hiddenFiles, referenceFiles: examples, canonicalConfigSha256: sha256(configBytes)};
    await writeNewOrIdentical(root, `${evaluatorRel}/descriptor.json`, json(descriptor));
    publicTasks.push({id, taskId: task.taskId, lang, name, prompt, workspace: join(root, ...fixtureRel.split('/')),
      solutionFiles: config.files.solution, immutablePaths: actorFiles.map(f => f.path).filter(p => !config.files.solution.includes(p)), actorFiles,
      graderDescriptor: join(root, ...evaluatorRel.split('/'), 'descriptor.json'), devSeen: task.devSeen === true, contaminated: task.contaminated === true});
    descriptors.push({id, descriptor: `${evaluatorRel}/descriptor.json`, sha256: sha256(json(descriptor)), actorFileCount: actorFiles.length, hiddenFileCount: hiddenFiles.length, referenceFileCount: examples.length});
  }
  await writeNewOrIdentical(root, 'public-tasks.json', json(publicTasks));
  const preparation = {schemaVersion: 1, source: SOURCE, manifestSha256: sha256(manifestBytes), taskCount: publicTasks.length, sourceFiles: sourceFiles.size,
    tasks: descriptors, separation: 'Only fixtures/<id>/<exercise-name> may be copied into actor workspaces. Never expose the preparation or evaluators directories.',
    gradingExecuted: false, modelsExecuted: false, dependencyResolutionFrozen: false};
  await writeNewOrIdentical(root, 'preparation.json', json(preparation));
  return {root, publicTasksPath: join(root, 'public-tasks.json'), preparation};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = {'--output': 'output', '--manifest': 'manifestPath', '--archive': 'archivePath'}[process.argv[i]];
    if (!key || !process.argv[i + 1]) throw Error('Usage: node scripts/poly27-prepare.mjs --output DIRECTORY [--manifest FILE] [--archive PINNED_TAR_GZ]');
    options[key] = process.argv[i + 1];
  }
  const result = await preparePoly27(options);
  console.log(json({root: result.root, publicTasksPath: result.publicTasksPath, taskCount: result.preparation.taskCount,
    source: result.preparation.source, gradingExecuted: false, modelsExecuted: false}));
}
