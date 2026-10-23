// Evaluators and references stay outside actor inputs. Nothing executes on import.
import {readFile, writeFile, mkdir, chmod} from 'node:fs/promises';
import {resolve, dirname, isAbsolute, posix} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {realTasks} from '../benchmarks/real/tasks.mjs';
import {efficiencyTasks} from '../benchmarks/efficiency/tasks.mjs';
import {workflowTasks} from '../benchmarks/workflow/tasks.mjs';
import {captureTree, treeHash, inside} from '../src/v9/workspace.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {testCount} from '../src/v9/checks.mjs';

const repo = resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const excluded = new Set(['prerelease-subset', 'build-metadata', 'shell-quote-15']);
const descriptors = new Map([...realTasks.filter(task => !excluded.has(task.id)), ...efficiencyTasks, ...workflowTasks].map(task => [task.id, task]));
const descriptorFiles = ['benchmarks/real/tasks.mjs', 'benchmarks/efficiency/tasks.mjs', 'benchmarks/workflow/tasks.mjs'];
const referenceProcedureFiles = ['scripts/prepare-picomatch.mjs', 'scripts/prepare-cookie.mjs', 'scripts/prepare-path-to-regexp.mjs'];
const terminal = new Set(['completed', 'failed', 'timeout', 'timed_out', 'budget_stopped', 'cost_unknown', 'infrastructure_error', 'operational_failure', 'closure_failure', 'verification_failed', 'unverified', 'interrupted', 'cancelled', 'aborted', 'overflow', 'error', 'unavailable', 'invalid_result', 'protocol_failure', 'policy_violation', 'source_violation']);
const location = (directory, path) => isAbsolute(path) ? resolve(path) : resolve(directory, path);
const digestFile = async path => hash(await readFile(path));
async function save(path, value) {await mkdir(dirname(path), {recursive: true}); await writeFile(path, json(value));}
async function putUnchanged(path, bytes) {
  await mkdir(dirname(path), {recursive: true});
  try {if (!(await readFile(path)).equals(Buffer.from(bytes))) throw Error(`Existing evaluation artifact differs: ${path}`);}
  catch (error) {if (error.code !== 'ENOENT') throw error; await writeFile(path, bytes, {flag: 'wx'});}
}
async function readPlan(planDir) {
  const path = resolve(planDir, 'plan.json'), bytes = await readFile(path), plan = JSON.parse(bytes);
  if (!Array.isArray(plan.tasks) || plan.tasks.length !== 15 || new Set(plan.tasks.map(task => task.id)).size !== 15 ||
      plan.tasks.some(task => !descriptors.has(task.id)) || typeof plan.fingerprint !== 'string' || !plan.fingerprint) throw Error('Expected the frozen exact-15 comparison plan');
  return {plan, planPath: path, planSha256: hash(bytes)};
}
function outsideInputs(planDir, plan, path) {
  if (plan.tasks.some(task => inside(location(planDir, task.inputDir), path))) throw Error('Evaluation artifacts must be outside every actor input');
}
function expectedTests(bytes) {return [...bytes.toString('utf8').matchAll(/\btest\(\s*['"]([^'"]+)['"]/g)].length;}

export async function freezeEvaluators(planDirectory) {
  const planDir = resolve(planDirectory), {plan, planSha256} = await readPlan(planDir);
  try {await readFile(resolve(planDir, 'execution-started.json')); throw Error('Evaluator freeze is forbidden after execution starts');}
  catch (error) {if (error.code !== 'ENOENT') throw error;}
  const evaluation = resolve(planDir, 'evaluation'); outsideInputs(planDir, plan, evaluation);
  const entries = [];
  for (const task of plan.tasks) {
    const descriptor = descriptors.get(task.id), acceptancePath = resolve(descriptor.acceptancePath), bytes = await readFile(acceptancePath);
    const frozenPath = resolve(evaluation, 'frozen', `${task.id}.test.mjs`);
    await putUnchanged(frozenPath, bytes);
    const inputDir = location(planDir, task.inputDir), input = await captureTree(inputDir, {includeIgnored: true});
    if (treeHash(input) !== task.sourceHash) throw Error(`Original input hash mismatch: ${task.id}`);
    if (!Array.isArray(task.checks) || !task.checks.length) throw Error(`Missing public checks: ${task.id}`);
    // All supplied fixtures have one standalone Node suite. Reject protocol drift.
    if (task.checks.length !== 1 || task.checks[0].command.join('\0') !== ['node', '--test', 'tests/public.test.mjs'].join('\0')) throw Error(`Unexpected public check command: ${task.id}`);
    const publicBytes = input.get('tests/public.test.mjs')?.bytes;
    if (!publicBytes || !expectedTests(publicBytes)) throw Error(`Missing public test coverage: ${task.id}`);
    const count = expectedTests(bytes); if (!count) throw Error(`Evaluator has no declared tests: ${task.id}`);
    entries.push({id: task.id, acceptancePath, frozenPath, sha256: hash(bytes), bytes: bytes.length, expectedTests: count,
      sourceHash: task.sourceHash, checks: task.checks, publicSuitePath: 'tests/public.test.mjs', publicSuiteSha256: hash(publicBytes), publicExpectedTests: expectedTests(publicBytes)});
  }
  const sourceFiles = [];
  for (const name of [...descriptorFiles, ...referenceProcedureFiles, 'scripts/v10-native-grade.mjs']) sourceFiles.push({path: resolve(repo, name), sha256: await digestFile(resolve(repo, name))});
  const path = resolve(planDir, 'grading-freeze.json');
  const data = {version: 1, at: new Date().toISOString(), planFingerprint: plan.fingerprint, planSha256, entries, sourceFiles};
  try {
    const prior = JSON.parse(await readFile(path));
    if (JSON.stringify({...prior, at: null}) !== JSON.stringify({...data, at: null})) throw Error('Existing evaluator freeze differs');
    return prior;
  } catch (error) {if (error.code !== 'ENOENT') throw error;}
  await putUnchanged(path, json(data)); return data;
}

async function gitInit(directory) {
  for (const args of [['init', '--quiet'], ['config', 'core.autocrlf', 'false'], ['add', '--force', '--all']]) {
    const result = await runProcess('git', args, {cwd: directory, timeoutMs: 30_000});
    if (result.exitCode !== 0 || result.error || result.timedOut) throw Error(`Evaluation Git initialization failed: ${result.stderr || result.error}`);
  }
}
async function materialize(directory, tree) {
  await mkdir(directory, {recursive: true});
  for (const [name, value] of tree) {
    if (isAbsolute(name) || name.includes('\\') || name.split('/').some(part => ['..', '.git', 'node_modules'].includes(part))) throw Error('Unsafe source snapshot');
    await putUnchanged(resolve(directory, name), value.bytes);
    await chmod(resolve(directory, name), value.mode);
  }
  await gitInit(directory);
  if (treeHash(await captureTree(directory, {includeIgnored: true})) !== treeHash(tree)) throw Error('Materialized source snapshot differs');
}
async function fetchPinned(url, {sha256, maxBytes = 4 * 1024 * 1024} = {}) {
  const response = await fetch(url, {signal: AbortSignal.timeout(45_000)});
  if (!response.ok) throw Error(`Reference download failed: ${response.status} ${url}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {size += chunk.length; if (size > maxBytes) throw Error('Reference download over cap'); chunks.push(chunk);}
  const bytes = Buffer.concat(chunks), actual = hash(bytes);
  if (sha256 && sha256 !== actual) throw Error('Reference archive SHA256 pin mismatch');
  return {bytes, receipt: {url, sha256: actual, bytes: bytes.length, ...(sha256 ? {expectedSha256: sha256, pinVerified: true} : {}), fetchedAt: new Date().toISOString()}};
}
function fixedBytesArchive(bytes) {
  // bytes@3.1.1 is a small npm ustar archive. Validate all paths/types before using index.js.
  const tar = gunzipSync(bytes, {maxOutputLength: 8 * 1024 * 1024});
  let file; const seen = new Set();
  const text = buffer => buffer.toString('utf8').replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512); offset += 512;
    if (header.every(byte => byte === 0)) break;
    const expected = Number.parseInt(text(header.subarray(148, 156)).trim(), 8);
    const checksum = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (expected !== checksum) throw Error('Invalid reference tar checksum');
    const prefix = text(header.subarray(345, 500)), name = [prefix, text(header.subarray(0, 100))].filter(Boolean).join('/');
    const clean = name.replace(/\/$/, '');
    if (!(clean === 'package' || clean.startsWith('package/')) || name.includes('\\') || name.includes(':') || posix.normalize(clean) !== clean || clean.split('/').some(part => ['..', '.git', 'node_modules'].includes(part))) throw Error('Unsafe reference archive path');
    const type = String.fromCharCode(header[156] || 48), size = Number.parseInt(text(header.subarray(124, 136)).trim() || '0', 8);
    if (!['0', '5'].includes(type) || !Number.isSafeInteger(size) || size < 0 || offset + size > tar.length || seen.has(clean.toLowerCase())) throw Error('Unsafe reference archive entry');
    seen.add(clean.toLowerCase());
    if (name === 'package/index.js' && type === '0') file = Buffer.from(tar.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
  }
  if (!file) throw Error('Reference archive is missing index.js');
  return file;
}
function editReference(tree, path, before, after, expectedOccurrences, receipts) {
  const original = tree.get(path); if (!original) throw Error(`Reference source missing: ${path}`);
  const text = original.bytes.toString('utf8');
  if (text.split(before).length - 1 !== expectedOccurrences) throw Error(`Reference edit anchor mismatch: ${path}`);
  const bytes = Buffer.from(text.replaceAll(before, () => after));
  tree.set(path, {...original, bytes}); receipts.push({kind: 'minimal-edit', path, beforeSha256: hash(original.bytes), afterSha256: hash(bytes), before, after, occurrences: expectedOccurrences});
}
async function buildReference(task, original, originals, planDir) {
  const descriptor = descriptors.get(task.id), reference = new Map([...original].map(([path, value]) => [path, {...value, bytes: Buffer.from(value.bytes)}]));
  const receipts = [];
  if (descriptor.fix) {
    const repository = workflowTasks.some(item => item.id === task.id) ? 'nodeca/js-yaml' : 'npm/node-semver';
    for (const name of descriptor.referenceFiles ?? [descriptor.referenceFile]) {
      const path = `src/${name}`, prior = reference.get(path); if (!prior) throw Error(`Reference target absent: ${path}`);
      const fetched = await fetchPinned(`https://raw.githubusercontent.com/${repository}/${descriptor.fix}/${name}`, {maxBytes: 512 * 1024});
      reference.set(path, {...prior, bytes: fetched.bytes}); receipts.push({...fetched.receipt, kind: 'upstream-commit-file', revision: descriptor.fix, path, beforeSha256: hash(prior.bytes)});
    }
  } else if (task.id === 'picomatch-142') {
    const donor = originals.get('picomatch-99'); if (!donor) throw Error('Pinned picomatch@4.0.7 donor unavailable');
    const path = 'src/lib/parse.js', prior = reference.get(path), fixed = donor.get(path);
    const basePackage = JSON.parse(original.get('src/package.json').bytes), donorPackage = JSON.parse(donor.get('src/package.json').bytes);
    if (basePackage.version !== '4.0.6' || donorPackage.version !== '4.0.7') throw Error('Picomatch donor version mismatch');
    reference.set(path, {...prior, bytes: Buffer.from(fixed.bytes)});
    receipts.push({kind: 'pinned-original-fixture-file', path, fromTask: 'picomatch-99', beforeSha256: hash(prior.bytes), afterSha256: hash(fixed.bytes),
      baseArchiveSha256: '0e784763c1045e98a02a258e8678dd985a41ea3f4890b1180002ae2bf26237ac', donorArchiveSha256: '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'});
  } else if (task.id === 'picomatch-99') {
    editReference(reference, 'src/lib/parse.js', '        if (!match) return;\n\n        const source = create(match[1]);', '        if (!match) return;\n\n        if (match[1] === \'**\') return;\n\n        const source = create(match[1]);', 1, receipts);
  } else if (task.id === 'picomatch-187') {
    editReference(reference, 'src/lib/parse.js', "      if (opts.posix === true && value === '!' && prev.value === '[') {\n        value = '^';\n      }",
      "      if (value === '!' && prev.value === '[' && opts.literalBrackets !== true) {\n        const isLoneNegation = peek() === ']' && !remaining().slice(1).includes(']');\n        if (!isLoneNegation) {\n          value = '^';\n        }\n      }", 1, receipts);
  } else if (task.id === 'picomatch-202') {
    editReference(reference, 'src/lib/parse.js', '(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`', '(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL})[\\\\s\\\\S])*?)`', 2, receipts);
  } else if (task.id === 'bytes-51') {
    const fetched = await fetchPinned('https://registry.npmjs.org/bytes/-/bytes-3.1.1.tgz', {sha256: 'c102b4cc428564c9662240370438cf0d1fb054bf36c87c40de587aa79955abdc'});
    const path = 'src/index.js', prior = reference.get(path), bytes = fixedBytesArchive(fetched.bytes);
    reference.set(path, {...prior, bytes}); receipts.push({...fetched.receipt, kind: 'pinned-npm-file', path, version: '3.1.1', beforeSha256: hash(prior.bytes), afterSha256: hash(bytes)});
    await putUnchanged(resolve(planDir, 'evaluation/downloads/bytes-3.1.1.tgz'), fetched.bytes);
  } else if (task.id === 'cookie-173') {
    editReference(reference, 'src/index.js', 'var domainValueRegExp = /^([a-z0-9](', 'var domainValueRegExp = /^([.]?[a-z0-9](', 1, receipts);
  } else if (task.id === 'path-to-regexp-425') {
    editReference(reference, 'src/index.js', "      if (match === '*') {\n", "      if (match === '*') {\n        backtrack = '';\n", 1, receipts);
    editReference(reference, 'src/index.js', '      extraOffset += result.length - match.length;\n\n      return result;', "      backtrack = '';\n      extraOffset += result.length - match.length;\n\n      return result;", 1, receipts);
  } else throw Error(`No frozen reference procedure: ${task.id}`);
  return {reference, receipts};
}

