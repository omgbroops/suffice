// Container orchestration only. Actor inputs never include evaluator locations or results.
import {readFile, writeFile, mkdir, readdir, lstat, access, copyFile, unlink, rename} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {runProcess} from '../src/v9/process.mjs';
import {hash} from '../src/v9/workspace.mjs';
import {runtimeFiles} from './poly27-build.mjs';

const project = resolve(import.meta.dirname, '..');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const digest = async path => hash(await readFile(path));
const save = async (path, value, exclusive = false) => {await mkdir(dirname(path), {recursive: true}); await writeFile(path, JSON.stringify(value, null, 2) + '\n', {flag: exclusive ? 'wx' : 'w'});};
const mount = (source, target, readonly = true) => {if (source.includes(',')) throw Error('Unsupported comma in bind path'); return ['--mount', `type=bind,source=${resolve(source)},target=${target}${readonly ? ',readonly' : ''}`];};
const security = ['--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--cpus', '2', '--memory', '3g', '--pids-limit', '384'];
const auth = {v10: join(project, '.suffice/pi/auth.json'), native: join(homedir(), '.codex/auth.json')};
const labels = ['--label', 'com.suffice.benchmark=poly27-locked-20261023'];
const successful = result => result?.exitCode === 0 && !result.error && !result.timedOut && !result.overflow && !result.aborted;
const problem = error => String(error?.message ?? error).slice(0, 1200);
async function privateAuthStores(root) {
  const stores = {};
  for (const strategy of ['v10', 'native']) {
    const directory = join(root, 'private-auth', strategy); await mkdir(directory, {recursive: true});
    const destination = join(directory, 'auth.json');
    try {await access(destination);} catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const temporary = destination + '.' + randomBytes(6).toString('hex') + '.next';
      try {await copyFile(auth[strategy], temporary); await rename(temporary, destination);}
      finally {try {await unlink(temporary);} catch (failure) {if (failure.code !== 'ENOENT') throw failure;}}
    }
    stores[strategy] = destination;
  }
  return stores;
}
async function docker(args, options = {}) {
  const result = await runProcess('docker', args, {timeoutMs: 60_000, maxBytes: 2_000_000, ...options});
  if (!options.allowFailure && (result.exitCode !== 0 || result.error || result.timedOut || result.overflow)) throw Error(`Docker ${args[0]} failed: ${(result.stderr || result.error || result.stdout).slice(-1200)}`);
  return result;
}
async function imageId(name) {
  const id = (await docker(['image', 'inspect', name, '--format', '{{.Id}}'])).stdout.trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw Error('Expected an immutable image ID'); return id;
}
export function publicActorTask(task) {
  const configuration = /(?:^|\/)(?:package\.json|Cargo\.toml|go\.mod|build\.gradle|CMakeLists\.txt|gradle-wrapper\.properties)$/;
  return {id: task.id, taskId: task.taskId, lang: task.lang, name: task.name, prompt: task.prompt,
    solutionFiles: task.solutionFiles, actorFiles: task.actorFiles,
    immutablePaths: [...new Set([...task.immutablePaths, ...task.actorFiles.filter(f => configuration.test(f.path)).map(f => f.path)])]};
}
export async function closeRelay({name, directory, dockerRun = docker, write = writeFile}) {
  const errors = []; let removed = false;
  try {
    const logs = await dockerRun(['logs', name], {allowFailure: true});
    if (!successful(logs)) throw Error('Could not collect relay logs');
    await write(join(directory, 'model-relay.jsonl'), logs.stdout);
  } catch (error) {errors.push({step: 'relay_logs', error: problem(error)});}
  finally {
    try {const out = await dockerRun(['rm', '--force', name], {allowFailure: true}); removed = successful(out); if (!removed) errors.push({step: 'relay_remove', error: 'Relay removal failed'});}
    catch (error) {errors.push({step: 'relay_remove', error: problem(error)});}
  }
  return {removed, errors};
}
async function relay(image, directory) {
  await mkdir(directory, {recursive: true}); const name = 'poly27-relay-' + randomBytes(5).toString('hex');
  await docker(['run', '--detach', '--name', name, ...labels, '--network', 'bridge', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only', '--entrypoint', 'node', image, '/opt/suffice/scripts/poly27-proxy.mjs']);
  return {name, close: () => closeRelay({name, directory})};
}
// Never read or log credential bytes. A successful docker copy is renamed on the same
// filesystem only after the actor is observed stopped; cleanup runs after every error.
export async function closeActorBox({name, network, proxyName, created, strategy, authStore, dockerRun = docker, replaceAuth = rename}) {
  const errors = []; let stopped = false, removed = false, authSync = {status: 'not_requested'}, temporary;
  const step = async (label, fn) => {try {return await fn();} catch (error) {errors.push({step: label, error: problem(error)}); return null;}};
  const cleanupCommand = (label, args) => step(label, async () => {const out = await dockerRun(args, {allowFailure: true}); if (!successful(out)) throw Error('Docker cleanup command failed: ' + label); return out;});
  const state = async () => {
    const out = await dockerRun(['inspect', '--format', '{{json .State}}', name], {allowFailure: true});
    if (!successful(out)) return null;
    const value = JSON.parse(out.stdout); return typeof value.Running === 'boolean' ? value.Running : null;
  };
  try {
    if (created) {
      let running = await step('actor_state', state);
      if (running !== false) {await cleanupCommand('actor_stop', ['stop', '--time', '5', name]); running = await step('actor_state_after_stop', state);}
      stopped = running === false;
      if (authStore) {
        if (!stopped) {authSync = {status: 'failed', error: 'Actor stop was not confirmed; auth synchronization skipped'}; errors.push({step: 'auth_sync', error: authSync.error});}
        else {
          temporary = authStore + '.' + randomBytes(6).toString('hex') + '.next';
          const clientPath = strategy === 'v10' ? '/opt/suffice/.suffice/pi/auth.json' : '/home/node/.codex/auth.json';
          try {
            const copied = await dockerRun(['cp', `${name}:${clientPath}`, temporary], {allowFailure: true});
            if (!successful(copied)) throw Error('Opaque auth copy failed');
            const info = await lstat(temporary); if (!info.isFile() || info.isSymbolicLink() || info.size === 0) throw Error('Opaque auth copy is not a nonempty regular file');
            await replaceAuth(temporary, authStore); temporary = null; authSync = {status: 'updated'};
          } catch (error) {authSync = {status: 'failed', error: problem(error)}; errors.push({step: 'auth_sync', error: authSync.error});}
        }
      }
    }
  } finally {
    if (temporary) await step('auth_temporary_remove', async () => {try {await unlink(temporary);} catch (error) {if (error.code !== 'ENOENT') throw error;}});
    await cleanupCommand('actor_remove', ['rm', '--force', name]);
    await step('actor_removal_confirmation', async () => {
      const out = await dockerRun(['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.ID}}'], {allowFailure: true});
      removed = successful(out) && !out.stdout.trim(); if (!removed) throw Error('Actor container removal was not confirmed');
    });
    await cleanupCommand('network_disconnect', ['network', 'disconnect', '--force', network, proxyName]);
    await cleanupCommand('network_remove', ['network', 'rm', network]);
  }
  return {stopped, removed, safeToContinue: removed, authSync, errors};
}
export async function runBox({image, proxy, directory, task, strategy, timeoutMs, pricing, inspect = false, authStores = auth, dockerRun = docker, replaceAuth = rename}) {
  await mkdir(directory, {recursive: true});
  const suffix = randomBytes(5).toString('hex'), network = 'poly27-net-' + suffix, name = 'poly27-actor-' + suffix;
  const configDir = join(directory, 'public-config'); await mkdir(configDir);
  const config = {strategy, timeoutMs, pricing, ...(task ? {task: publicActorTask(task)} : {})};
  await save(join(configDir, 'actor.json'), config, true);
  let created = false, processResult, outcome, failure, cleanup;
  try {
    await dockerRun(['network', 'create', '--internal', ...labels, network]);
    await dockerRun(['network', 'connect', '--alias', 'model-relay', network, proxy.name]);
    const inspection = JSON.parse((await dockerRun(['inspect', proxy.name])).stdout)[0];
    const proxyIp = inspection.NetworkSettings.Networks[network].IPAddress;
    const args = ['create', '--name', name, ...labels, ...security, '--network', network, '--dns', '127.0.0.1', '--add-host', `model-relay:${proxyIp}`,
      '--env', 'HTTPS_PROXY=http://model-relay:3128', '--env', 'HTTP_PROXY=http://model-relay:3128', '--env', 'ALL_PROXY=http://model-relay:3128',
      '--env', 'NODE_USE_ENV_PROXY=1', '--env', 'NO_PROXY=localhost,127.0.0.1',
      ...mount(directory, '/results', false), ...mount(configDir, '/config')];
    if (task) args.push(...mount(task.workspace, '/input'));
    if (inspect || strategy === 'v10') args.push(...mount(authStores.v10, '/run/pi-auth.json'));
    if (inspect || strategy === 'native') args.push(...mount(authStores.native, '/run/native-auth.json'));
    args.push(image, inspect ? 'inspect' : 'run');
    await dockerRun(args); created = true;
    await save(join(directory, 'container.json'), {at: new Date().toISOString(), name, image, network, internalNetwork: true, args});
    processResult = await dockerRun(['start', '--attach', name], {timeoutMs: inspect ? 120_000 : timeoutMs + 150_000, allowFailure: true,
      stdoutPath: join(directory, 'container-stdout.txt'), stderrPath: join(directory, 'container-stderr.txt')});
    if (processResult.timedOut || processResult.aborted) await dockerRun(['stop', '--time', '5', name], {allowFailure: true});
    await save(join(directory, 'process.json'), {...processResult, stdout: undefined, stderr: undefined});
    if (inspect) outcome = await read(join(directory, 'inspection.json'));
    else try {outcome = await read(join(directory, 'attempt.json'));}
    catch (error) {
      // Preserve partial source on a host/container failure, without inventing a patch/verdict.
      await dockerRun(['cp', `${name}:/work/${task.name}`, join(directory, 'partial-workspace')], {allowFailure: true});
      outcome = {id: task.id, strategy, status: 'closure_failure', error: error.message, costKnown: false, costUsd: null, knownCostFloorUsd: 0,
        actorLatencyMs: processResult.latencyMs, repairs: 0, takeovers: 0, protectionViolations: []};
    }
  } catch (error) {failure = error;}
  finally {
    cleanup = await closeActorBox({name, network, proxyName: proxy.name, created, strategy,
      authStore: created && !inspect && authStores !== auth ? authStores[strategy] : null, dockerRun, replaceAuth});
    try {await save(join(directory, 'cleanup.json'), cleanup, true);}
    catch (error) {cleanup.errors.push({step: 'cleanup_record', error: problem(error)}); cleanup.safeToContinue = false;}
  }
  if (failure) {failure.cleanup = cleanup; throw failure;}
  if (inspect && !cleanup.safeToContinue) throw Object.assign(Error('Inspection container removal was not confirmed'), {cleanup});
  return {...outcome, cleanup};
}
export async function inspectEnvironment(root, image = 'suffice-poly27-actor:20261023') {
  root = resolve(root); const actorImage = await imageId(image), directory = join(root, 'preflight', 'inspection-' + Date.now());
  const proxy = await relay(actorImage, join(directory, 'relay'));
  try {const result = await runBox({image: actorImage, proxy, directory: join(directory, 'box'), inspect: true});
    await save(join(root, 'inspection.json'), {...result, actorImage, evidenceDirectory: directory});
    if (!result.ready) throw Error('Exact models, authentication or offline environment inspection failed; no benchmark actors started');
    return {...result, actorImage};
  } finally {await proxy.close();}
}
export async function modelCanaries(root) {
  root = resolve(root); const inspection = await read(join(root, 'inspection.json')); if (!inspection.ready) throw Error('Environment is not ready');
  const base = join(root, 'preflight', 'canaries-' + Date.now()), fixture = join(base, 'fixture', 'protocol-canary'); await mkdir(fixture, {recursive: true});
  const prompt = 'Implement def identity(value) in identity.py so it returns the supplied value unchanged. Exercise the function using your own pytest checks.';
  const files = {'identity.py': 'def identity(value):\n    raise NotImplementedError\n', 'TASK.md': prompt + '\n'};
  const actorFiles = [];
  for (const [path, content] of Object.entries(files)) {await writeFile(join(fixture, path), content); actorFiles.push({path, sha256: hash(content), bytes: Buffer.byteLength(content), mode: 0o644});}
  const task = {id: 'protocol-canary', taskId: 'python/protocol-canary', lang: 'python', name: 'protocol-canary', prompt, workspace: fixture,
    solutionFiles: ['identity.py'], immutablePaths: ['TASK.md'], actorFiles};
  const authStores = await privateAuthStores(root), proxy = await relay(inspection.actorImage, join(base, 'relay')), results = [];
  try {
    for (const strategy of ['native', 'v10']) {
      const directory = join(base, strategy), result = await runBox({image: inspection.actorImage, proxy, directory, task, strategy, timeoutMs: 300_000, pricing: inspection.pricing, authStores});
      if (!result.cleanup.safeToContinue) throw Error('Canary actor removal was not confirmed; no further actors may start');
      const probe = await docker(['run', '--rm', '--network', 'none', ...security, ...mount(join(directory, 'sealed-source'), '/probe'), '--entrypoint', 'python3', inspection.actorImage,
        '-c', "import runpy; f=runpy.run_path('/probe/identity.py')['identity']; assert f(42)==42; assert f('ready')=='ready'; print('CANARY_PASSED')"], {allowFailure: true});
      const passed = result.status === 'completed' && result.costKnown && result.cleanup.authSync.status === 'updated' && probe.exitCode === 0 && probe.stdout.includes('CANARY_PASSED');
      results.push({strategy, passed, result, probe: {...probe, stdout: probe.stdout, stderr: probe.stderr}});
      await save(join(directory, 'canary.json'), results.at(-1));
      if (!passed) break;
    }
    const value = {at: new Date().toISOString(), actorImage: inspection.actorImage, passed: results.length === 2 && results.every(r => r.passed), results};
    await save(join(root, 'model-canaries.json'), value); if (!value.passed) throw Error('Live model/tool canary failed; cohort not started'); return value;
  } finally {await proxy.close();}
}
export function schedulePairs(tasks, seed = 20261023) {
  let state = seed >>> 0; const next = () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  const ordered = [...tasks]; for (let i = ordered.length - 1; i > 0; i--) {const j = next() % (i + 1); [ordered[i], ordered[j]] = [ordered[j], ordered[i]];}
  return ordered.flatMap(task => (next() % 2 ? ['native', 'v10'] : ['v10', 'native']).map(strategy => ({id: `${task.id}-r1-${strategy}`, taskId: task.id, strategy, repeat: 1})));
}
async function inventory(directory) {
  const out = []; for (const entry of (await readdir(directory, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name); if (entry.isSymbolicLink()) throw Error('Frozen inputs must be regular files');
    if (entry.isDirectory()) out.push(...await inventory(path)); else if (entry.isFile()) out.push({path, sha256: await digest(path)}); else throw Error('Special frozen input');
  } return out;
}
const packageFiles = ['package.json', 'package-lock.json'];
const actorImageFiles = () => [...new Set([...runtimeFiles, ...packageFiles])].sort();
const graderImageFiles = () => ['src/v9/process.mjs', 'scripts/poly27-public-check.mjs', 'scripts/poly27-grader-entry.mjs', ...packageFiles].sort();
export async function bindImageCode(image, paths, {dockerRun = docker, hostRoot = project} = {}) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('Code binding requires an immutable image ID');
  if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length || paths.some(path => typeof path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => ['..', '.', ''].includes(part)))) throw Error('Unsafe code binding paths');
  const expected = await Promise.all(paths.map(async path => ({path, sha256: await digest(join(hostRoot, path))})));
  const source = "import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';const paths=JSON.parse(process.argv[1]);const rows=await Promise.all(paths.map(async path=>({path,sha256:createHash('sha256').update(await readFile('/opt/suffice/'+path)).digest('hex')})));process.stdout.write(JSON.stringify(rows)+'\\n');";
  const args = ['run', '--rm', '--network', 'none', '--read-only', ...security, '--entrypoint', 'node', image, '--input-type=module', '-e', source, JSON.stringify(paths)];
  const result = await dockerRun(args, {timeoutMs: 60_000});
  if (!successful(result)) throw Error('In-image code digest probe failed');
  let observed; try {observed = JSON.parse(result.stdout);} catch {throw Error('Malformed in-image code digest receipt');}
  if (!Array.isArray(observed) || observed.length !== expected.length || observed.some((row, i) => !row || Object.keys(row).sort().join(',') !== 'path,sha256' || row.path !== expected[i].path || row.sha256 !== expected[i].sha256)) throw Error('In-image code differs from frozen host runtime');
  return {version: 1, image, verifiedAt: new Date().toISOString(), files: expected, codeSha256: hash(JSON.stringify(expected)),
    probe: {command: ['docker', ...args], exitCode: result.exitCode, stdoutSha256: hash(result.stdout)}};
}
function verifyImageBindings(plan) {
  const pinned = new Map(plan.runtimeFiles.map(file => [resolve(file.path), file.sha256]));
  for (const [kind, image, paths] of [['actor', plan.actorImage, actorImageFiles()], ['grader', plan.graderImage, graderImageFiles()]]) {
    const receipt = plan.imageCodeBindings?.[kind];
    if (!receipt || receipt.image !== image || receipt.codeSha256 !== hash(JSON.stringify(receipt.files)) || receipt.files?.length !== paths.length || receipt.files.some((file, i) => file.path !== paths[i] || file.sha256 !== pinned.get(resolve(project, file.path)))) throw Error('Frozen image/code binding differs: ' + kind);
  }
}
export async function freezePlan(root, grader = 'suffice-poly27-grader:20261023') {
  root = resolve(root); const tasks = await read(join(root, 'public-tasks.json')), inspection = await read(join(root, 'inspection.json')),
    canaries = await read(join(root, 'model-canaries.json')), validation = await read(join(root, 'reference-validation.json')), graderImage = await imageId(grader);
  if (tasks.length !== 27 || !inspection.ready || !canaries.passed || canaries.actorImage !== inspection.actorImage || !validation.valid || validation.tasks.length !== 27 || validation.graderImage !== graderImage) throw Error('All model/isolation/reference gates must pass before freezing');
  const imageCodeBindings = {actor: await bindImageCode(inspection.actorImage, actorImageFiles()), grader: await bindImageCode(graderImage, graderImageFiles())};
  const runtimePaths = [...new Set([...runtimeFiles, 'package.json', 'package-lock.json', 'containers/poly27/Dockerfile', 'docs/POLY27-LOCKED-PROTOCOL.md', 'scripts/poly27-build.mjs', 'scripts/poly27-bench.mjs', 'scripts/poly27-prepare.mjs', 'scripts/poly27-grader-entry.mjs', 'scripts/poly27-evaluate.mjs'])];
  const pinnedRuntime = await Promise.all(runtimePaths.map(async path => ({path: join(project, path), sha256: await digest(join(project, path))})));
  const evaluationEntries = [...await inventory(join(root, 'evaluators')), ...await inventory(join(root, 'fixtures')),
    ...await Promise.all(['public-tasks.json', 'reference-validation.json', 'inspection.json', 'model-canaries.json'].map(async name => ({path: join(root, name), sha256: await digest(join(root, name))}))),
    ...(validation.evidenceFiles ?? [])];
  const uniqueEvaluation = new Map();
  for (const file of evaluationEntries) {const path = resolve(file.path), prior = uniqueEvaluation.get(path); if (prior && prior.sha256 !== file.sha256) throw Error('Conflicting frozen input digests'); uniqueEvaluation.set(path, {path, sha256: file.sha256});}
  const evaluationFiles = [...uniqueEvaluation.values()];
  const plan = {version: 'poly27-locked-1', at: new Date().toISOString(), cohort: '27 known development exercises; not a SWE-bench Pro score', tasks: tasks.map(t => ({id: t.id, taskId: t.taskId})),
    actorImage: inspection.actorImage, graderImage, models: {worker: 'gpt-6-luna', expert: 'gpt-6.1-sol', native: 'gpt-6.1-sol'},
    timeoutMs: 50 * 60_000, monetaryCap: null, concurrency: 2, seed: 20261023, schedule: schedulePairs(tasks),
    runtimeFiles: pinnedRuntime, imageCodeBindings, evaluationFiles, pricing: inspection.pricing, publicInputsSha256: await digest(join(root, 'public-tasks.json'))};
  verifyImageBindings(plan);
  plan.fingerprint = hash(JSON.stringify(plan)); await save(join(root, 'plan.json'), plan, true); return plan;
}
async function verifyPlan(root, plan) {
  const {fingerprint, ...body} = plan; if (hash(JSON.stringify(body)) !== fingerprint) throw Error('Plan fingerprint differs');
  verifyImageBindings(plan);
  for (const file of [...plan.runtimeFiles, ...plan.evaluationFiles]) if (await digest(file.path) !== file.sha256) throw Error('Frozen file changed: ' + file.path);
  if (await imageId(plan.actorImage) !== plan.actorImage || await imageId(plan.graderImage) !== plan.graderImage) throw Error('Pinned image unavailable');
  await access(auth.v10); await access(auth.native);
}
// An unsafe closure latches both lanes off. Already-running work finishes, but no
// client can start another actor while a prior container may still be alive.
export async function runIndependentLanes(schedule, work, record = async () => {}) {
  const attempts = []; let halted = false;
  const lanes = await Promise.allSettled(['v10', 'native'].map(async strategy => {
    for (const item of schedule.filter(row => row.strategy === strategy)) {
      if (halted) return;
      try {
        const row = await work(item);
        if (row.cleanup?.safeToContinue === false) halted = true;
        attempts.push(row); await record(row, [...attempts]);
      } catch (error) {halted = true; throw error;}
    }
  }));
  const failure = lanes.find(lane => lane.status === 'rejected');
  if (failure) throw failure.reason;
  return {attempts, halted};
}
export async function runCohort(root) {
  root = resolve(root); const plan = await read(join(root, 'plan.json')); await verifyPlan(root, plan);
  const tasks = await read(join(root, 'public-tasks.json')), startedAt = new Date().toISOString(), authStores = await privateAuthStores(root);
  await save(join(root, 'execution-started.json'), {at: startedAt, planSha256: await digest(join(root, 'plan.json')), planFingerprint: plan.fingerprint}, true);
  const proxy = await relay(plan.actorImage, join(root, 'execution-relay'));
  let outcome, relayCleanup;
  try {
    // One lane per client/auth store; no concurrent refreshes within an arm.
    outcome = await runIndependentLanes(plan.schedule, async item => {
      const strategy = item.strategy, task = tasks.find(t => t.id === item.taskId), attemptPath = join(root, 'attempts', item.id), began = Date.now(); let result;
      try {result = await runBox({image: plan.actorImage, proxy, directory: attemptPath, task, strategy, timeoutMs: plan.timeoutMs, pricing: plan.pricing, authStores});}
      catch (error) {result = {status: 'infrastructure_error', error: error.message, costKnown: false, costUsd: null, knownCostFloorUsd: 0, repairs: 0, takeovers: 0, cleanup: error.cleanup ?? {safeToContinue: false, errors: [{step: 'unknown_closure', error: error.message}]}};}
      return {...result, ...item, attemptPath, patchPath: join(attemptPath, 'patch.diff'), latencyMs: Date.now() - began,
        policyValid: result.status === 'completed' && result.cleanup?.safeToContinue === true && (result.protectionViolations ?? []).length === 0 && result.actorLatencyMs <= plan.timeoutMs};
    }, async (row, snapshot) => {
      const completed = snapshot.length;
      await save(join(row.attemptPath, 'scheduled-attempt.json'), row);
      await save(join(root, `progress-${completed}.json`), {at: new Date().toISOString(), closed: false, completed, attempts: snapshot});
      console.log(JSON.stringify({completed, scheduled: 54, id: row.id, status: row.status, costUsd: row.costUsd}));
    });
  } finally {relayCleanup = await proxy.close(); await save(join(root, 'execution-relay', 'cleanup.json'), relayCleanup);}
  if (outcome.halted || !relayCleanup.removed) {
    await save(join(root, 'execution-halted.json'), {at: new Date().toISOString(), closed: false, planFingerprint: plan.fingerprint, attempts: outcome.attempts, relayCleanup,
      reason: 'Actor or relay container removal could not be confirmed; no further attempts may start'}, true);
    throw Error('Cohort halted after unsafe container closure; sealed attempts were preserved');
  }
  await verifyPlan(root, plan);
  const ordered = plan.schedule.map(s => outcome.attempts.find(a => a.id === s.id));
  const execution = {at: new Date().toISOString(), startedAt, closed: ordered.length === 54 && ordered.every(Boolean), planFingerprint: plan.fingerprint,
    planSha256: await digest(join(root, 'plan.json')), attempts: ordered, relayCleanup};
  await save(join(root, 'execution-complete.json'), execution, true); return execution;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, root, image] = process.argv.slice(2);
  const action = mode === 'inspect' ? inspectEnvironment(root, image) : mode === 'canaries' ? modelCanaries(root) : mode === 'plan' ? freezePlan(root, image) : mode === 'run' ? runCohort(root) : Promise.reject(Error('Expected inspect|canaries|plan|run <prepared-root> [image]'));
  action.then(result => console.log(JSON.stringify({mode, ready: result.ready, passed: result.passed, closed: result.closed, fingerprint: result.fingerprint}))).catch(error => {console.error(error.stack); process.exitCode = 1;});
}
