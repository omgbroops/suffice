// V11 arm identities; the frozen grader, canonical tests, and closure policy are unchanged.
// Host-only orchestration. Graders run in fresh offline containers after actor closure.
import {readFile, writeFile, mkdir, readdir, lstat, realpath} from 'node:fs/promises';
import {resolve, join, dirname, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runProcess} from '../src/v9/process.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const digest = async path => hash(await readFile(path));
const hostDriverSha256 = await digest(fileURLToPath(import.meta.url));
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const terminal = new Set(['completed', 'failed', 'timeout', 'timed_out', 'budget_stopped', 'cost_unknown', 'infrastructure_error', 'operational_failure', 'closure_failure', 'verification_failed', 'unverified', 'interrupted', 'cancelled', 'aborted', 'overflow', 'error', 'unavailable', 'invalid_result', 'protocol_failure', 'policy_violation', 'source_violation']);
const sourceFailure = new Set(['compile_error', 'test_failure']);
const pinnedImage = image => {if (typeof image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('Grader image must be an immutable sha256 Docker image ID'); return image;};
const safeId = id => {if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw Error('Unsafe evaluation ID'); return id;};
const within = (root, path) => {const rel = relative(root, path); return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);};
async function save(path, value) {await mkdir(dirname(path), {recursive: true}); await writeFile(path, json(value));}
async function absent(path) {try {await lstat(path); return false;} catch (error) {if (error.code === 'ENOENT') return true; throw error;}}
async function regular(path) {const st = await lstat(path); if (!st.isFile() || st.isSymbolicLink()) throw Error(`Expected regular evidence file: ${path}`); return st;}
async function inventory(root, prefix = '') {
  const rows = [];
  for (const item of await readdir(join(root, prefix), {withFileTypes: true})) {
    const path = prefix ? `${prefix}/${item.name}` : item.name, full = join(root, path), st = await lstat(full);
    if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) throw Error(`Nonregular evaluation input: ${full}`);
    if (st.isDirectory()) rows.push(...await inventory(root, path));
    else rows.push({path: full, relativePath: path, bytes: st.size, sha256: await digest(full)});
  }
  return rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
async function readTasks(root) {
  const path = join(root, 'public-tasks.json'), bytes = await readFile(path), tasks = JSON.parse(bytes);
  if (!Array.isArray(tasks) || tasks.length !== 27 || new Set(tasks.map(t => t.id)).size !== 27 || new Set(tasks.map(t => t.taskId)).size !== 27) throw Error('Expected the exact 27 distinct public task entries');
  for (const task of tasks) {
    safeId(task.id);
    if (!isAbsolute(task.workspace) || !isAbsolute(task.graderDescriptor) || !within(root, task.workspace) || !within(root, task.graderDescriptor)) throw Error('Task inputs/evaluators must be explicit paths under the cohort root');
    if (!Array.isArray(task.actorFiles) || !task.actorFiles.length) throw Error('Task actor inventory missing');
  }
  return {tasks, publicTasksSha256: hash(bytes), path};
}
async function verifyTask(task) {
  await regular(task.graderDescriptor);
  const descriptor = await read(task.graderDescriptor), source = await inventory(task.workspace);
  if (descriptor.id !== task.id || descriptor.taskId !== task.taskId || descriptor.lang !== task.lang) throw Error(`Task descriptor mismatch: ${task.id}`);
  const expected = new Map(task.actorFiles.map(row => [row.path, row]));
  if (expected.size !== source.length || source.some(row => !expected.has(row.relativePath) || expected.get(row.relativePath).sha256 !== row.sha256 || expected.get(row.relativePath).bytes !== row.bytes)) throw Error(`Public fixture inventory changed: ${task.id}`);
  return {source, evaluator: await inventory(dirname(task.graderDescriptor))};
}