async function executeCheck({workspace, checkPath, expected, directory, sourceHash, graderSha256}) {
  const key = hash(json({workspace, checkPath, expected, sourceHash, graderSha256}));
  const receiptPath = resolve(directory, 'result.json');
  try {
    const saved = JSON.parse(await readFile(receiptPath));
    if (saved.key !== key || await digestFile(saved.stdoutPath) !== saved.stdoutSha256 || await digestFile(saved.stderrPath) !== saved.stderrSha256) throw Error('Cached grading evidence differs');
    return saved;
  } catch (error) {if (error.code !== 'ENOENT') throw error;}
  await mkdir(directory, {recursive: true});
  const stdoutPath = resolve(directory, 'stdout.txt'), stderrPath = resolve(directory, 'stderr.txt');
  const command = [process.execPath, '--permission', `--allow-fs-read=${workspace}`, `--allow-fs-read=${checkPath}`, '--max-old-space-size=256', '--test-reporter=tap', checkPath];
  const result = await runProcess(command[0], command.slice(1), {cwd: workspace, timeoutMs: 60_000, maxBytes: 1_000_000,
    env: {...process.env, SUFFICE_WORKSPACE: workspace, NODE_NO_WARNINGS: '1'}, stdoutPath, stderrPath});
  const output = result.stdout + '\n' + result.stderr, tests = testCount(output);
  const count = key => Number(result.stdout.match(new RegExp(`^# ${key} (\\d+)\\r?$`, 'm'))?.[1] ?? NaN);
  const validExecution = !result.error && !result.timedOut && !result.overflow && !result.aborted && tests === expected && expected > 0 && count('skipped') === 0 && count('cancelled') === 0 && count('todo') === 0;
  const passed = validExecution && result.exitCode === 0 && count('pass') === tests && count('fail') === 0;
  const assertionFailure = validExecution && result.exitCode !== 0 && count('fail') > 0 && /\bERR_ASSERTION\b/.test(output);
  const receipt = {key, at: new Date().toISOString(), command, workspace, sourceHash, graderSha256, expectedTests: expected, tests,
    status: passed ? 'passed' : validExecution && result.exitCode !== 0 ? 'failed' : 'unverified', assertionFailure, exitCode: result.exitCode,
    error: result.error, timedOut: result.timedOut, overflow: result.overflow, latencyMs: result.latencyMs, stdoutPath, stderrPath,
    stdoutSha256: await digestFile(stdoutPath), stderrSha256: await digestFile(stderrPath)};
  await save(receiptPath, receipt); return receipt;
}
async function runSuites(planDir, task, freeze, workspace, label, sourceHash) {
  const directory = resolve(planDir, 'evaluation/results', label);
  const acceptance = await executeCheck({workspace, checkPath: freeze.frozenPath, expected: freeze.expectedTests, directory: resolve(directory, 'acceptance'), sourceHash, graderSha256: freeze.sha256});
  const publicPath = resolve(workspace, freeze.publicSuitePath);
  if (await digestFile(publicPath) !== freeze.publicSuiteSha256) return {acceptance, regression: {status: 'unverified', reason: 'Frozen public suite differs'}};
  const regression = await executeCheck({workspace, checkPath: publicPath, expected: freeze.publicExpectedTests, directory: resolve(directory, 'public'), sourceHash, graderSha256: freeze.publicSuiteSha256});
  return {acceptance, regression};
}

