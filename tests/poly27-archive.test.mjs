import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm, realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {archiveCohort, createEvidenceZip, auditEvidenceZip, excludedEvidencePath, assertNoSecrets} from '../scripts/poly27-archive.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex'), json = value => JSON.stringify(value, null, 2) + '\n';
async function temporary(t) {const root = await realpath(await mkdtemp(join(tmpdir(), 'poly27-archive-test-'))); t.after(() => rm(root, {recursive: true, force: true})); return root;}
async function fixture(t) {
  const base = await temporary(t), root = join(base, 'cohort'), repoRoot = join(base, 'repo'), report = join(base, 'report');
  await mkdir(join(repoRoot, 'src'), {recursive: true}); await mkdir(join(root, 'evaluation'), {recursive: true}); await mkdir(join(root, 'evaluators', 'task0'), {recursive: true});
  const runtime = join(repoRoot, 'src/runtime.mjs'), evaluator = join(root, 'evaluators/task0/descriptor.json'); await writeFile(runtime, 'export const runtime = true;\n'); await writeFile(evaluator, '{"public":true}\n');
  const attempts = [];
  for (let i = 0; i < 54; i++) {
    const id = `task${Math.floor(i / 2)}-r1-${i % 2 ? 'native' : 'v10'}`, directory = join(root, 'attempts', id); await mkdir(join(directory, 'sealed-source'), {recursive: true});
    await writeFile(join(directory, 'sealed-source/source.js'), `export const task = ${i};\n`); await writeFile(join(directory, 'events.jsonl'), json({type: 'public_tool_result', value: 'task code only'}));
    const row = {id, taskId: `task${Math.floor(i / 2)}`, strategy: i % 2 ? 'native' : 'v10', status: i === 53 ? 'infrastructure_error' : 'completed'};
    if (i !== 53) {row.patchPath = join(directory, 'patch.diff'); row.patchSha256 = hash(''); await writeFile(row.patchPath, '');}
    attempts.push(row);
  }
  const plan = {runtimeFiles: [{path: runtime, sha256: hash(await readFile(runtime))}], evaluationFiles: [{path: evaluator, sha256: hash(await readFile(evaluator))}], schedule: attempts.map(({id, taskId, strategy}) => ({id, taskId, strategy}))};
  await writeFile(join(root, 'plan.json'), json(plan)); const planSha256 = hash(json(plan));
  const execution = {closed: true, planSha256, attempts}; await writeFile(join(root, 'execution-complete.json'), json(execution)); const executionSha256 = hash(json(execution));
  await writeFile(join(root, 'execution-started.json'), json({planSha256}));
  const grades = {planSha256, executionSha256, grades: attempts.map((row, i) => ({id: row.id, accepted: i === 53 ? null : i === 0 ? false : true}))};
  await writeFile(join(root, 'grades.json'), json(grades)); await writeFile(join(root, 'summary.json'), json({scheduled: 54, ungraded: 1}));
  await writeFile(join(root, 'reference-validation.json'), json({valid: true})); await writeFile(join(root, 'public-tasks.json'), json(Array.from({length: 27}, (_, i) => ({id: `task${i}`}))));
  await writeFile(join(root, 'evaluation/grading-complete.json'), json({planSha256, executionSha256, gradesSha256: hash(json(grades)), summarySha256: hash(await readFile(join(root, 'summary.json')))}));
  return {root, repoRoot, report, runtime};
}

test('ZIP is deterministic, preserves UTF-8 bytes/modes and rejects corruption or duplicate paths', () => {
  const entries = [{path: 'unicode/naïve.txt', bytes: Buffer.from('hello λ\n'), mode: 0o644}, {path: 'empty.txt', bytes: Buffer.alloc(0), mode: 0o755}];
  const inventory = entries.map(row => ({path: row.path, bytes: row.bytes.length, sha256: hash(row.bytes), mode: row.mode}));
  const zip = createEvidenceZip(entries); assert.deepEqual(zip, createEvidenceZip([...entries].reverse()));
  assert.equal(auditEvidenceZip(zip, inventory).length, 2);
  const corrupt = Buffer.from(zip); corrupt[30 + Buffer.byteLength('empty.txt')] ^= 0x40;
  assert.throws(() => auditEvidenceZip(corrupt, inventory));
  assert.throws(() => createEvidenceZip([...entries, {...entries[0]}]), /Duplicate/);
  assert.throws(() => createEvidenceZip([{path: '../escape', bytes: Buffer.from('x')}]), /Unsafe/);
});

