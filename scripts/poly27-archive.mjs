// Post-run evidence only. Never reads auth stores or invokes models/graders.
import {readFile, writeFile, mkdir, readdir, lstat, realpath} from 'node:fs/promises';
import {resolve, join, relative, dirname, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateRawSync, inflateRawSync} from 'node:zlib';

const project = resolve(import.meta.dirname, '..'), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const inside = (root, path) => {const rel = relative(root, path); return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);};
const terminal = new Set(['completed', 'failed', 'timeout', 'timed_out', 'budget_stopped', 'cost_unknown', 'infrastructure_error', 'operational_failure', 'closure_failure', 'verification_failed', 'unverified', 'interrupted', 'cancelled', 'aborted', 'overflow', 'error', 'unavailable', 'invalid_result', 'protocol_failure', 'policy_violation', 'source_violation']);
const rootFiles = ['plan.json', 'execution-started.json', 'execution-complete.json', 'reference-validation.json', 'grades.json', 'summary.json', 'public-tasks.json', 'manifest.json', 'preparation.json', 'inspection.json', 'model-canaries.json', 'runtime-stage.json', 'toolchain-stage.json', 'audit.json', 'audit-review.json', 'contract-caveats.json', 'task-results.csv', 'cargo-lock-audit-probe.json'];
const rootDirectories = ['fixtures', 'evaluators', 'preflight', 'evaluation', 'attempts', 'execution-relay'];
const blockedParts = /^(?:private-auth|auth(?:[._-].*)?|credentials?(?:[._-].*)?|secrets?(?:[._-].*)?|tokens?(?:[._-].*)?|client[_-]secret(?:[._-].*)?|\.env(?:\..*)?|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|\.git|\.codex|\.ssh|\.aws|\.gnupg|\.config|node_modules|build-context|native-archives?|host-config|host-homes?|homes?|\.gradle|gradle-cache|target|build|__pycache__|\.pytest_cache)$/i;
const opaqueExtensions = /\.(?:zip|gz|tgz|tar|xz|7z|exe|dll|bin|so|wasm|class|o|a|rlib|pdb|pyc|pyo|pem|p12|pfx|key)$/i;
export function excludedEvidencePath(path) {
  const parts = String(path).replaceAll('\\', '/').split('/');
  if (parts.some(part => blockedParts.test(part))) return 'credential, host-home, dependency, build or VCS path';
  if (opaqueExtensions.test(parts.at(-1))) return 'opaque archive or generated binary';
  return null;
}
function zipPath(path) {
  if (typeof path !== 'string' || !path || /[\\\0:]/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe evidence archive path');
  return path;
}
export function assertNoSecrets(bytes, path = 'selected evidence') {
  const text = Buffer.from(bytes).toString('utf8');
  const detectors = [
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
    /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|ya29\.[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    /["'](?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret)["']\s*:\s*["'][A-Za-z0-9_.~+\/-]{20,}["']/i,
    /["'](?:password|secret)["']\s*:\s*["'][A-Za-z0-9_.~+\/-]{8,}["']/i,
    /\b(?:authorization\s*[:=]\s*["']?bearer\s+|_authToken\s*=\s*)[A-Za-z0-9_.~+\/-]{20,}/i,
  ];
  if (detectors.some(pattern => pattern.test(text))) throw Error(`Potential credential material detected in ${path}; archive aborted (value withheld)`);
}
const crcTable = Uint32Array.from({length: 256}, (_, value) => {for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value >>> 0;});
const crc32 = bytes => {let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0;};

// Deterministic UTF-8 deflate ZIP, deliberately bounded below ZIP64 limits.
export function createEvidenceZip(entries) {
  if (!Array.isArray(entries) || entries.length > 60_000) throw Error('ZIP entry bound exceeded');
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path)), seen = new Set(), local = [], central = []; let offset = 0;
  for (const entry of sorted) {
    zipPath(entry.path); if (seen.has(entry.path.toLowerCase())) throw Error('Duplicate/case-colliding ZIP entry'); seen.add(entry.path.toLowerCase());
    const bytes = Buffer.from(entry.bytes), name = Buffer.from(entry.path), compressed = deflateRawSync(bytes, {level: 9}), crc = crc32(bytes);
    if (name.length > 65535 || bytes.length > 64 * 1024 * 1024 || offset + compressed.length > 0x7fffffff) throw Error('ZIP size bound exceeded');
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(0x314, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8); record.writeUInt16LE(8, 10); record.writeUInt16LE(33, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE((((0o100000 | (entry.mode ?? 0o644)) << 16) | 32) >>> 0, 38); record.writeUInt32LE(offset, 42);
    local.push(header, name, compressed); central.push(record, name); offset += header.length + name.length + compressed.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(sorted.length, 8); end.writeUInt16LE(sorted.length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, index, end]);
}
export function auditEvidenceZip(archive, expected) {
  const bytes = Buffer.from(archive), end = bytes.length - 22;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 20) !== 0) throw Error('Invalid ZIP end record');
  const count = bytes.readUInt16LE(end + 10), centralOffset = bytes.readUInt32LE(end + 16), centralSize = bytes.readUInt32LE(end + 12), names = new Set(), records = [];
  const wanted = new Map(expected.map(row => [row.path, row]));
  if (count !== expected.length || wanted.size !== expected.length || centralOffset + centralSize !== end) throw Error('ZIP inventory/count mismatch');
  let cursor = centralOffset;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50 || bytes.readUInt16LE(cursor + 8) !== 0x800 || bytes.readUInt16LE(cursor + 10) !== 8) throw Error('Unsupported ZIP central entry');
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), compressedSize = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24), crc = bytes.readUInt32LE(cursor + 16), localOffset = bytes.readUInt32LE(cursor + 42);
    const path = zipPath(bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')), wantedEntry = wanted.get(path);
    if (!wantedEntry || names.has(path) || size !== wantedEntry.bytes || (bytes.readUInt32LE(cursor + 38) >>> 16 & 0o777) !== (wantedEntry.mode ?? 0o644) || size > 64 * 1024 * 1024 || localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw Error('ZIP entry differs from source inventory');
    names.add(path);
    const localNameLength = bytes.readUInt16LE(localOffset + 26), localExtraLength = bytes.readUInt16LE(localOffset + 28), dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8') !== path || dataStart + compressedSize > centralOffset || bytes.readUInt32LE(localOffset + 14) !== crc || bytes.readUInt32LE(localOffset + 18) !== compressedSize || bytes.readUInt32LE(localOffset + 22) !== size) throw Error('ZIP local header mismatch');
    const data = inflateRawSync(bytes.subarray(dataStart, dataStart + compressedSize), {maxOutputLength: Math.max(1, size)});
    if (data.length !== size || crc32(data) !== crc || sha(data) !== wantedEntry.sha256) throw Error('ZIP extracted bytes differ from original source');
    records.push({path, bytes: size, sha256: sha(data)}); cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end) throw Error('ZIP central index length mismatch');
  return records;
}

async function state(root) {
  const planBytes = await readFile(join(root, 'plan.json')), plan = JSON.parse(planBytes), started = await read(join(root, 'execution-started.json')), executionBytes = await readFile(join(root, 'execution-complete.json')), execution = JSON.parse(executionBytes), grades = await read(join(root, 'grades.json')), complete = await read(join(root, 'evaluation/grading-complete.json'));
  const planSha256 = sha(planBytes);
  if (started.planSha256 !== planSha256 || execution.closed !== true || execution.planSha256 !== planSha256 || !Array.isArray(execution.attempts) || execution.attempts.length !== 54 || new Set(execution.attempts.map(row => row.id)).size !== 54 || execution.attempts.some(row => !terminal.has(row.status))) throw Error('Evidence requires all 54 terminal attempts closed against the frozen plan');
  if (!Array.isArray(grades.grades) || grades.grades.length !== 54 || new Set(grades.grades.map(row => row.id)).size !== 54 || execution.attempts.some(row => !grades.grades.some(g => g.id === row.id && [true, false, null].includes(g.accepted)))) throw Error('Evidence requires all 54 grading rows, including explicit ungraded failures');
  if (!Array.isArray(plan.schedule) || plan.schedule.length !== 54 || plan.schedule.some(row => !execution.attempts.some(attempt => attempt.id === row.id && attempt.taskId === row.taskId && attempt.strategy === row.strategy))) throw Error('Execution differs from frozen schedule');
  if (grades.planSha256 !== planSha256 || complete.planSha256 !== planSha256 || complete.executionSha256 !== sha(executionBytes) || grades.executionSha256 !== sha(executionBytes) || complete.gradesSha256 !== sha(await readFile(join(root, 'grades.json'))) || complete.summarySha256 !== sha(await readFile(join(root, 'summary.json')))) throw Error('Final grading receipts differ');
  const frozen = new Map();
  for (const file of [...(plan.runtimeFiles ?? []), ...(plan.evaluationFiles ?? [])]) {
    if (!isAbsolute(file.path) || excludedEvidencePath(file.path)) throw Error('Frozen evidence inventory contains an unsafe/excluded path');
    const stat = await lstat(file.path); if (!stat.isFile() || stat.isSymbolicLink() || sha(await readFile(file.path)) !== file.sha256) throw Error(`Frozen evidence file changed: ${file.path}`);
    frozen.set(resolve(file.path), file.sha256);
  }
  if (!plan.runtimeFiles?.length || !plan.evaluationFiles?.length) throw Error('Frozen runtime/evaluation inventories missing');
  for (const attempt of execution.attempts) if (attempt.patchPath && attempt.patchSha256) {
    if (!isAbsolute(attempt.patchPath) || !inside(root, resolve(attempt.patchPath)) || excludedEvidencePath(attempt.patchPath)) throw Error('Unsafe sealed patch path');
    if (sha(await readFile(attempt.patchPath)) !== attempt.patchSha256) throw Error('Sealed actor patch changed');
  } else if (!['closure_failure', 'infrastructure_error'].includes(attempt.status)) throw Error('Non-infrastructure attempt lacks a sealed patch');
  return {plan, execution, grades, frozen, planSha256};
}
export async function archiveCohort(directory, reportDirectory, {repoRoot = project} = {}) {
  const root = await realpath(resolve(directory)), report = resolve(reportDirectory), repository = await realpath(resolve(repoRoot));
  if (inside(root, report)) throw Error('Evidence output must be outside the live cohort');
  const before = await state(root), entries = [], sources = [], excluded = []; let totalBytes = 0;
  const add = async (source, path, {runtime = false} = {}) => {
    const reason = excludedEvidencePath(path);
    if (reason) {excluded.push({path, reason}); return;}
    const stat = await lstat(source); if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`Nonregular selected evidence: ${path}`);
    if (stat.size > 64 * 1024 * 1024 || (totalBytes += stat.size) > 768 * 1024 * 1024 || sources.length >= 60_000) throw Error('Evidence size bound exceeded');
    if (path.endsWith('.jar') && !before.frozen.has(resolve(source))) {excluded.push({path, reason: 'unfrozen binary'}); return;}
    const bytes = await readFile(source);
    if (!path.endsWith('.jar')) {
      let text; try {text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);} catch {excluded.push({path, reason: 'opaque non-UTF-8 bytes'}); return;}
      if (text.includes('\0')) {excluded.push({path, reason: 'opaque binary bytes'}); return;}
    }
    assertNoSecrets(bytes, path);
    const row = {path: zipPath(path), bytes, mode: stat.mode & 0o777};
    sources.push({source, path, bytes: bytes.length, sha256: sha(bytes), mode: row.mode, archive: runtime ? 'runtime.zip' : 'results-evidence.zip'}); entries.push({...row, runtime});
  };
  const walk = async (source, prefix) => {
    for (const entry of (await readdir(source, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${prefix}/${entry.name}`, full = join(source, entry.name), reason = excludedEvidencePath(path);
      if (reason) {excluded.push({path, reason}); continue;}
      const stat = await lstat(full); if (stat.isSymbolicLink()) throw Error(`Symlink in selected evidence: ${path}`);
      if (stat.isDirectory()) await walk(full, path); else await add(full, path);
    }
  };
  for (const name of rootFiles) {
    try {await add(join(root, name), name);} catch (error) {if (error.code !== 'ENOENT' || ['plan.json', 'execution-started.json', 'execution-complete.json', 'reference-validation.json', 'grades.json', 'summary.json', 'public-tasks.json'].includes(name)) throw error;}
  }
  for (const name of rootDirectories) {try {await walk(join(root, name), name);} catch (error) {if (error.code !== 'ENOENT') throw error;}}
  for (const file of before.plan.runtimeFiles) {
    const source = resolve(file.path); if (!inside(repository, source)) throw Error('Runtime source is outside the explicit repository root');
    await add(source, `runtime/${relative(repository, source).split(sep).join('/')}`, {runtime: true});
  }
  await add(fileURLToPath(import.meta.url), 'packager/poly27-archive.mjs', {runtime: true});
  const sourceInventory = sources.map(({source, ...row}) => row), inventoryBytes = Buffer.from(json({schemaVersion: 1, planSha256: before.planSha256, files: sourceInventory, excluded}));
  assertNoSecrets(inventoryBytes, 'evidence-files.json');
  const archives = [];
  for (const [name, runtime] of [['results-evidence.zip', false], ['runtime.zip', true]]) {
    const selected = entries.filter(row => row.runtime === runtime), expected = sourceInventory.filter(row => row.archive === name);
    const zip = createEvidenceZip(selected), verified = auditEvidenceZip(zip, expected);
    archives.push({name, zip, sha256: sha(zip), bytes: zip.length, verifiedEntries: verified.length, unpackedBytes: expected.reduce((sum, row) => sum + row.bytes, 0)});
  }
  // Recheck original files after ZIP extraction; artifacts never replace missing/failed attempts.
  for (const file of sources) if (sha(await readFile(file.source)) !== file.sha256) throw Error('Selected source changed while packaging');
  await state(root);
  await mkdir(report, {recursive: true});
  const outputs = [...archives.map(row => row.name), 'evidence-files.json', 'archive.json', ...rootFiles.filter(name => sources.some(row => row.path === name))];
  for (const name of outputs) {try {await lstat(join(report, name)); throw Error('Refusing to replace an existing evidence artifact');} catch (error) {if (error.code !== 'ENOENT') throw error;}}
  for (const archive of archives) {await writeFile(join(report, archive.name), archive.zip, {flag: 'wx'}); auditEvidenceZip(await readFile(join(report, archive.name)), sourceInventory.filter(row => row.archive === archive.name));}
  for (const name of rootFiles) {const entry = entries.find(row => row.path === name); if (entry) await writeFile(join(report, name), entry.bytes, {flag: 'wx'});}
  await writeFile(join(report, 'evidence-files.json'), inventoryBytes, {flag: 'wx'});
  const receipt = {schemaVersion: 1, at: new Date().toISOString(), planSha256: before.planSha256, scheduled: 54, graded: before.grades.grades.filter(row => typeof row.accepted === 'boolean').length, ungraded: before.grades.grades.filter(row => row.accepted === null).length,
    inventorySha256: sha(inventoryBytes), credentialScan: 'No detected secrets in selected bytes; credential/home/build paths excluded without reading', excludedEntries: excluded.length,
    archives: archives.map(({zip, ...row}) => row)};
  await writeFile(join(report, 'archive.json'), json(receipt), {flag: 'wx'}); return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, report, extra] = process.argv.slice(2); if (!root || !report || extra) throw Error('Usage: node scripts/poly27-archive.mjs <closed-cohort-root> <new-report-directory>');
  console.log(json(await archiveCohort(root, report)));
}
