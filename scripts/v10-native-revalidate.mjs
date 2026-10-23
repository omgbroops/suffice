// Post-run scoring correction. Original graders, receipts and actor snapshots are immutable.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join, dirname, isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash, captureTree, treeHash, writeTree, inside} from '../src/v9/workspace.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {testCount} from '../src/v9/checks.mjs';
import {summarizeComparison} from './v10-native-bench.mjs';

const json = value => JSON.stringify(value, null, 2) + '\n';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const digest = async path => hash(await readFile(path));
const locate = (root, path) => isAbsolute(path) ? resolve(path) : resolve(root, path);
async function saveNew(path, value) {await mkdir(dirname(path), {recursive: true}); await writeFile(path, json(value), {flag: 'wx'});}
const count = (text, key) => Number(text.match(new RegExp(`^# ${key} (\\d+)\\r?$`, 'm'))?.[1] ?? NaN);

// A reviewed production exception can demonstrate the defect before assert.equal executes.
// An arbitrary nonzero exit, incomplete suite, loader error or timeout cannot.
export function reviewedBaselineValid(row, review, stdout) {
  const a = row?.baseline?.acceptance;
  return Boolean(a && review?.kind === 'reviewed-source-contract-exception' && review.id === row.id &&
    review.baselineStdoutSha256 === hash(stdout) && review.productionStackFragment && review.errorFragment && review.testName &&
    a.status === 'failed' && a.exitCode === 1 && !a.error && !a.timedOut && !a.overflow && !a.aborted &&
    a.tests === a.expectedTests && a.tests > 0 && testCount(stdout) === a.expectedTests &&
    count(stdout, 'pass') > 0 && count(stdout, 'fail') === 1 &&
    count(stdout, 'pass') + count(stdout, 'fail') === a.expectedTests &&
    ['skipped', 'cancelled', 'todo'].every(key => count(stdout, key) === 0) &&
    stdout.includes(review.productionStackFragment) && stdout.includes(review.errorFragment) &&
    stdout.includes('not ok 1 - ' + review.testName) &&
    row.baseline.regression.status === 'passed' && row.reference.acceptance.status === 'passed' && row.reference.regression.status === 'passed');
}

async function verifyReceipt(receipt) {
  if (!receipt?.stdoutPath || await digest(receipt.stdoutPath) !== receipt.stdoutSha256 || await digest(receipt.stderrPath) !== receipt.stderrSha256) throw Error('Original evaluation receipt/log mismatch');
}
async function check(workspace, checkPath, expected, directory, sourceHash, graderSha256) {
  await mkdir(directory, {recursive: false});
  const stdoutPath = join(directory, 'stdout.txt'), stderrPath = join(directory, 'stderr.txt');
  const command = [process.execPath, '--permission', `--allow-fs-read=${workspace}`, `--allow-fs-read=${checkPath}`, '--max-old-space-size=256', '--test-reporter=tap', checkPath];
  const r = await runProcess(command[0], command.slice(1), {cwd: workspace, timeoutMs: 60_000, maxBytes: 1_000_000,
    env: {...process.env, SUFFICE_WORKSPACE: workspace, NODE_NO_WARNINGS: '1'}, stdoutPath, stderrPath});
  const tests = testCount(r.stdout + '\n' + r.stderr);
  const complete = !r.error && !r.timedOut && !r.overflow && !r.aborted && tests === expected && expected > 0 &&
    ['skipped', 'cancelled', 'todo'].every(key => count(r.stdout, key) === 0);
  const passed = complete && r.exitCode === 0 && count(r.stdout, 'pass') === tests && count(r.stdout, 'fail') === 0;
  const receipt = {at: new Date().toISOString(), command, workspace, sourceHash, graderSha256, expectedTests: expected, tests,
    status: passed ? 'passed' : complete && r.exitCode !== 0 ? 'failed' : 'unverified', exitCode: r.exitCode,
    error: r.error, timedOut: r.timedOut, overflow: r.overflow, latencyMs: r.latencyMs, stdoutPath, stderrPath,
    stdoutSha256: await digest(stdoutPath), stderrSha256: await digest(stderrPath)};
  await saveNew(join(directory, 'result.json'), receipt); return receipt;
}