export async function gradeComparison(planDirectory) {
  const planDir = resolve(planDirectory), {plan, planSha256} = await readPlan(planDir);
  const freezePath = resolve(planDir, 'grading-freeze.json'), executionPath = resolve(planDir, 'execution-complete.json');
  const freezeBytes = await readFile(freezePath), freeze = JSON.parse(freezeBytes), executionBytes = await readFile(executionPath), execution = JSON.parse(executionBytes);
  // This gate precedes all reference fetches, evaluator loads, and evaluator execution.
  if (execution.closed !== true || execution.planFingerprint !== plan.fingerprint || freeze.planFingerprint !== plan.fingerprint || freeze.planSha256 !== planSha256) throw Error('Comparison is not closed against the evaluator freeze');
  const started = JSON.parse(await readFile(resolve(planDir, 'execution-started.json')));
  if (started.planFingerprint !== plan.fingerprint || started.gradingFreezeSha256 !== hash(freezeBytes) || execution.gradingFreezeSha256 !== hash(freezeBytes)) throw Error('Evaluator freeze differs from the one bound before actor execution');
  if (!Array.isArray(plan.schedule) || plan.schedule.length !== 30 || !Array.isArray(execution.attempts) || execution.attempts.length !== 30 || new Set(execution.attempts.map(a => a.id)).size !== 30) throw Error('Expected all 30 sealed terminal attempts');
  const schedule = new Map(plan.schedule.map(item => [item.id, item]));
  if (schedule.size !== 30 || execution.attempts.some(attempt => !terminal.has(attempt.status) || !schedule.has(attempt.id) || schedule.get(attempt.id).taskId !== attempt.taskId || schedule.get(attempt.id).strategy !== attempt.strategy)) throw Error('Attempt closure or schedule mismatch');
  for (const task of plan.tasks) for (const strategy of ['v10', 'native']) if (execution.attempts.filter(a => a.taskId === task.id && a.strategy === strategy).length !== 1) throw Error('Comparison must have one attempt per task and arm');
  if (!Array.isArray(freeze.entries) || freeze.entries.length !== 15 || new Set(freeze.entries.map(item => item.id)).size !== 15 || plan.tasks.some(task => !freeze.entries.some(item => item.id === task.id))) throw Error('Incomplete evaluator freeze');
  for (const file of freeze.sourceFiles) if (await digestFile(file.path) !== file.sha256) throw Error(`Frozen evaluator procedure changed: ${file.path}`);
  for (const entry of freeze.entries) {
    if (await digestFile(entry.acceptancePath) !== entry.sha256 || await digestFile(entry.frozenPath) !== entry.sha256) throw Error(`Frozen acceptance hash changed: ${entry.id}`);
  }
  const gradingAt = new Date().toISOString(), evaluation = resolve(planDir, 'evaluation'); outsideInputs(planDir, plan, evaluation);
  if (execution.attempts.some(a => a.workspace && inside(location(planDir, a.workspace), evaluation))) throw Error('Evaluation directory is inside an actor workspace');
  const protocol = {startedAt: gradingAt, executionClosedAt: execution.at ?? null, planFingerprint: plan.fingerprint, planSha256,
    gradingFreezeSha256: hash(freezeBytes), executionSha256: hash(executionBytes), all30Terminal: true, allEvaluatorHashesVerified: true};
  await save(resolve(evaluation, 'grading-start.json'), protocol);
  const originals = new Map(), originalErrors = new Map();
  for (const task of plan.tasks) {
    try {const tree = await captureTree(location(planDir, task.inputDir), {includeIgnored: true}); if (treeHash(tree) !== task.sourceHash) throw Error('Original baseline source hash differs'); originals.set(task.id, tree);}
    catch (error) {originalErrors.set(task.id, error.message);}
  }
  const validation = [], fetchedReferences = [];
  for (const task of plan.tasks) {
    const frozen = freeze.entries.find(entry => entry.id === task.id), original = originals.get(task.id);
    let row;
    try {
      if (!original) throw Error(originalErrors.get(task.id) ?? 'Original source unavailable');
      if (frozen.sourceHash !== task.sourceHash) throw Error('Frozen original source hash differs');
      const baselineDir = resolve(evaluation, 'baselines', task.id), referenceDir = resolve(evaluation, 'references', task.id);
      await materialize(baselineDir, original);
      const built = await buildReference(task, original, originals, planDir);
      fetchedReferences.push({id: task.id, receipts: built.receipts});
      await save(resolve(evaluation, 'reference-receipts', `${task.id}.json`), {id: task.id, at: new Date().toISOString(), receipts: built.receipts});
      await materialize(referenceDir, built.reference);
      const baseline = await runSuites(planDir, task, frozen, baselineDir, `baseline-${task.id}`, treeHash(original));
      const reference = await runSuites(planDir, task, frozen, referenceDir, `reference-${task.id}`, treeHash(built.reference));
      const valid = baseline.acceptance.assertionFailure && baseline.regression.status === 'passed' && reference.acceptance.status === 'passed' && reference.regression.status === 'passed';
      row = {id: task.id, status: valid ? 'valid' : 'ungraded', reason: valid ? null : 'Original assertion failure and fixed-reference acceptance/public regression validation did not all hold', baseline, reference,
        baselineSourceHash: treeHash(original), referenceSourceHash: treeHash(built.reference)};
    } catch (error) {row = {id: task.id, status: 'ungraded', reason: error.message};}
    validation.push(row); await save(resolve(planDir, 'reference-validation.json'), {at: new Date().toISOString(), ...protocol, tasks: validation});
  }
  const grades = [];
  for (const attempt of execution.attempts) {
    const task = plan.tasks.find(item => item.id === attempt.taskId), frozen = freeze.entries.find(entry => entry.id === attempt.taskId), valid = validation.find(row => row.id === attempt.taskId);
    const original = originals.get(attempt.taskId);
    let row = {id: attempt.id, taskId: attempt.taskId, strategy: attempt.strategy, actorStatus: attempt.status, accepted: null, policyValid: null, status: 'ungraded'};
    try {
      if (valid.status !== 'valid') throw Error(`Task evaluator is ungraded: ${valid.reason}`);
      if (!attempt.workspace || !attempt.snapshot || !attempt.sourceHash) throw Error('Actor source snapshot unavailable');
      const workspace = location(planDir, attempt.workspace), snapshot = location(planDir, attempt.snapshot);
      const workspaceTree = await captureTree(workspace, {includeIgnored: true}), snapshotTree = await captureTree(snapshot, {includeIgnored: true});
      if (treeHash(workspaceTree) !== attempt.sourceHash || treeHash(snapshotTree) !== attempt.sourceHash) throw Error('Actor workspace or sealed snapshot hash differs');
      const violations = (task.immutablePaths ?? []).filter(path => !original.has(path) || !snapshotTree.has(path) || !snapshotTree.get(path).bytes.equals(original.get(path).bytes));
      const gradingDir = resolve(evaluation, 'grading', attempt.id); if (!inside(evaluation, gradingDir) || gradingDir === evaluation) throw Error('Unsafe attempt identifier');
      await materialize(gradingDir, snapshotTree);
      const suites = await runSuites(planDir, task, frozen, gradingDir, `actor-${attempt.id}`, attempt.sourceHash);
      const verified = [suites.acceptance.status, suites.regression.status].every(status => ['passed', 'failed'].includes(status));
      row = {...row, status: verified ? 'graded' : 'ungraded', accepted: verified ? suites.acceptance.status === 'passed' && suites.regression.status === 'passed' : null, policyValid: violations.length === 0,
        ...(!verified ? {reason: 'Independent evaluator did not produce a complete verified result'} : {}),
        immutableViolations: violations, sourceHash: attempt.sourceHash, workspaceVerified: true, snapshotVerified: true, ...suites};
    } catch (error) {row = {...row, reason: error.message};}
    grades.push(row);
  }
  // Recheck seals after execution; evaluation never writes actor directories.
  if (await digestFile(executionPath) !== protocol.executionSha256 || await digestFile(freezePath) !== protocol.gradingFreezeSha256 || await digestFile(resolve(planDir, 'plan.json')) !== planSha256) throw Error('Comparison protocol changed during grading');
  const result = {at: new Date().toISOString(), ...protocol, grades, validation, fetchedReferences};
  await save(resolve(planDir, 'grades.json'), result);
  const artifacts = ['grades.json', 'reference-validation.json', 'grading-freeze.json', 'execution-complete.json', 'plan.json'];
  const files = await Promise.all(artifacts.map(async path => ({path, sha256: await digestFile(resolve(planDir, path))})));
  await save(resolve(evaluation, 'grading-complete.json'), {at: new Date().toISOString(), planFingerprint: plan.fingerprint, files,
    accepted: grades.filter(row => row.accepted === true).length, graded: grades.filter(row => row.status === 'graded').length, ungraded: grades.filter(row => row.status === 'ungraded').length});
  return result;
}
