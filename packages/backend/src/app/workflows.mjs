// Built-in workflows: fn(api, args, {runId, handoff}). Explicit agent keys so resume replays finished steps.
// args.test = {cmd, args?} is the gate command; its exit code decides (the engine's gate never reads output).
const runTest = (api, a) => api.exec(a.test.cmd, a.test.args ?? [], { cwd: a.cwd });
const need = (a) => {
  if (!a?.task || typeof a.task !== 'string') throw new TypeError('args.task: expected a string');
  if (typeof a.test?.cmd !== 'string') throw new TypeError('args.test.cmd: expected a string');
};
const GateError = 'GateError';

async function planBuildReview(api, a) {
  need(a);
  await api.phase('plan');
  const plan = await api.agent(`Plan the work for: ${a.task}`, { key: 'plan', label: 'planner', cwd: a.cwd });
  await api.phase('build');
  await api.agent(`Implement this plan.\nTask: ${a.task}\nPlan:\n${plan}`, { key: 'build', label: 'builder', cwd: a.cwd });
  let repaired = false;
  try { await api.gate('tests', await runTest(api, a)); } catch (e) {
    if (e?.name !== GateError) throw e;
    repaired = true; // one repair, then a second failure ends the run
    await api.phase('repair');
    await api.agent(`The test command failed. Fix it.\nTask: ${a.task}`, { key: 'repair', label: 'repair', cwd: a.cwd });
    await api.gate('tests-after-repair', await runTest(api, a));
  }
  await api.phase('review');
  const review = await api.agent(`Review the finished change for: ${a.task}`, { key: 'review', label: 'reviewer', cwd: a.cwd });
  return { repaired, review };
}

// plan, then a human approves before anything is built; a denial ends the run (resume asks nothing new)
async function planApproveBuild(api, a) {
  need(a);
  await api.phase('plan');
  const plan = await api.agent(`Plan the work for: ${a.task}`, { key: 'plan', label: 'planner', cwd: a.cwd });
  await api.approval('build-plan', { task: a.task, plan: String(plan).slice(0, 2000) });
  await api.phase('build');
  await api.agent(`Implement this plan.\nTask: ${a.task}\nPlan:\n${plan}`, { key: 'build', label: 'builder', cwd: a.cwd });
  await api.gate('tests', await runTest(api, a));
  return { plan };
}

async function researchRelay(api, a, { runId, handoff }) {
  if (!a?.topic || typeof a.topic !== 'string') throw new TypeError('args.topic: expected a string');
  const lanes = Number.isInteger(a.lanes) && a.lanes > 0 ? a.lanes : 2;
  const notes = await api.parallel(Array.from({ length: lanes }, (_, i) => async () => {
    const first = await api.agent(`Lane ${i + 1}: research "${a.topic}". End with handoff notes.`, { key: 'first', label: `lane${i}-first` });
    // handoff write is an overwrite, so a resumed lane repeats it harmlessly
    await handoff?.writeHandoff({ runId: `${runId}-lane${i}`, done: [String(first).slice(0, 500)], open: [], next: 'second agent continues', pointers: [] });
    return api.agent(`Continue lane ${i + 1} on "${a.topic}" from these notes:\n${first}`, { key: 'second', label: `lane${i}-second` });
  }));
  const summary = await api.agent(`Synthesize these lane results on "${a.topic}":\n${notes.join('\n---\n')}`, { key: 'synth', label: 'synthesis' });
  return { lanes, summary };
}

async function bestOfN(api, a) {
  need(a);
  const n = Number.isInteger(a.n) && a.n > 0 ? a.n : 3;
  // shortcut: "diff size" is the length of the attempt's output, not a real git diff; swap in `git diff --numstat` when cwd is a repo
  const attempts = await api.parallel(Array.from({ length: n }, (_, i) => async () => {
    const out = await api.agent(`Attempt ${i + 1}: ${a.task}`, { key: 'attempt', label: `attempt${i}`, cwd: a.cwd });
    let passed = true;
    try { await api.gate(`attempt${i}`, await runTest(api, a)); } catch (e) { if (e?.name !== GateError) throw e; passed = false; }
    return { attempt: i, passed, size: JSON.stringify(out ?? '').length };
  }));
  const ok = attempts.filter((x) => x?.passed).sort((x, y) => x.size - y.size || x.attempt - y.attempt);
  return { attempts: attempts.map((x, i) => x ?? { attempt: i, passed: false, size: 0 }), winner: ok[0]?.attempt ?? null };
}

export const workflows = { 'plan-build-review': planBuildReview, 'plan-approve-build': planApproveBuild, 'research-relay': researchRelay, 'best-of-n': bestOfN };