export function dockerGraderArgs({image, input, grader, config, results, patch, mode = 'candidate'}) {
  pinnedImage(image);
  if (!['baseline', 'gold', 'candidate'].includes(mode)) throw Error('Unknown Docker grader mode');
  const mount = (source, target, readonly = true) => {
    if (!isAbsolute(source) || /[,\r\n\0]/.test(source)) throw Error('Mount paths must be explicit absolute paths without Docker mount delimiters');
    return ['--mount', `type=bind,source=${source},target=${target}${readonly ? ',readonly' : ''}`];
  };
  return ['run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--cpus', '2', '--memory', '3g', '--pids-limit', '256', '--user', 'node', '--workdir', '/work', '--entrypoint', 'node',
    ...mount(input, '/input'), ...mount(join(grader, 'descriptor.json'), '/grader/descriptor.json'), ...mount(join(grader, 'hidden'), '/grader/hidden'), ...(mode === 'gold' ? mount(join(grader, 'reference'), '/grader/reference') : []), ...mount(config, '/config'), ...mount(results, '/results', false), ...(patch ? mount(patch, '/patch/patch.diff') : []),
    image, '/opt/suffice/scripts/poly27-grader-entry.mjs'];
}
function countsValid(counts) {return counts && Object.values(counts).every(n => Number.isSafeInteger(n) && n >= 0) && counts.tests === counts.passed + counts.failed && counts.skipped === 0;}
export function authenticatedVerdict(result, process, {task, mode, expectedTests} = {}) {
  const invalid = reason => ({status: 'unverified', accepted: null, reason});
  if (!result || result.schemaVersion !== 1 || result.id !== task.id || result.taskId !== task.taskId || result.lang !== task.lang || result.mode !== mode) return invalid('grader_result_identity');
  if (process.error || process.timedOut || process.overflow || process.aborted || ![0, 1, 2].includes(process.exitCode)) return invalid('incomplete_container');
  if (!Array.isArray(result.calls) || !result.calls.length || result.calls.some(c => c.error || c.timedOut || c.overflow || c.aborted || !Number.isInteger(c.exitCode))) return invalid('incomplete_grader_command');
  const expectedExit = result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : result.status === 'unverified' ? 2 : null;
  if (expectedExit === null || process.exitCode !== expectedExit) return invalid('container_result_exit_mismatch');
  if (expectedTests !== undefined && result.expectedTests !== expectedTests) return invalid('expected_count_not_bound');
  if (result.status === 'passed' && result.accepted === true && result.kind === 'pass') {
    if (!countsValid(result.counts) || result.counts.tests <= 0 || result.counts.failed !== 0 || result.calls.some(c => c.exitCode !== 0)) return invalid('incomplete_passing_tests');
    if (expectedTests !== undefined && result.counts.tests !== expectedTests) return invalid('test_count_mismatch');
    return {status: 'passed', accepted: true};
  }
  if (result.status === 'failed' && result.accepted === false && result.calls.some(c => c.exitCode !== 0)) {
    if (result.kind === 'compile_error' && (!result.counts || countsValid(result.counts) && result.counts.tests === 0)) return {status: 'failed', accepted: false};
    if (result.kind === 'test_failure' && countsValid(result.counts) && result.counts.tests > 0 && result.counts.failed > 0 && (expectedTests === undefined || result.counts.tests <= expectedTests)) return {status: 'failed', accepted: false};
    if (mode === 'candidate' && result.kind === 'invalid_patch') return {status: 'failed', accepted: false};
  }
  return invalid(result.kind ?? 'unverified_grader_result');
}
async function checkedImage(image, run) {
  pinnedImage(image);
  const result = await run('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], {timeoutMs: 30_000, maxBytes: 1_000_000});
  if (result.exitCode !== 0 || result.error || result.timedOut || result.overflow || result.aborted || result.stdout.trim() !== image) throw Error('Frozen grader Docker image could not be verified');
  return {image, inspectedAt: new Date().toISOString(), ...result};
}
async function verifyReceipt(path) {
  const receipt = await read(path);
  for (const file of receipt.evidenceFiles ?? []) if (await digest(file.path) !== file.sha256) throw Error(`Saved grading evidence changed: ${file.path}`);
  if (!receipt.evidenceFiles?.length) throw Error('Saved grading receipt has no authenticated evidence');
  return receipt;
}
async function runDockerGrade({root, image, task, mode, expectedTests, patchPath, patchSha256, run, scope, inputEvidence}) {
  const configValue = {mode, timeoutMs: 120_000, ...(expectedTests === undefined ? {} : {expectedTests})};
  const key = hash(json({hostDriverSha256, image, id: task.id, descriptor: task.graderDescriptor, configValue, patchSha256: patchSha256 ?? null, inputEvidence}));
  const directory = join(root, 'evaluation', scope, safeId(task.id), `${mode}-${key.slice(0, 20)}`), receiptPath = join(directory, 'host-receipt.json');
  if (!await absent(receiptPath)) {const receipt = await verifyReceipt(receiptPath); if (receipt.key !== key) throw Error('Cached grader key mismatch'); return receipt;}
  if (!await absent(directory)) throw Error(`Unsealed partial grader output exists; preserve it before an explicit retry: ${directory}`);
  const config = join(directory, 'config'), results = join(directory, 'results'); await mkdir(config, {recursive: true}); await mkdir(results);
  await save(join(config, 'grader.json'), configValue);
  const args = dockerGraderArgs({image, input: task.workspace, grader: dirname(task.graderDescriptor), config, results, patch: patchPath, mode});
  const stdoutPath = join(directory, 'docker.stdout.txt'), stderrPath = join(directory, 'docker.stderr.txt');
  let process;
  try {process = await run('docker', args, {timeoutMs: 180_000, maxBytes: 8_000_000, stdoutPath, stderrPath});}
  catch (error) {process = {exitCode: null, error: error.message, stdout: '', stderr: '', timedOut: false, overflow: false, aborted: false};}
  for (const [path, text] of [[stdoutPath, process.stdout ?? ''], [stderrPath, process.stderr ?? '']]) if (await absent(path)) await writeFile(path, text);
  let result = null, parseError;
  try {await regular(join(results, 'result.json')); result = await read(join(results, 'result.json'));} catch (error) {parseError = error.message;}
  const verdict = authenticatedVerdict(result, process, {task, mode, expectedTests});
  const {stdout, stderr, ...processDetails} = process;
  const evidenceFiles = [{path: stdoutPath, sha256: await digest(stdoutPath)}, {path: stderrPath, sha256: await digest(stderrPath)}, {path: join(config, 'grader.json'), sha256: await digest(join(config, 'grader.json'))}, ...await inventory(results)];
  const receipt = {key, hostDriverSha256, at: new Date().toISOString(), id: task.id, taskId: task.taskId, mode, image, command: ['docker', ...args], process: processDetails, result, verdict, parseError, patchSha256, evidenceFiles, receiptPath};
  await save(receiptPath, receipt); return receipt;
}
async function pool(items, concurrency, work) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) throw Error('Grading concurrency must be 1..8');
  const result = new Array(items.length); let next = 0;
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, async () => {for (;;) {const i = next++; if (i >= items.length) break; result[i] = await work(items[i], i);}}));
  return result;
}

