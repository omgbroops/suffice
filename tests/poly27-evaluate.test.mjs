import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {dockerGraderArgs, authenticatedVerdict, validateCohort, gradeCohort, summarizeCohort} from '../scripts/poly27-evaluate.mjs';

const image = 'sha256:' + 'a'.repeat(64), hash = data => createHash('sha256').update(data).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const processResult = (exitCode = 0, stdout = '') => ({exitCode, stdout, stderr: '', timedOut: false, overflow: false, aborted: false, error: null, latencyMs: 1});
const task = {id: 'javascript_fake', taskId: 'javascript/fake', lang: 'javascript'};
const pass = (mode = 'candidate', expectedTests = 3) => ({schemaVersion: 1, ...task, mode, status: 'passed', accepted: true, kind: 'pass', expectedTests, counts: {tests: 3, passed: 3, failed: 0, skipped: 0}, calls: [processResult()]});
const mount = (args, target) => {
  for (let i = 0; i < args.length; i++) if (args[i] === '--mount') {const parts = args[++i].split(','); if (parts.includes(`target=${target}`)) return parts.find(p => p.startsWith('source=')).slice(7);}
  return null;
};
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'poly27-host-evaluate-'))); t.after(() => rm(root, {recursive: true, force: true}));
  const tasks = [];
  for (let i = 0; i < 27; i++) {
    const id = `javascript_task${i}`, workspace = join(root, 'fixtures', id, `task${i}`), graderDescriptor = join(root, 'evaluators', id, 'descriptor.json');
    await mkdir(workspace, {recursive: true}); await mkdir(join(root, 'evaluators', id), {recursive: true});
    const source = 'export function exercise() {}\n'; await writeFile(join(workspace, 'source.js'), source);
    const row = {id, taskId: `javascript/task${i}`, lang: 'javascript', workspace, graderDescriptor, actorFiles: [{path: 'source.js', sha256: hash(source), bytes: Buffer.byteLength(source)}]};
    await writeFile(graderDescriptor, json({id, taskId: row.taskId, lang: row.lang})); tasks.push(row);
  }
  await writeFile(join(root, 'public-tasks.json'), json(tasks)); return {root, tasks};
}
function fakeDocker({modify = result => result, calls = []} = {}) {
  return async (command, args) => {
    assert.equal(command, 'docker'); calls.push(args);
    if (args[0] === 'image') return processResult(0, image + '\n');
    const config = JSON.parse(await readFile(join(mount(args, '/config'), 'grader.json'))), descriptor = JSON.parse(await readFile(mount(args, '/grader/descriptor.json')));
    let result = {schemaVersion: 1, id: descriptor.id, taskId: descriptor.taskId, lang: descriptor.lang, mode: config.mode, expectedTests: config.expectedTests ?? null,
      status: config.mode === 'baseline' ? 'failed' : 'passed', accepted: config.mode !== 'baseline', kind: config.mode === 'baseline' ? 'compile_error' : 'pass', counts: config.mode === 'baseline' ? null : {tests: 3, passed: 3, failed: 0, skipped: 0}, calls: [processResult(config.mode === 'baseline' ? 1 : 0)]};
    result = modify(result, args);
    await writeFile(join(mount(args, '/results'), 'result.json'), json(result));
    return processResult(result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : 2);
  };
}
async function close(root, tasks, validation, {closed = true} = {}) {
  const runtime = join(root, 'runtime.mjs'); await writeFile(runtime, '// frozen test runtime\n');
  const paths = new Set([join(root, 'reference-validation.json'), join(root, 'public-tasks.json'), ...validation.evidenceFiles.map(row => row.path)]);
  const evaluationFiles = await Promise.all([...paths].map(async path => ({path, sha256: hash(await readFile(path))})));
  const attempts = [];
  for (const task of tasks) for (const strategy of ['v10', 'native']) {
    const id = `${task.id}-r1-${strategy}`, attemptPath = join(root, 'attempts', id), patchPath = join(attemptPath, 'patch.diff'); await mkdir(attemptPath, {recursive: true}); await writeFile(patchPath, '');
    attempts.push({id, taskId: task.id, strategy, status: 'completed', attemptPath, patchPath, patchSha256: hash(''), costKnown: true, costUsd: strategy === 'v10' ? 0.01 : 0.1, knownCostFloorUsd: 0, actorLatencyMs: 10, latencyMs: 12, policyValid: true, repairs: 0, takeovers: 0});
  }
  const plan = {graderImage: image, runtimeFiles: [{path: runtime, sha256: hash(await readFile(runtime))}], evaluationFiles, schedule: attempts.map(({id, taskId, strategy}) => ({id, taskId, strategy}))};
  const bytes = json(plan), planSha256 = hash(bytes); await writeFile(join(root, 'plan.json'), bytes);
  await writeFile(join(root, 'execution-started.json'), json({planSha256})); await writeFile(join(root, 'execution-complete.json'), json({closed, planSha256, attempts}));
  return {plan, attempts, runtime};
}