export async function revalidateComparison(planDirectory, reviewPath) {
  const root = resolve(planDirectory), evaluation = join(root, 'evaluation'), extra = join(evaluation, 'supplemental');
  const p = await read(join(root, 'plan.json')), e = await read(join(root, 'execution-complete.json'));
  const g = await read(join(root, 'grades.json')), validation = await read(join(root, 'reference-validation.json'));
  const freeze = await read(join(root, 'grading-freeze.json')), started = await read(join(root, 'execution-started.json'));
  const complete = await read(join(evaluation, 'grading-complete.json')), review = await read(resolve(reviewPath));
  if (!e.closed || e.attempts?.length !== 30 || g.grades?.length !== 30 || complete.graded !== 28 || complete.ungraded !== 2 ||
      [e, g, freeze, started, complete].some(item => item.planFingerprint !== p.fingerprint)) throw Error('Expected the closed, initially graded 30-attempt cohort');
  const originals = [...complete.files];
  for (const f of originals) if (await digest(join(root, f.path)) !== f.sha256) throw Error('Original scoring/protocol changed');
  const freezeSha = await digest(join(root, 'grading-freeze.json'));
  if (started.gradingFreezeSha256 !== freezeSha || e.gradingFreezeSha256 !== freezeSha) throw Error('Pre-execution evaluator freeze differs');
  for (const f of freeze.sourceFiles) if (await digest(f.path) !== f.sha256) throw Error('Frozen grader procedure differs');
  for (const f of freeze.entries) if (await digest(f.acceptancePath) !== f.sha256 || await digest(f.frozenPath) !== f.sha256) throw Error('Frozen acceptance differs');
  for (const row of validation.tasks) for (const suite of [row.baseline, row.reference]) for (const receipt of [suite.acceptance, suite.regression]) await verifyReceipt(receipt);
  const pending = validation.tasks.filter(row => row.status !== 'valid');
  if (pending.length !== 1 || pending[0].id !== 'cookie-173' || review.id !== pending[0].id ||
      g.grades.filter(row => row.accepted === null).some(row => row.taskId !== review.id)) throw Error('Unexpected ungraded tasks');
  const target = pending[0], frozen = freeze.entries.find(f => f.id === target.id), task = p.tasks.find(t => t.id === target.id);
  if (review.acceptanceSha256 !== frozen.sha256 || !review.blindReviewText || !review.rationale ||
      !reviewedBaselineValid(target, review, await readFile(target.baseline.acceptance.stdoutPath, 'utf8'))) throw Error('Reviewed production exception is not supported');
  // Bind the decision before inspecting/scoring either formerly ungraded actor snapshot.
  await saveNew(join(extra, 'decision.json'), {at: new Date().toISOString(), all30ActorsAlreadyClosed: true,
    executionClosedAt: e.at, originalFiles: originals, gradingFreezeSha256: freezeSha, scriptSha256: await digest(import.meta.filename),
    review, originalBaseline: target.baseline, originalReference: target.reference,
    rule: 'Complete expected suite; reviewed production exception violates the public contract; fixed reference and both public regressions pass. No arbitrary nonzero exits.'});
  await writeFile(join(extra, 'blind-review.md'), review.blindReviewText, {flag: 'wx'});
  const replacement = {...target, status: 'valid', reason: null, validationCorrection: 'Reviewed source-contract exception; original ERR_ASSERTION-only gate was too narrow'};
  const newValidation = validation.tasks.map(row => row.id === target.id ? replacement : row), grades = [...g.grades];
  for (const attempt of e.attempts.filter(a => a.taskId === target.id)) {
    const index = grades.findIndex(row => row.id === attempt.id);
    if (index < 0 || grades[index].accepted !== null) throw Error('Only previously ungraded results may change');
    const original = await captureTree(locate(root, task.inputDir), {includeIgnored: true});
    const workspaceTree = await captureTree(locate(root, attempt.workspace), {includeIgnored: true});
    const tree = await captureTree(locate(root, attempt.snapshot), {includeIgnored: true});
    if (treeHash(original) !== task.sourceHash || treeHash(tree) !== attempt.sourceHash || treeHash(workspaceTree) !== attempt.sourceHash) throw Error('Source seal differs');
    const violations = task.immutablePaths.filter(path => !tree.get(path)?.bytes.equals(original.get(path)?.bytes));
    const workspace = join(extra, 'grading', attempt.id); if (!inside(extra, workspace)) throw Error('Unsafe attempt ID');
    await writeTree(workspace, tree);
    for (const args of [['init', '--quiet'], ['config', 'core.autocrlf', 'false'], ['add', '--force', '--all']]) {
      const r = await runProcess('git', args, {cwd: workspace, timeoutMs: 30_000}); if (r.error || r.exitCode !== 0 || r.timedOut) throw Error('Fresh grading Git initialization failed');
    }
    if (treeHash(await captureTree(workspace, {includeIgnored: true})) !== attempt.sourceHash) throw Error('Fresh grading copy differs');
    const dir = join(extra, 'results', attempt.id); await mkdir(dir, {recursive: true});
    if (await digest(join(workspace, frozen.publicSuitePath)) !== frozen.publicSuiteSha256) throw Error('Public suite differs');
    const acceptance = await check(workspace, frozen.frozenPath, frozen.expectedTests, join(dir, 'acceptance'), attempt.sourceHash, frozen.sha256);
    const regression = await check(workspace, join(workspace, frozen.publicSuitePath), frozen.publicExpectedTests, join(dir, 'public'), attempt.sourceHash, frozen.publicSuiteSha256);
    const verified = [acceptance, regression].every(r => ['passed', 'failed'].includes(r.status));
    grades[index] = {id: attempt.id, taskId: attempt.taskId, strategy: attempt.strategy, actorStatus: attempt.status,
      accepted: verified ? acceptance.status === 'passed' && regression.status === 'passed' : null, status: verified ? 'graded' : 'ungraded',
      policyValid: violations.length === 0, immutableViolations: violations, sourceHash: attempt.sourceHash,
      workspaceVerified: true, snapshotVerified: true, supplementalDecision: 'evaluation/supplemental/decision.json', acceptance, regression};
  }
  for (const f of originals) if (await digest(join(root, f.path)) !== f.sha256) throw Error('Original scoring/protocol changed during correction');
  const final = {...g, at: new Date().toISOString(), supplementalDecision: 'evaluation/supplemental/decision.json', grades, validation: newValidation};
  await saveNew(join(root, 'grades.final.json'), final);
  await saveNew(join(root, 'reference-validation.final.json'), {...validation, tasks: newValidation, supplementalDecision: final.supplementalDecision});
  const summary = summarizeComparison(e, final); await saveNew(join(root, 'summary.final.json'), summary);
  await saveNew(join(extra, 'completed.json'), {at: new Date().toISOString(), actorsRerun: 0, testsChanged: 0, previouslyGradedRowsChanged: 0,
    files: await Promise.all(['grades.final.json', 'reference-validation.final.json', 'summary.final.json', 'evaluation/supplemental/decision.json'].map(async path => ({path, sha256: await digest(join(root, path))})))});
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  revalidateComparison(...process.argv.slice(2)).then(value => console.log(json(value))).catch(error => {console.error(error); process.exitCode = 1;});
}