export async function validateCohort(directory, graderImage, {concurrency = 2, run = runProcess} = {}) {
  const root = await realpath(resolve(directory));
  if (!await absent(join(root, 'execution-started.json'))) throw Error('Reference validation cannot run after actors start');
  const {tasks, publicTasksSha256, path} = await readTasks(root), imageEvidence = await checkedImage(graderImage, run);
  const evidenceFiles = new Map([[path, {path, sha256: publicTasksSha256}]]);
  const rows = await pool(tasks, concurrency, async task => {
    const inputs = await verifyTask(task), inputEvidence = [...inputs.source, ...inputs.evaluator];
    for (const file of inputEvidence) evidenceFiles.set(file.path, {path: file.path, sha256: file.sha256});
    const baseline = await runDockerGrade({root, image: graderImage, task, mode: 'baseline', run, scope: 'validation', inputEvidence});
    const gold = await runDockerGrade({root, image: graderImage, task, mode: 'gold', run, scope: 'validation', inputEvidence});
    const expectedTests = gold.verdict.accepted === true ? gold.result.counts.tests : null;
    const valid = gold.verdict.accepted === true && baseline.verdict.accepted === false && sourceFailure.has(baseline.result?.kind);
    for (const receipt of [baseline, gold]) evidenceFiles.set(receipt.receiptPath, {path: receipt.receiptPath, sha256: await digest(receipt.receiptPath)});
    return {id: task.id, taskId: task.taskId, valid, expectedTests, baseline, gold};
  });
  const validation = {schemaVersion: 1, hostDriverSha256, at: new Date().toISOString(), valid: rows.every(row => row.valid), taskCount: tasks.length, graderImage, publicTasksSha256, imageEvidence, tasks: rows, evidenceFiles: [...evidenceFiles.values()].sort((a, b) => a.path.localeCompare(b.path))};
  await save(join(root, 'reference-validation.json'), validation);
  if (!validation.valid) {const error = Error(`Cohort blocked: ${rows.filter(row => !row.valid).length} of 27 reference validations failed`); error.validationPath = join(root, 'reference-validation.json'); throw error;}
  return validation;
}
async function verifyFrozen(plan, root, validation) {
  if (plan.graderImage !== validation.graderImage) throw Error('Plan and reference validation grader images differ');
  const files = [...(plan.runtimeFiles ?? []), ...(plan.evaluationFiles ?? [])];
  if (!plan.runtimeFiles?.length || !plan.evaluationFiles?.length || new Set(files.map(f => resolve(f.path))).size !== files.length) throw Error('Frozen runtime/evaluator inventories missing or duplicated');
  for (const file of files) {
    if (!isAbsolute(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('Frozen inventory requires absolute paths and SHA256 digests');
    await regular(file.path); if (await digest(file.path) !== file.sha256) throw Error(`Frozen file changed: ${file.path}`);
  }
  const anchored = new Map(files.map(f => [resolve(f.path), f.sha256]));
  for (const path of [join(root, 'reference-validation.json'), join(root, 'public-tasks.json')]) if (!anchored.has(path)) throw Error(`Required grading evidence is not frozen in the plan: ${path}`);
  for (const file of validation.evidenceFiles) {
    if (await digest(file.path) !== file.sha256) throw Error(`Reference validation input/evidence changed: ${file.path}`);
    if (!anchored.has(resolve(file.path)) && !file.path.endsWith('host-receipt.json')) throw Error(`Validation input absent from frozen plan inventory: ${file.path}`);
  }
  for (const row of validation.tasks) for (const receipt of [row.baseline, row.gold]) await verifyReceipt(receipt.receiptPath);
}
export function summarizeCohort(execution, grades) {
  const arms = ['v11', 'native'].map(strategy => {
    const rows = execution.attempts.filter(row => row.strategy === strategy), ids = new Set(rows.map(row => row.id)), scores = grades.filter(row => ids.has(row.id));
    const known = row => row.costKnown === true && Number.isFinite(row.costUsd) && row.costUsd >= 0;
    const floor = rows.reduce((n, row) => n + (known(row) ? row.costUsd : Number.isFinite(row.knownCostFloorUsd) && row.knownCostFloorUsd >= 0 ? row.knownCostFloorUsd : 0), 0);
    const accepted = scores.filter(row => row.accepted === true).length, costKnown = rows.every(known);
    const mean = key => rows.length && rows.every(row => Number.isFinite(row[key]) && row[key] >= 0) ? rows.reduce((n, row) => n + row[key], 0) / rows.length : null;
    return {strategy, scheduled: rows.length, accepted, graded: scores.filter(row => typeof row.accepted === 'boolean').length, ungraded: rows.length - scores.filter(row => typeof row.accepted === 'boolean').length,
      policyValidAccepted: scores.filter(score => score.accepted === true && rows.find(row => row.id === score.id)?.policyValid === true).length,
      strictPolicyValidAccepted: scores.filter(score => score.accepted === true && rows.find(row => row.id === score.id)?.policyValid === true && rows.find(row => row.id === score.id)?.controllerPolicyEligible !== false).length,
      controllerRestorationAttempts: rows.filter(row => row.controllerPolicyEligible === false || row.controllerPolicyViolations?.length > 0).length,
      operationalCompletions: rows.filter(row => row.status === 'completed').length, unknownCosts: rows.filter(row => !known(row)).length, costKnown, costUsd: costKnown ? floor : null, knownCostFloorUsd: floor, costPerAcceptedUsd: accepted && costKnown ? floor / accepted : null,
      meanLatencyMs: mean('latencyMs'), meanActorLatencyMs: mean('actorLatencyMs'), repairs: rows.reduce((n, row) => n + (row.repairs ?? 0), 0), takeovers: rows.reduce((n, row) => n + (row.takeovers ?? 0), 0),
      writerRetries: rows.reduce((n, row) => n + (row.writerRetries ?? 0), 0), verificationRecoveries: rows.reduce((n, row) => n + (row.verificationRecoveries ?? 0), 0)};
  });
  const paired = {bothPass: 0, v11Only: 0, nativeOnly: 0, bothFail: 0, ungraded: 0};
  for (const taskId of new Set(execution.attempts.map(row => row.taskId))) {
    const verdict = strategy => grades.find(score => score.id === execution.attempts.find(row => row.taskId === taskId && row.strategy === strategy)?.id)?.accepted;
    const a = verdict('v11'), b = verdict('native'); paired[typeof a !== 'boolean' || typeof b !== 'boolean' ? 'ungraded' : a && b ? 'bothPass' : a ? 'v11Only' : b ? 'nativeOnly' : 'bothFail']++;
  }
  return {arms, paired, policyMetrics: {policyValidAccepted: 'Frozen V10 definition: completed actor, safe outer closure, no outer protected-file restoration, within deadline',
    strictPolicyValidAccepted: 'Additionally excludes V11 controller-reported internal protected-file restoration; native has no controller layer'}};
}
export async function gradeCohort(directory, graderImage, {concurrency = 2, run = runProcess} = {}) {
  const root = await realpath(resolve(directory)), planPath = join(root, 'plan.json'), planBytes = await readFile(planPath), plan = JSON.parse(planBytes), planSha256 = hash(planBytes);
  const started = await read(join(root, 'execution-started.json')), executionPath = join(root, 'execution-complete.json'), executionBytes = await readFile(executionPath), execution = JSON.parse(executionBytes);
  if (started.planSha256 !== planSha256 || execution.closed !== true || execution.planSha256 !== undefined && execution.planSha256 !== planSha256) throw Error('Actors are not closed against the original frozen plan');
  pinnedImage(graderImage); if (plan.graderImage !== graderImage) throw Error('Requested grader image differs from frozen plan');
  const {tasks, publicTasksSha256} = await readTasks(root), validation = await read(join(root, 'reference-validation.json'));
  if (!validation.valid || validation.taskCount !== 27 || validation.publicTasksSha256 !== publicTasksSha256 || validation.tasks?.length !== 27 || new Set(validation.tasks.map(row => row.id)).size !== 27 || tasks.some(task => !validation.tasks.some(row => row.id === task.id && row.taskId === task.taskId)) || !Array.isArray(validation.evidenceFiles) || !validation.evidenceFiles.length || validation.tasks.some(row => !row.valid || !Number.isSafeInteger(row.expectedTests) || row.expectedTests <= 0 || row.gold?.verdict?.accepted !== true || row.gold?.result?.counts?.tests !== row.expectedTests || row.baseline?.verdict?.accepted !== false || !sourceFailure.has(row.baseline?.result?.kind))) throw Error('All 27 tasks require valid frozen baseline/gold validation');
  if (!Array.isArray(execution.attempts) || execution.attempts.length !== 54 || new Set(execution.attempts.map(row => row.id)).size !== 54) throw Error('All 54 terminal actor attempts must be closed before any candidate grading');
  for (const task of tasks) for (const strategy of ['v11', 'native']) {
    const rows = execution.attempts.filter(row => row.taskId === task.id && row.strategy === strategy);
    if (rows.length !== 1 || rows[0].id !== `${task.id}-r1-${strategy}` || !terminal.has(rows[0].status)) throw Error('Attempt schedule or terminal closure mismatch');
  }
  if (plan.schedule && (plan.schedule.length !== 54 || plan.schedule.some(row => !execution.attempts.some(a => a.id === row.id && a.taskId === row.taskId && a.strategy === row.strategy)))) throw Error('Execution differs from frozen schedule');
  await verifyFrozen(plan, root, validation);
  const allInputs = new Map(await Promise.all(tasks.map(async task => [task.id, await verifyTask(task)])));
  const frozenPaths = new Set([...plan.runtimeFiles, ...plan.evaluationFiles].map(file => resolve(file.path)));
  for (const inputs of allInputs.values()) for (const file of [...inputs.source, ...inputs.evaluator]) if (!frozenPaths.has(resolve(file.path))) throw Error(`Current grading input is absent from the frozen plan: ${file.path}`);
  const missingSources = new Map();
  for (const attempt of execution.attempts) {
    if (!isAbsolute(attempt.attemptPath)) throw Error('Every attempt needs an explicit absolute attempt directory');
    const mayLackPatch = ['closure_failure', 'infrastructure_error'].includes(attempt.status);
    if (typeof attempt.patchPath !== 'string' || !attempt.patchPath) {
      if (mayLackPatch) {missingSources.set(attempt.id, `${attempt.status}_missing_patch`); continue;}
      throw Error('Every completed source needs a sealed patch');
    }
    if (!isAbsolute(attempt.patchPath) || !within(resolve(attempt.attemptPath), resolve(attempt.patchPath))) throw Error('Sealed patch must be within its explicit attempt directory');
    if (await absent(attempt.patchPath)) {
      if (mayLackPatch) {missingSources.set(attempt.id, `${attempt.status}_missing_patch`); continue;}
      throw Error(`Sealed patch missing: ${attempt.id}`);
    }
    if (!/^[a-f0-9]{64}$/.test(attempt.patchSha256)) throw Error('Every existing candidate patch needs a sealed SHA256 digest');
    await regular(attempt.patchPath); if (await digest(attempt.patchPath) !== attempt.patchSha256) throw Error(`Sealed patch hash changed: ${attempt.id}`);
  }
  const imageEvidence = await checkedImage(graderImage, run), protocol = {schemaVersion: 1, at: new Date().toISOString(), planSha256, executionSha256: hash(executionBytes), graderImage, all54Closed: true, sealedPatches: 54 - missingSources.size, unsealedSources: [...missingSources].map(([id, reason]) => ({id, reason})), imageEvidence};
  await save(join(root, 'evaluation', 'grading-start.json'), protocol);
  const grades = await pool(execution.attempts, concurrency, async attempt => {
    const task = tasks.find(t => t.id === attempt.taskId), row = validation.tasks.find(t => t.id === task.id), inputs = allInputs.get(task.id);
    if (missingSources.has(attempt.id)) return {id: attempt.id, taskId: attempt.taskId, strategy: attempt.strategy, accepted: null, status: 'unverified', reason: missingSources.get(attempt.id), tests: null, expectedTests: row.expectedTests, patchSha256: null, receiptPath: null};
    const receipt = await runDockerGrade({root, image: graderImage, task, mode: 'candidate', expectedTests: row.expectedTests, patchPath: attempt.patchPath, patchSha256: attempt.patchSha256, run, scope: `candidates/${safeId(attempt.id)}`, inputEvidence: [...inputs.source, ...inputs.evaluator]});
    return {id: attempt.id, taskId: attempt.taskId, strategy: attempt.strategy, accepted: receipt.verdict.accepted, status: receipt.verdict.status, reason: receipt.verdict.reason ?? receipt.result?.kind, tests: receipt.result?.counts?.tests ?? null, expectedTests: row.expectedTests, patchSha256: attempt.patchSha256, receiptPath: receipt.receiptPath};
  });
  await verifyFrozen(plan, root, validation);
  for (const attempt of execution.attempts) if (!missingSources.has(attempt.id) && await digest(attempt.patchPath) !== attempt.patchSha256) throw Error(`Sealed patch changed while grading: ${attempt.id}`);
  if (await digest(executionPath) !== hash(executionBytes)) throw Error('Actor closure record changed while grading');
  const result = {...protocol, completedAt: new Date().toISOString(), grades}; await save(join(root, 'grades.json'), result);
  const summary = {...summarizeCohort(execution, grades), planSha256, graderImage}; await save(join(root, 'summary.json'), summary);
  await save(join(root, 'evaluation', 'grading-complete.json'), {...protocol, completedAt: result.completedAt, gradesSha256: await digest(join(root, 'grades.json')), summarySha256: await digest(join(root, 'summary.json'))});
  return {grades: result, summary};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, root, image, extra] = process.argv.slice(2);
  if (extra || !root || !image || !['validate', 'grade'].includes(mode)) throw Error('Usage: node scripts/v11-poly27-evaluate.mjs <validate|grade> <cohort-root> <grader-image-sha256>');
  const result = mode === 'validate' ? await validateCohort(root, image) : await gradeCohort(root, image);
  console.log(json(mode === 'validate' ? {valid: result.valid, tasks: result.tasks.length} : result.summary));
}