test('Docker grader has only narrow mounts, fixed resources, no network or inherited auth mounts', () => {
  const root = join(tmpdir(), 'source path');
  const args = dockerGraderArgs({image, input: root, grader: join(root, 'grader'), config: join(root, 'config'), results: join(root, 'results'), patch: join(root, 'attempt/patch.diff')});
  assert(args.includes('none')); assert(args.includes('ALL')); assert(args.includes('no-new-privileges')); assert(args.includes('3g')); assert(args.includes('node'));
  assert.equal(args[args.indexOf('--entrypoint') + 1], 'node');
  assert(args.indexOf('--entrypoint') < args.indexOf(image));
  assert.deepEqual(args.slice(args.indexOf(image)), [image, '/opt/suffice/scripts/poly27-grader-entry.mjs']);
  assert.equal(args.filter(arg => arg === '/opt/suffice/scripts/poly27-grader-entry.mjs').length, 1, 'image ENTRYPOINT cannot duplicate the grader script or add CLI arguments');
  assert.equal(args.filter(x => x === '--mount').length, 6);
  assert.equal(mount(args, '/patch/patch.diff'), join(root, 'attempt/patch.diff'));
  assert.equal(mount(args, '/grader'), null, 'candidate code never receives the whole evaluator directory');
  assert.equal(mount(args, '/grader/descriptor.json'), join(root, 'grader/descriptor.json'));
  assert.equal(mount(args, '/grader/hidden'), join(root, 'grader/hidden'));
  assert.equal(mount(args, '/grader/reference'), null, 'candidate code cannot read a reference solution');
  const baseline = dockerGraderArgs({image, input: root, grader: join(root, 'grader'), config: join(root, 'config'), results: join(root, 'results'), mode: 'baseline'});
  assert.equal(mount(baseline, '/grader/reference'), null);
  const gold = dockerGraderArgs({image, input: root, grader: join(root, 'grader'), config: join(root, 'config'), results: join(root, 'results'), mode: 'gold'});
  assert.equal(mount(gold, '/grader/reference'), join(root, 'grader/reference'));
  assert(!args.some(x => /docker\.sock|\.codex|\.suffice\/pi|\/home\//.test(x)));
  assert.throws(() => dockerGraderArgs({image: 'mutable:tag', input: root}), /immutable/);
});

test('Authenticated verdict refuses omitted cases, skips, timeout and exit/result mismatches', () => {
  assert.equal(authenticatedVerdict(pass(), processResult(), {task, mode: 'candidate', expectedTests: 3}).accepted, true);
  assert.equal(authenticatedVerdict({...pass(), counts: {tests: 2, passed: 2, failed: 0, skipped: 0}}, processResult(), {task, mode: 'candidate', expectedTests: 3}).accepted, null);
  assert.equal(authenticatedVerdict({...pass(), counts: {tests: 3, passed: 3, failed: 0, skipped: 1}}, processResult(), {task, mode: 'candidate', expectedTests: 3}).accepted, null);
  assert.equal(authenticatedVerdict(pass(), {...processResult(), timedOut: true}, {task, mode: 'candidate', expectedTests: 3}).accepted, null);
  assert.equal(authenticatedVerdict(pass(), processResult(125), {task, mode: 'candidate', expectedTests: 3}).accepted, null);
});

test('Reference validation runs all 54 fresh graders and records intended baseline failures with full log hashes', async t => {
  const {root} = await fixture(t), calls = [], run = fakeDocker({calls});
  const validation = await validateCohort(root, image, {run, concurrency: 2});
  assert.equal(validation.valid, true); assert.equal(validation.tasks.length, 27); assert.equal(calls.filter(args => args[0] === 'run').length, 54);
  assert(validation.tasks.every(row => row.expectedTests === 3 && row.baseline.result.kind === 'compile_error' && row.gold.verdict.accepted));
  const receipt = JSON.parse(await readFile(validation.tasks[0].gold.receiptPath));
  assert(receipt.evidenceFiles.some(row => row.path.endsWith('docker.stdout.txt')));
  const before = calls.length; await validateCohort(root, image, {run}); assert.equal(calls.length, before + 1, 'sealed validation receipts are reused; only image inspection repeats');
});

test('One infrastructure-only baseline invalidates the whole cohort without dropping its task', async t => {
  const {root} = await fixture(t), calls = [];
  const run = fakeDocker({calls, modify: result => result.id === 'javascript_task0' && result.mode === 'baseline' ? {...result, status: 'unverified', accepted: null, kind: 'toolchain_or_dependency'} : result});
  await assert.rejects(validateCohort(root, image, {run}), /Cohort blocked: 1 of 27/);
  const validation = JSON.parse(await readFile(join(root, 'reference-validation.json')));
  assert.equal(validation.valid, false); assert.equal(validation.tasks.length, 27); assert.equal(calls.filter(args => args[0] === 'run').length, 54);
});

test('Candidate grading rejects incomplete closure before invoking Docker', async t => {
  const {root, tasks} = await fixture(t), validation = await validateCohort(root, image, {run: fakeDocker()}); await close(root, tasks, validation, {closed: false});
  await assert.rejects(gradeCohort(root, image, {run: async () => assert.fail('must not invoke Docker')}), /not closed/);
  await assert.rejects(validateCohort(root, image, {run: fakeDocker()}), /cannot run after actors start/);
});

test('Candidate grading checks frozen plan anchor and all input/patch hashes before Docker', async t => {
  const {root, tasks} = await fixture(t), validation = await validateCohort(root, image, {run: fakeDocker()}), closure = await close(root, tasks, validation);
  await writeFile(join(root, 'execution-started.json'), json({planSha256: '0'.repeat(64)}));
  await assert.rejects(gradeCohort(root, image, {run: async () => assert.fail('no Docker')}), /not closed/);
  await writeFile(join(root, 'execution-started.json'), json({planSha256: hash(await readFile(join(root, 'plan.json')))}));
  await writeFile(closure.runtime, 'changed');
  await assert.rejects(gradeCohort(root, image, {run: async () => assert.fail('no Docker')}), /Frozen file changed/);
  await writeFile(closure.runtime, '// frozen test runtime\n'); await writeFile(closure.attempts[0].patchPath, 'changed patch');
  await assert.rejects(gradeCohort(root, image, {run: async () => assert.fail('no Docker')}), /Sealed patch hash changed/);
});

test('All 54 candidates receive the frozen expected count; omitted cases remain ungraded', async t => {
  const {root, tasks} = await fixture(t), validation = await validateCohort(root, image, {run: fakeDocker()}); await close(root, tasks, validation);
  const calls = [], run = fakeDocker({calls, modify: result => result.id === 'javascript_task0' && result.mode === 'candidate' ? {...result, counts: {tests: 2, passed: 2, failed: 0, skipped: 0}} : result});
  const {grades, summary} = await gradeCohort(root, image, {run});
  assert.equal(calls.filter(args => args[0] === 'run').length, 54); assert.equal(grades.grades.length, 54);
  assert.equal(grades.grades.filter(row => row.accepted === null).length, 2);
  assert.deepEqual(summary.paired, {bothPass: 26, v10Only: 0, nativeOnly: 0, bothFail: 0, ungraded: 1});
  assert(summary.arms.every(arm => arm.graded === 26 && arm.accepted === 26 && arm.scheduled === 27));
  const complete = JSON.parse(await readFile(join(root, 'evaluation/grading-complete.json'))); assert.equal(complete.all54Closed, true);
});

test('A terminal closure failure without a patch stays ungraded while the other 53 sources are scored', async t => {
  const {root, tasks} = await fixture(t), validation = await validateCohort(root, image, {run: fakeDocker()}), {attempts} = await close(root, tasks, validation);
  attempts[0].status = 'closure_failure'; delete attempts[0].patchPath; delete attempts[0].patchSha256;
  const executionPath = join(root, 'execution-complete.json'), execution = JSON.parse(await readFile(executionPath)); execution.attempts = attempts; await writeFile(executionPath, json(execution));
  const calls = [], {grades, summary} = await gradeCohort(root, image, {run: fakeDocker({calls})});
  assert.equal(calls.filter(args => args[0] === 'run').length, 53); assert.equal(grades.sealedPatches, 53);
  assert.deepEqual(grades.unsealedSources, [{id: attempts[0].id, reason: 'closure_failure_missing_patch'}]);
  const missing = grades.grades.find(row => row.id === attempts[0].id); assert.equal(missing.accepted, null); assert.equal(missing.receiptPath, null);
  assert.equal(summary.arms[0].scheduled, 27); assert.equal(summary.arms[0].ungraded, 1); assert.equal(summary.arms[1].accepted, 27);
});

test('A completed attempt with a missing patch blocks grading before any container runs', async t => {
  const {root, tasks} = await fixture(t), validation = await validateCohort(root, image, {run: fakeDocker()}), {attempts} = await close(root, tasks, validation);
  await rm(attempts[0].patchPath);
  await assert.rejects(gradeCohort(root, image, {run: async () => assert.fail('must not run a grader')}), /Sealed patch missing/);
});

test('Summary includes unsuccessful and unknown-cost attempts in the cost floor', () => {
  const execution = {attempts: [{id: 'a', taskId: 'one', strategy: 'v10', costKnown: true, costUsd: 1, policyValid: true, status: 'completed', latencyMs: 10, actorLatencyMs: 8}, {id: 'b', taskId: 'one', strategy: 'native', costKnown: false, costUsd: null, knownCostFloorUsd: 2, policyValid: false, status: 'operational_failure', latencyMs: 20, actorLatencyMs: 18}]};
  const result = summarizeCohort(execution, [{id: 'a', accepted: true}, {id: 'b', accepted: false}]);
  assert.equal(result.arms[1].costUsd, null); assert.equal(result.arms[1].knownCostFloorUsd, 2); assert.equal(result.arms[1].unknownCosts, 1); assert.equal(result.arms[1].costPerAcceptedUsd, null);
  assert.deepEqual(result.paired, {bothPass: 0, v10Only: 1, nativeOnly: 0, bothFail: 0, ungraded: 0});
});
