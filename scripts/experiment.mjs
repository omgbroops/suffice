import { cp, mkdir, readFile, writeFile, statfs, rm, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tasks } from '../benchmarks/tasks.mjs';
import { realTasks } from '../benchmarks/real/tasks.mjs';
import { hardTasks } from '../benchmarks/real-hard/tasks.mjs';
import { deepTasks } from '../benchmarks/real-deepswe/tasks.mjs';
import { midTasks } from '../benchmarks/real-deepswe/mid-tasks.mjs';
import { longTasks } from '../benchmarks/real-long/tasks.mjs';
import { createRuntime, loadEnvironment, root, stateDir } from '../src/runtime.mjs';
import { variants, runAgent, runBasePi } from '../src/harness.mjs';
import { runRace } from '../src/race.mjs';
import { runSpecAgent } from '../src/spec-agent.mjs';
import { runEco } from '../src/eco.mjs';
import { runAuto, runAutoLadder } from '../src/auto.mjs';
import { filesIn, readText, hash, materializeWorkspace } from '../src/workspace.mjs';
import { runTaskAcceptance } from '../src/deepswe-verify.mjs';
import { freezeSources } from './freeze-sources.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(s => { const at = s.indexOf('='); return at < 0 ? [s, true] : [s.slice(0, at), s.slice(at + 1)]; }));
const split = args['--split'] ?? 'pilot';
const thinkingLevel = args['--effort'] ?? 'medium';

function syncWinner(source, destination) {
  const result = spawnSync('rsync', ['-a', '--delete', '--exclude=/src/node_modules/', `${source}/`, `${destination}/`], { encoding: 'utf8' });
  if (result.status !== 0 && result.status !== 24) throw new Error(`Winner workspace sync failed: ${result.stderr || result.stdout}`);
}
if (!['low', 'medium', 'high'].includes(thinkingLevel)) throw new Error('Supported experiment efforts: low, medium, high.');
const suite = args['--suite'] ?? 'synthetic';
if (!['synthetic', 'real', 'real-hard', 'real-long', 'real-deepswe', 'real-deepswe-mid'].includes(suite)) throw new Error('Supported suites: synthetic, real, real-hard, real-long, real-deepswe, real-deepswe-mid.');
const taskPool = suite === 'real' ? realTasks.map(t => ({ ...t, split: 'real' })) : suite === 'real-hard' ? hardTasks.map(t => ({ ...t, split: 'real-hard' })) : suite === 'real-long' ? longTasks.map(t => ({ ...t, split: 'real-long' })) : suite === 'real-deepswe' ? deepTasks.map(t => ({ ...t, split: 'real-deepswe' })) : suite === 'real-deepswe-mid' ? midTasks.map(t => ({ ...t, split: 'real-deepswe-mid' })) : tasks;
const selectedTasks = taskPool.filter(t => (suite !== 'synthetic' || t.split === split) && (!args['--task'] || t.id === args['--task']) && t.id !== args['--exclude-task']);
const modelOverride = args['--model'];
const selectedVariants = variants.filter(v => !args['--variants'] || args['--variants'].split(',').includes(v.id)).map(v => modelOverride ? { ...v, model: modelOverride } : v);
if (args['--variants'] && args['--variants'].split(',').some(id => !variants.some(v => v.id === id))) throw new Error('Unknown variant; refusing partial experiment.');
if (!selectedTasks.length || !selectedVariants.length) throw new Error('No matching tasks or variants.');
const maxTurns = Number(args['--max-turns'] ?? 24);
const repetitions = Number(args['--repetitions'] ?? 1);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 4) throw new Error('Repetitions must be 1-4.');
const campaign = String(args['--campaign'] ?? `pilot-${new Date().toISOString().replace(/[:.]/g, '-')}`);
if (!/^[a-zA-Z0-9_-]+$/.test(campaign)) throw new Error('Invalid campaign name.');
const directory = resolve(stateDir, 'runs', campaign); await mkdir(directory, { recursive: true, verbatimSymlinks: true });
loadEnvironment();
const runtime = await createRuntime();
if (!runtime.isUsingSubscription('openai')) throw new Error('Run node scripts/login.mjs first.');
const inputs = {};
const inputPaths = {};
for (const file of ['package.json', 'bun.lock', 'scripts/experiment.mjs', 'scripts/run-pilot.mjs', 'scripts/freeze-sources.mjs', 'benchmarks/tasks.mjs', 'benchmarks/manifest.json', 'docs/EXPERIMENT.md', ...(suite === 'real' ? ['benchmarks/real/tasks.mjs'] : suite === 'real-hard' ? ['benchmarks/real-hard/tasks.mjs'] : suite === 'real-long' ? ['benchmarks/real-long/tasks.mjs'] : suite === 'real-deepswe' ? ['benchmarks/real-deepswe/tasks.mjs'] : suite === 'real-deepswe-mid' ? ['benchmarks/real-deepswe/mid-tasks.mjs'] : []), ...(await filesIn(resolve(root, 'src'))).map(f => `src/${f}`)]) inputs[file] = hash(await readFile(resolve(root, file)));
for (const task of selectedTasks) {
  inputs[`acceptance:${task.id}`] = hash(await readFile(task.acceptancePath));
  inputPaths[`acceptance:${task.id}`] = relative(root, task.acceptancePath);
  const workspaceBase = relative(root, task.workspaceDir);
  for (const file of await filesIn(task.workspaceDir)) { inputs[`task:${task.id}/${file}`] = hash(await readFile(resolve(task.workspaceDir, file))); inputPaths[`task:${task.id}/${file}`] = `${workspaceBase}/${file}`; }
}
const schedule = [];
for (let repetition = 0; repetition < repetitions; repetition++) {
  for (let taskIndex = 0; taskIndex < selectedTasks.length; taskIndex++) {
    const order = [...selectedVariants]; const shift = (taskIndex + repetition * 3) % order.length;
    order.push(...order.splice(0, shift)); if (repetition % 2) order.reverse();
    for (const variant of order) schedule.push({ task: selectedTasks[taskIndex].id, variant: variant.id, repetition });
  }
}
const manifest = { version: 5, campaign, startedAt: new Date().toISOString(), pi: '1.2.0', mainModel: modelOverride ?? 'variant-specific: gpt-6.1-sol or gpt-6-luna', variants: selectedVariants, reasoning: thinkingLevel, retry: { maxRetries: 2, baseDelayMs: 5000, maxAgentDelayMs: 30000, providerMaxRetries: 0 },
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  split: suite !== 'synthetic' ? suite : split, repetitions, taskProvenance: suite !== 'synthetic' ? 'Real OSS repairs' : 'AI-authored synthetic', schedule, inputs, inputPaths,
  limitations: ['Restricted workspace tools shared by all arms; Pi SDK baseline, not unrestricted stock CLI.', 'Runtime permission boundary is Node permissions, not an OS sandbox.', 'Provider cache warmth is observed, not forcibly reset.', 'Subscription cost is API-equivalent estimate, not billed spend.'] };
