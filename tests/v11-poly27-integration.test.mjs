import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, mkdir, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assertSamePublicTasks, runBox, schedulePairs} from '../scripts/v11-poly27-bench.mjs';
import {stageBuild, stageGraderBuild} from '../scripts/v11-poly27-build.mjs';
import {actorPrompt} from '../scripts/v11-poly27-container-entry.mjs';
import {actorPrompt as baselinePrompt} from '../scripts/poly27-container-entry.mjs';
import {summarizeCohort, gradeCohort} from '../scripts/v11-poly27-evaluate.mjs';
import {hash} from '../src/v9/workspace.mjs';

const ok = (stdout = '') => ({exitCode: 0, stdout, stderr: '', timedOut: false, overflow: false, aborted: false});
async function temporary(t) {const directory = await mkdtemp(join(tmpdir(), 'v11-poly27-')); t.after(() => rm(directory, {recursive: true, force: true})); return directory;}

test('relocated public fixtures preserve all original task and inventory bytes', () => {
  const tasks = Array.from({length: 27}, (_, i) => ({id: `task_${i}`, taskId: `python/task-${i}`, prompt: 'Original public contract',
    actorFiles: [{path: 'source.py', sha256: hash('original'), bytes: 8}], workspace: `/old/fixtures/${i}`, graderDescriptor: `/old/evaluators/${i}/descriptor.json`}));
  const relocated = tasks.map(task => ({...task, workspace: task.workspace.replace('/old/', '/new/'), graderDescriptor: task.graderDescriptor.replace('/old/', '/new/')}));
  assert.equal(assertSamePublicTasks(relocated, tasks), assertSamePublicTasks(tasks, tasks));
  const changed = structuredClone(relocated); changed[5].prompt += ' Hidden expected answer';
  assert.throws(() => assertSamePublicTasks(changed, tasks), /original public task contracts/);
  changed[5] = structuredClone(relocated[5]); changed[5].actorFiles[0].sha256 = hash('different');
  assert.throws(() => assertSamePublicTasks(changed, tasks), /original public task contracts/);
});

test('V11 and fresh native get the identical original six-language actor prompt', () => {
  for (const lang of ['cpp', 'go', 'java', 'javascript', 'python', 'rust']) {
    const task = {name: 'public-example', lang, prompt: 'Use the original public API.'};
    assert.equal(actorPrompt(task), baselinePrompt(task));
  }
});

test('actor overlay stages V11 and unchanged Pi/native helpers, without grading or credentials', async t => {
  const directory = await temporary(t), base = 'sha256:' + 'b'.repeat(64), probes = [];
  const receipt = await stageBuild(directory, base, {probe: async (image, paths) => {probes.push({image, paths}); return {image, files: paths};}});
  assert.deepEqual(probes, [{image: base, paths: ['package-lock.json']}]);
  assert.ok(receipt.files.some(file => file.path === 'src/v11/controller.mjs'));
  assert.ok(receipt.files.some(file => file.path === 'src/v11/public-context.mjs'));
  assert.ok(receipt.files.some(file => file.path === 'src/v10/pi.mjs'));
  assert.ok(receipt.files.some(file => file.path === 'src/bench/native-codex.mjs'));
  assert.ok(receipt.files.every(file => !/grader|evaluators|private-auth|auth\.json|reference/.test(file.path)));
  for (const file of receipt.files) assert.equal(hash(await readFile(join(receipt.context, 'runtime', file.path))), file.sha256);
  const recipe = await readFile(join(receipt.context, 'Dockerfile'), 'utf8');
  assert.ok(recipe.startsWith(`FROM ${receipt.baseTag}\n`)); assert.ok(recipe.includes(`overlay-base-image="${base}"`));
  assert.ok(recipe.includes('v11-poly27-container-entry.mjs')); assert.ok(!/^RUN /m.test(recipe));
  assert.deepEqual((await readdir(receipt.context)).sort(), ['Dockerfile', 'runtime']);
  await assert.rejects(stageBuild(directory, 'mutable:tag'), /immutable image/);
});

