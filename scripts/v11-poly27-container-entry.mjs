// V11 execution with unchanged Poly27 public inputs and helper commands.
// Entire actor runs inside its offline container. No evaluator data is mounted here.
import {readFile, writeFile, mkdir, copyFile, cp, chmod} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {connect} from 'node:net';
import {executeV11} from '../src/v11/controller.mjs';
import {inspectPi} from '../src/v10/pi.mjs';
import {createRuntime} from '../src/runtime.mjs';
import {inspectNative, createNativeAdapter} from '../src/bench/native-codex.mjs';
import {captureTree, treeHash, hash, protectedFiles, enforceChecks, writeTree} from '../src/v9/workspace.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {PUBLIC_CHECK_INSTRUCTIONS} from './poly27-public-check.mjs';

const nativeBin = '/opt/codex/bin/codex';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const save = async (path, value) => {await mkdir(dirname(path), {recursive: true}); await writeFile(path, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});};
export function actorPrompt(task) {
  if (!PUBLIC_CHECK_INSTRUCTIONS[task.lang] || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.name)) throw Error('Unsupported task');
  return task.prompt + '\n\nEnvironment and verification:\n' +
    'This is an Exercism exercise. Implement the supplied public API and canonical edge cases from the requirements. Hidden acceptance tests and reference solutions are unavailable. Network access is restricted to the model service; all development dependencies are already installed. Toolchains: C++17, Go 1.19, Java 17/Gradle 8.7, Node 24, Python 3.11 and Rust 1.85.1. Preserve the supplied documentation, helper files and build configuration. You may add your own tests. No private test result will be available during this attempt.\n' +
    PUBLIC_CHECK_INSTRUCTIONS[task.lang] + '\n' +
    `Run a generated check with: node /opt/suffice/scripts/poly27-public-check.mjs ${task.lang} <exact-generated-file-path>\n` +
    'Use the listed generated-file format and helper command for the independent public-spec check. A generated check must test observed public behavior with real assertions; report only checks actually executed.\n';
}
async function credentials(strategy = 'both') {
  const stores = strategy === 'v11' ? [['/run/pi-auth.json', '/opt/suffice/.suffice/pi/auth.json']] : strategy === 'native' ? [['/run/native-auth.json', '/home/node/.codex/auth.json']] : [['/run/pi-auth.json', '/opt/suffice/.suffice/pi/auth.json'], ['/run/native-auth.json', '/home/node/.codex/auth.json']];
  for (const [source, target] of stores) {
    await mkdir(dirname(target), {recursive: true}); await copyFile(source, target); await chmod(target, 0o600);
  }
}
async function directEgressBlocked() {
  return new Promise(resolve => {
    const socket = connect({host: '1.1.1.1', port: 443});
    let done = false; const finish = blocked => {if (done) return; done = true; socket.destroy(); resolve(blocked);};
    socket.once('connect', () => finish(false)); socket.once('error', () => finish(true)); socket.setTimeout(4000, () => finish(true));
  });
}
export async function inspectContainer() {
  await credentials();
  const runtime = await createRuntime(), pi = await inspectPi(), native = await inspectNative(nativeBin);
  const pricing = {};
  for (const id of ['gpt-6-luna', 'gpt-6.1-sol']) {const model = runtime.getModel('openai', id); if (model) pricing[id] = {...model.cost};}
  let ordinaryWebsiteBlocked = false, modelEndpointReachable = false;
  try {const result = await fetch('https://example.com', {signal: AbortSignal.timeout(8000)}); ordinaryWebsiteBlocked = result.status === 403;} catch {ordinaryWebsiteBlocked = true;}
  try {const result = await fetch('https://api.openai.com/v1/models', {signal: AbortSignal.timeout(10000)}); modelEndpointReachable = [200, 401, 403].includes(result.status);} catch {}
  const isolation = {directEgressBlocked: await directEgressBlocked(), ordinaryWebsiteBlocked, modelEndpointReachable};
  const versions = {};
  for (const [name, command] of Object.entries({node: ['node','--version'], go: ['go','version'], rust: ['rustc','--version'], cargo: ['cargo','--version'], java: ['java','-version'], cpp: ['g++','--version'], cmake: ['cmake','--version'], python: ['python3','--version']})) {
    const r = await runProcess(command[0], command.slice(1), {timeoutMs: 10000}); versions[name] = {exitCode: r.exitCode, text: (r.stdout + r.stderr).split('\n').slice(0, 2).join('\n')};
  }
  const result = {at: new Date().toISOString(), pi, native, pricing, isolation, versions,
    ready: pi.ready && native.ready && Object.values(isolation).every(Boolean)};
  await save('/results/inspection.json', result); return result;
}
async function git(workspace, args) {
  const r = await runProcess('git', args, {cwd: workspace, timeoutMs: 30000, maxBytes: 8_000_000});
  if (r.error || r.timedOut || r.exitCode !== 0) throw Error('Task Git operation failed: ' + (r.error ?? r.stderr).slice(0, 200));
  return r.stdout;
}
export async function runActor(configPath = '/config/actor.json') {
  const config = await read(configPath), task = config.task;
  if (!['v11', 'native'].includes(config.strategy) || !Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) throw Error('Invalid actor configuration');
  const workspace = join('/work', task.name); actorPrompt(task); // Validate task before creating paths.
  await credentials(config.strategy); await cp('/opt/gradle-cache', '/home/node/.gradle', {recursive: true});
  await cp('/input', workspace, {recursive: true});
  for (const file of task.actorFiles) {
    if (!file.path || file.path.split('/').some(p => ['..', '.git'].includes(p)) || file.path.startsWith('/') || file.path.includes('\\')) throw Error('Invalid public input path');
    const path = join(workspace, file.path); if (hash(await readFile(path)) !== file.sha256) throw Error('Public input hash differs'); await chmod(path, file.mode);
  }
  await git(workspace, ['init', '--quiet']); await git(workspace, ['config', 'core.autocrlf', 'false']);
  await git(workspace, ['-c', 'user.name=Suffice benchmark', '-c', 'user.email=benchmark@local', 'add', '--force', '--all']);
  await git(workspace, ['-c', 'user.name=Suffice benchmark', '-c', 'user.email=benchmark@local', 'commit', '--quiet', '--allow-empty', '-m', 'public baseline']);
  const baseCommit = (await git(workspace, ['rev-parse', 'HEAD'])).trim(), original = await captureTree(workspace, {includeIgnored: true});
  const protection = protectedFiles(original, task.immutablePaths);
  await save('/results/actor-start.json', {at: new Date().toISOString(), id: task.id, strategy: config.strategy, baseCommit, sourceHash: treeHash(original)});
  const started = Date.now(); let result, failure;
  try {
    if (config.strategy === 'v11') {
      const contextPaths = [...task.solutionFiles, 'PUBLIC-API.md'].filter(path => original.has(path) && original.get(path).bytes.length <= 12_000).slice(0, 8);
      result = await executeV11({workspace, prompt: actorPrompt(task), runDir: '/results/actor', strategy: 'v11',
        timeoutMs: config.timeoutMs, maxCostUsd: Number.MAX_VALUE, checks: [], protectedPaths: task.immutablePaths, contextPaths});
    } else {
      result = await createNativeAdapter({bin: nativeBin, pricing: config.pricing['gpt-6.1-sol']})({role: 'native', workspace,
        prompt: actorPrompt(task), runDir: '/results/actor', model: 'gpt-6.1-sol', effort: 'high', timeoutMs: config.timeoutMs,
        maxCostUsd: Number.MAX_VALUE, sandbox: 'danger-full-access'});
    }
  } catch (error) {failure = error.message;}
  const actorLatencyMs = Date.now() - started;
  // Always attempt to seal partial work, including model/controller failures.
  const violations = await enforceChecks(workspace, original, protection);
  const tree = await captureTree(workspace, {includeIgnored: true}), sourceHash = treeHash(tree);
  await git(workspace, ['add', '--force', '--all']);
  const patch = await git(workspace, ['diff', '--cached', '--binary', baseCommit, '--', '.']);
  await writeFile('/results/patch.diff', patch, {flag: 'wx'}); await writeTree('/results/sealed-source', tree);
  await save('/results/source-files.json', [...tree].map(([path, value]) => ({path, sha256: hash(value.bytes), mode: value.mode, bytes: value.bytes.length})));
  await save('/results/actor-result.json', result ?? {status: 'operational_failure', error: failure, costKnown: false, costUsd: null, knownCostFloorUsd: 0});
  const row = {at: new Date().toISOString(), id: task.id, strategy: config.strategy, status: result?.status ?? 'operational_failure',
    error: failure ?? null, sourceHash, patchSha256: hash(patch), protectionViolations: violations,
    costKnown: result?.costKnown === true, costUsd: result?.costKnown ? result.costUsd : null,
    knownCostFloorUsd: result?.knownCostFloorUsd ?? 0, actorLatencyMs, repairs: result?.repairs ?? 0, takeovers: result?.takeovers ?? 0,
    usage: result?.usage ?? null, completionEvidence: result?.completionEvidence ?? null,
    writerRetries: result?.writerRetries ?? 0, verificationRecoveries: result?.verificationRecoveries ?? 0,
    controllerPolicyEligible: result?.policyEligible ?? null, controllerPolicyViolations: result?.policyViolations ?? []};
  await save('/results/attempt.json', row); return row;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  (mode === 'inspect' ? inspectContainer() : mode === 'run' ? runActor(process.argv[3]) : Promise.reject(Error('Expected inspect or run')))
    .then(value => console.log(JSON.stringify(mode === 'inspect' ? {ready: value.ready, isolation: value.isolation} : value)))
    .catch(error => {console.error(error.message); process.exitCode = 1;});
}