if (args['--resume']) {
  const frozen = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  const taskInputs = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => k.startsWith('task:') || k.startsWith('acceptance:')));
  if (frozen.reasoning !== manifest.reasoning || frozen.mainModel !== manifest.mainModel || JSON.stringify(taskInputs(frozen.inputs)) !== JSON.stringify(taskInputs(inputs)) || JSON.stringify(frozen.schedule) !== JSON.stringify(schedule)) throw new Error('Cannot resume: frozen configuration or task inputs changed.');
} else {
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
}
const sourceSnapshot = await freezeSources(campaign);
if (!sourceSnapshot.complete) throw new Error('Frozen source snapshot could not be verified.');
let consecutiveProviderErrors = 0;
let stopped = false;
for (const [index, item] of schedule.entries()) {
  const disk = await statfs(root); if (disk.bavail * disk.bsize < 5 * 1024 ** 3) throw new Error('Less than 5 GiB disk headroom; stopping.');
  const task = selectedTasks.find(t => t.id === item.task), variant = selectedVariants.find(v => v.id === item.variant);
  const runId = `${String(index + 1).padStart(3, '0')}-${task.id}-${variant.id}-r${item.repetition}`;
  const runDir = resolve(directory, runId), workspace = resolve(runDir, 'workspace');
  if (args['--resume']) {
    try { await readFile(resolve(runDir, 'result.json')); continue; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await mkdir(runDir); const generatedFiles = await materializeWorkspace(task, workspace);
  console.log(JSON.stringify({ event: 'run_start', index: index + 1, total: schedule.length, runId }));
  let agent;
  if (variant.race) {
    const { race, effort, ...inner } = variant;
    const raced = await runRace({ runtime, task, variant: inner, n: race.n ?? 3, selection: race.selection ?? 'first', attemptSpecs: race.attempts ?? [], iterate: !!race.iterate, attemptDeadlineMs: race.attemptDeadlineMs ?? null, runDir, thinkingLevel: effort ?? thinkingLevel, timeoutMs: Number(args['--timeout-ms'] ?? 240000), maxTurns });
    const winner = raced.attempts.find(a => a.index === raced.chosen);
    if (winner) syncWinner(winner.workspace, workspace);
    agent = { ...raced, decisions: [], watcherCalls: 0, turns: raced.attempts.reduce((s, a) => s + (a.turns ?? 0), 0),
      usageCostUnknown: raced.attempts.some(a => a.usageCostUnknown), race: raced };
  } else if (variant.spec !== undefined) {
    const { spec, effort, ...inner } = variant;
    const speced = await runSpecAgent({ runtime, task, variant: inner, spec, runDir, thinkingLevel: effort ?? thinkingLevel, timeoutMs: Number(args['--timeout-ms'] ?? 240000), maxTurns });
    agent = { ...speced, decisions: [], watcherCalls: 0 };
  } else if (variant.eco !== undefined) {
    const { eco, effort, ...inner } = variant;
    const ecoed = await runEco({ runtime, task, variant: inner, eco, runDir, thinkingLevel: effort ?? thinkingLevel, timeoutMs: Number(args['--timeout-ms'] ?? 240000), maxTurns });
    if (ecoed.winnerWorkspace) syncWinner(ecoed.winnerWorkspace, workspace);
    agent = { ...ecoed, decisions: [], watcherCalls: 0 };
  } else if (variant.auto !== undefined) {
    const { auto, effort, ...inner } = variant;
    const autoed = await runAuto({ runtime, task, variant: inner, workspace, runDir, thinkingLevel: effort ?? thinkingLevel, timeoutMs: Number(args['--timeout-ms'] ?? 240000), maxTurns });
    if (autoed.winnerWorkspace && autoed.winnerWorkspace !== workspace) syncWinner(autoed.winnerWorkspace, workspace);
    agent = { ...autoed, decisions: [], watcherCalls: 0 };
  } else if (variant.autoLadder !== undefined) {
    const { autoLadder, effort, ...inner } = variant;
    const laddered = await runAutoLadder({ runtime, task, variant: inner, workspace, runDir, thinkingLevel: effort ?? thinkingLevel, timeoutMs: Number(args['--timeout-ms'] ?? 240000), maxTurns });
    if (laddered.winnerWorkspace && laddered.winnerWorkspace !== workspace) syncWinner(laddered.winnerWorkspace, workspace);
    agent = { ...laddered, decisions: [], watcherCalls: 0 };
  } else if (variant.basePi) {
    agent = await runBasePi({ runtime, workspace, runDir, task, thinkingLevel: variant.effort ?? thinkingLevel, model: variant.basePiModel, timeoutMs: Number(args['--timeout-ms'] ?? 240000), maxTurns });
  } else {
    agent = await runAgent({ runtime, workspace, runDir, task, variant, thinkingLevel: variant.effort ?? thinkingLevel, timeoutMs: Number(args['--timeout-ms'] ?? 240000), maxTurns });
  }
  const before = hash(await readFile(task.acceptancePath));
  const acceptance = await runTaskAcceptance(workspace, task, { timeoutMs: 900_000 });
  const after = hash(await readFile(task.acceptancePath));
  if (before !== after || after !== inputs[`acceptance:${task.id}`]) throw new Error('Acceptance changed; abort experiment.');
  const source = {};
  for (const path of await filesIn(workspace)) source[path] = hash(await readFile(resolve(workspace, path)));
  const immutableFilesIntact = Object.entries(source).filter(([path]) => !path.startsWith('src/') && !generatedFiles.includes(path)).every(([path, value]) => value === inputs[`task:${task.id}/${path}`]);
  const result = { runId, ...item, ...agent, acceptance: { ...acceptance, stdout: undefined, stderr: undefined },
    success: agent.status === 'completed' && acceptance.status === 'passed' && immutableFilesIntact, immutableFilesIntact, source,
    watcherCostUsd: agent.decisions.reduce((sum, d) => sum + (d.costUsd ?? 0), 0),
    watcherCostUnknown: agent.decisions.some(d => d.costUsd === null),
    watcherTreatmentValid: agent.decisions.every(d => !['error', 'aborted'].includes(d.status)),
    cachePolicyValid: variant.contextPolicy ? true : !agent.prefixRegressions,
    appendOnlyPrefixPreserved: !agent.prefixRegressions,
    endedAt: new Date().toISOString() };
  result.knownEstimatedUsd = result.usage.estimatedApiUsd + result.watcherCostUsd;
  result.totalEstimatedUsd = result.usageCostUnknown || result.watcherCostUnknown ? null : result.knownEstimatedUsd;
  await writeFile(resolve(runDir, 'acceptance.json'), JSON.stringify(acceptance, null, 2));
  await writeFile(resolve(runDir, 'result.json'), JSON.stringify(result, null, 2));
  for (const e of await readdir(runDir)) if (!e.endsWith('.json') && !e.endsWith('.jsonl')) await rm(resolve(runDir, e), { recursive: true, force: true });
  console.log(JSON.stringify({ event: 'run_end', runId, status: result.status, success: result.success, turns: result.turns,
    tokens: result.usage.totalTokens, estimatedUsd: result.totalEstimatedUsd, watcherCalls: result.watcherCalls, latencyMs: result.latencyMs }));
  if (result.status === 'provider_error' && result.providerFailureKind !== 'transient_capacity') {
    console.log(JSON.stringify({ event: 'campaign_blocked', reason: 'non_transient_provider_error', directory }));
    process.exitCode = 3; stopped = true; break;
  }
  consecutiveProviderErrors = result.status === 'provider_error' ? consecutiveProviderErrors + 1 : 0;
  if (consecutiveProviderErrors >= 2) {
    console.log(JSON.stringify({ event: 'campaign_stopped', reason: 'consecutive_provider_errors', directory }));
    process.exitCode = 2;
    stopped = true;
    break;
  }
}
if (!stopped) console.log(JSON.stringify({ event: 'campaign_complete', directory }));