test('grader overlay preserves the original grader and contains no actor/model runtime', async t => {
  const directory = await temporary(t), base = 'sha256:' + 'c'.repeat(64);
  const receipt = await stageGraderBuild(directory, base, {probe: async () => ({verified: true})});
  assert.deepEqual(receipt.files.map(file => file.path).sort(), ['package-lock.json', 'package.json', 'scripts/poly27-grader-entry.mjs', 'scripts/poly27-public-check.mjs', 'src/v9/process.mjs']);
  assert.equal(receipt.kind, 'grader'); assert.ok(!receipt.files.some(file => /v11\/|controller|native-codex|auth/.test(file.path)));
});

test('inspection mounts only the supplied fresh per-root auth caches and no evaluator source', async t => {
  const root = await temporary(t), directory = join(root, 'inspection'), authStores = {v11: join(root, 'private-auth/v11/auth.json'), native: join(root, 'private-auth/native/auth.json')};
  const calls = []; let network;
  const result = await runBox({image: 'image', proxy: {name: 'proxy'}, directory, inspect: true, authStores, dockerRun: async args => {
    calls.push(args);
    if (args[0] === 'network' && args[1] === 'create') network = args.at(-1);
    if (args[0] === 'inspect' && args[1] === 'proxy') return ok(JSON.stringify([{NetworkSettings: {Networks: {[network]: {IPAddress: '172.20.0.2'}}}}]));
    if (args[0] === 'inspect') return ok(JSON.stringify({Running: false}));
    if (args[0] === 'start') await writeFile(join(directory, 'inspection.json'), JSON.stringify({ready: true}));
    return ok();
  }});
  assert.equal(result.ready, true); const create = calls.find(args => args[0] === 'create'), mounts = create.filter(item => typeof item === 'string' && item.startsWith('type=bind,'));
  assert.ok(mounts.some(item => item.includes('private-auth') && item.endsWith('target=/run/pi-auth.json,readonly')));
  assert.ok(mounts.some(item => item.includes('private-auth') && item.endsWith('target=/run/native-auth.json,readonly')));
  assert.ok(mounts.every(item => !/evaluators|reference|grader|\.codex/.test(item)));
  assert.equal(calls.some(args => args[0] === 'cp'), false);
});

test('raw acceptance, original outer policy, and zero-restoration supplemental stay separate', () => {
  const attempts = [
    {id: 'one-r1-v11', taskId: 'one', strategy: 'v11', status: 'completed', policyValid: true, controllerPolicyEligible: false, controllerPolicyViolations: [{paths: ['Cargo.lock']}], costKnown: true, costUsd: .1, writerRetries: 1, verificationRecoveries: 1},
    {id: 'one-r1-native', taskId: 'one', strategy: 'native', status: 'completed', policyValid: true, costKnown: true, costUsd: .8}];
  const result = summarizeCohort({attempts}, attempts.map(attempt => ({id: attempt.id, accepted: true})));
  const v11 = result.arms.find(arm => arm.strategy === 'v11');
  assert.equal(v11.accepted, 1); assert.equal(v11.policyValidAccepted, 1); assert.equal(v11.strictPolicyValidAccepted, 0);
  assert.equal(v11.controllerRestorationAttempts, 1); assert.equal(v11.writerRetries, 1); assert.equal(v11.verificationRecoveries, 1);
  assert.deepEqual(result.paired, {bothPass: 1, v11Only: 0, nativeOnly: 0, bothFail: 0, ungraded: 0});
  assert.ok(result.policyMetrics.strictPolicyValidAccepted.includes('internal protected-file restoration'));
});

test('candidate grading fails before any external command while actor closure is incomplete', async t => {
  const directory = await temporary(t), plan = {graderImage: 'sha256:' + 'd'.repeat(64)}, text = JSON.stringify(plan), sha256 = hash(text);
  await writeFile(join(directory, 'plan.json'), text);
  await writeFile(join(directory, 'execution-started.json'), JSON.stringify({planSha256: sha256}));
  await writeFile(join(directory, 'execution-complete.json'), JSON.stringify({closed: false, planSha256: sha256}));
  let called = false;
  await assert.rejects(gradeCohort(directory, plan.graderImage, {run: async () => {called = true; return ok();}}), /Actors are not closed/);
  assert.equal(called, false);
});
