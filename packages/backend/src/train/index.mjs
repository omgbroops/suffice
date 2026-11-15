import { assertShape } from '../contract.mjs';

const TAIL = 2000;
const okName = (b) => typeof b === 'string' && b !== '' && !b.startsWith('-');

export function createTrain({ exec, journal, clock } = {}) {
  if (typeof exec !== 'function') throw new TypeError('createTrain: exec must be a function');
  assertShape('journal', journal, ['append', 'read']);
  assertShape('clock', clock, ['now']);

  function plan(branches, { base } = {}) {
    if (!Array.isArray(branches) || !branches.every(okName)) throw new TypeError('plan: branches must be an array of non-empty names not starting with "-"');
    if (!okName(base)) throw new TypeError('plan: base must be a branch name');
    return [...new Set(branches)].filter((b) => b !== base);
  }

  async function run({ repoDir, base, target, branches, gates, batch = 4 } = {}) {
    if (typeof repoDir !== 'string' || !repoDir) throw new TypeError('run: repoDir must be a non-empty string');
    if (!okName(target)) throw new TypeError('run: target must be a branch name');
    if (!Array.isArray(gates) || !gates.every((g) => g && g.name && g.command && Array.isArray(g.args ?? []))) throw new TypeError('run: gates must be a list of {name, command, args, timeoutMs}');
    if (!Number.isInteger(batch) || batch < 1) throw new TypeError('run: batch must be a positive integer');
    const list = plan(branches, { base });
    const git = (...a) => exec('git', a, { cwd: repoDir });
    const must = async (...a) => { const r = await git(...a); if (r.code !== 0) throw new Error(`git ${a[0]} failed: ${r.stderr.trim()}`); return r.stdout.trim(); };
    const log = (type, data) => journal.append({ type, data: { ...data, ts: clock.now() } });

    if ((await must('status', '--porcelain')) !== '') throw new Error('work tree is dirty; refusing to run');

    const events = await journal.read();
    const start = events.find((e) => e.type === 'train.start' && e.data.target === target);
    const targetExists = (await git('rev-parse', '--verify', '--quiet', `refs/heads/${target}`)).code === 0;
    let green;
    if (!start) {
      if (targetExists) throw new Error(`target branch "${target}" already exists`);
      // journal first: a crash after the branch exists must leave a record that explains it
      green = await must('rev-parse', '--verify', `${base}^{commit}`);
      await log('train.start', { base, target, green });
      await must('checkout', '-q', '-b', target, green);
    } else {
      // resume: the last journaled green commit is the truth; anything after it is unverified
      const last = events.filter((e) => e.type === 'train.merge' || e.type === 'train.start').at(-1).data;
      green = last.sha ?? last.green;
      if (targetExists) {
        const chain = (await must('rev-list', '--first-parent', `refs/heads/${target}`)).split('\n');
        if (!chain.includes(start.data.green)) throw new Error(`target branch "${target}" does not start at the journaled base`);
        await must('checkout', '-q', target);
      } else await must('checkout', '-q', '-b', target, green);
      await must('reset', '--hard', '-q', green);
    }
    const decided = new Set(events.filter((e) => e.type === 'train.merge' || e.type === 'train.drop').map((e) => e.data.branch));
    const gateResults = [];

    const drop = (branch, reason, extra = {}) => log('train.drop', { branch, reason, ...extra });

    async function runGates(group) {
      for (const g of gates) {
        let r;
        try { r = await exec(g.command, g.args ?? [], { cwd: repoDir, timeoutMs: g.timeoutMs }); }
        catch (e) { r = { code: 1, stdout: '', stderr: String(e.message), timedOut: false }; }
        const res = { name: g.name, code: r.code, pass: r.code === 0, branches: group };
        gateResults.push(res);
        await log('train.gate', res);
        if (!res.pass) return { name: g.name, tail: (r.stdout + r.stderr).slice(-TAIL) };
      }
      return null;
    }

    // merge `group` onto green, gate it; on failure bisect. Always leaves HEAD at green.
    async function land(group) {
      await must('reset', '--hard', '-q', green);
      const merged = [];
      for (const b of group) {
        if ((await git('merge', '--no-ff', '--no-edit', b)).code === 0) merged.push(b);
        else { await git('merge', '--abort'); await must('reset', '--hard', '-q', green); await drop(b, 'conflict'); }
      }
      if (!merged.length) return;
      const fail = await runGates(merged);
      if (!fail) {
        green = await must('rev-parse', 'HEAD');
        for (const b of merged) await log('train.merge', { branch: b, sha: green });
        return;
      }
      await must('reset', '--hard', '-q', green);
      if (merged.length === 1) return drop(merged[0], 'gate failure', { gate: fail.name, tail: fail.tail });
      const mid = merged.length >> 1;
      await land(merged.slice(0, mid));
      await land(merged.slice(mid));
    }

    const todo = [];
    for (const b of list) {
      if (decided.has(b)) continue;
      if ((await git('rev-parse', '--verify', '--quiet', `refs/heads/${b}`)).code !== 0) await drop(b, 'not found');
      else todo.push(b);
    }
    for (let i = 0; i < todo.length; i += batch) await land(todo.slice(i, i + batch));

    const after = await journal.read();
    const merged = after.filter((e) => e.type === 'train.merge').map((e) => e.data.branch);
    const dropped = after.filter((e) => e.type === 'train.drop').map(({ data: { ts, ...d } }) => d);
    const commit = await must('rev-parse', 'HEAD');
    await log('train.done', { commit, merged, dropped: dropped.map((d) => d.branch) });
    return { merged, dropped, commit, gates: gateResults };
  }

  return { plan, run };
}