test('Independent Python zipfile implementation verifies produced ZIP contents and CRC', async t => {
  const directory = await temporary(t), path = join(directory, 'independent.zip'), entries = [{path: 'source/é.txt', bytes: Buffer.from('real bytes\n'), mode: 0o644}, {path: 'empty', bytes: Buffer.alloc(0), mode: 0o644}];
  await writeFile(path, createEvidenceZip(entries));
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python, ['-c', 'import zipfile,hashlib,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))', path], {encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), Object.fromEntries(entries.map(row => [row.path, hash(row.bytes)])));
});

test('Credential paths are excluded and detected secrets abort without disclosing their value', () => {
  for (const name of ['private-auth/v10/auth.json', 'preflight/box/.env', 'attempts/x/.codex/auth.json', 'build-context/codex.tar.gz', 'attempts/x/node_modules/file.js']) assert(excludedEvidencePath(name));
  assert.equal(excludedEvidencePath('attempts/x/public-config/actor.json'), null);
  const secret = 'sk-' + 'a'.repeat(30); assert.throws(() => assertNoSecrets(Buffer.from(secret), 'events.jsonl'), error => /value withheld/.test(error.message) && !error.message.includes(secret));
  assert.throws(() => assertNoSecrets(Buffer.from(json({refresh_token: 'b'.repeat(40)}))), /credential/);
  assertNoSecrets(Buffer.from('Public task code; API tokens are never provided.'));
});

test('Full packager retains failed/ungraded attempts, excludes auth/build files and verifies both archives', async t => {
  const {root, repoRoot, report} = await fixture(t);
  await mkdir(join(root, 'private-auth'), {recursive: true}); await writeFile(join(root, 'private-auth/auth.json'), 'opaque credentials must not be opened');
  await mkdir(join(root, 'preflight/box'), {recursive: true}); await writeFile(join(root, 'preflight/box/auth.json'), 'sk-' + 's'.repeat(32)); await writeFile(join(root, 'preflight/box/receipt.json'), '{"passed":true}\n');
  const receipt = await archiveCohort(root, report, {repoRoot}); assert.equal(receipt.scheduled, 54); assert.equal(receipt.graded, 53); assert.equal(receipt.ungraded, 1);
  const inventory = JSON.parse(await readFile(join(report, 'evidence-files.json'))); assert(!inventory.files.some(row => /private-auth|auth\.json/.test(row.path)));
  assert.equal(inventory.files.filter(row => row.path.endsWith('/sealed-source/source.js')).length, 54);
  assert(inventory.excluded.some(row => row.path === 'preflight/box/auth.json'));
  for (const archive of receipt.archives) {const zip = await readFile(join(report, archive.name)); assert.equal(hash(zip), archive.sha256); assert.equal(auditEvidenceZip(zip, inventory.files.filter(row => row.archive === archive.name)).length, archive.verifiedEntries);}
  await assert.rejects(archiveCohort(root, report, {repoRoot}), /Refusing to replace/);
});

test('Raw transcript secrets abort before any archive is written', async t => {
  const {root, repoRoot, report} = await fixture(t), path = join(root, 'attempts/task0-r1-v10/events.jsonl'); await writeFile(path, json({access_token: 'a'.repeat(50)}));
  await assert.rejects(archiveCohort(root, report, {repoRoot}), /credential material.*value withheld/);
  await assert.rejects(readdir(report), {code: 'ENOENT'});
});

test('Changed frozen bytes or incomplete actor closure cannot be packaged', async t => {
  const {root, repoRoot, report, runtime} = await fixture(t);
  await writeFile(runtime, 'changed'); await assert.rejects(archiveCohort(root, report, {repoRoot}), /Frozen evidence file changed/);
  await writeFile(runtime, 'export const runtime = true;\n');
  const path = join(root, 'execution-complete.json'), execution = JSON.parse(await readFile(path)); execution.closed = false; await writeFile(path, json(execution));
  await assert.rejects(archiveCohort(root, report, {repoRoot}), /54 terminal/);
});
