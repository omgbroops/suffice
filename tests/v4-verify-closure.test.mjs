import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBench } from '../scripts/v4-bench.mjs';

// Fake provider: acceptance passes only when a.txt reads 'fixed' AND no leftover.txt exists in the verified dir.
async function snapshotDir(files) {
  const d = await mkdtemp(join(tmpdir(), 'v4-snap-'));
  await mkdir(join(d, 'src'), { recursive: true });
  for (const [f, body] of Object.entries(files)) await writeFile(join(d, 'src', f), body);
  return d;
}

test('round-1 leftovers do not leak into the final verdict (gate self)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'v4-closure-'));
  const results = join(root, 'rows.jsonl');
  const provider = {
    async prepWorkspace() {
      const dir = join(root, 'prep');
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src/a.txt'), 'broken\n');
      return { dir, acceptanceCommand: 'stub', cleanup: async () => {} };
    },
    async runAcceptance(prep) {
      const a = (await readFile(join(prep.dir, 'src/a.txt'), 'utf8')).trim();
      const leftover = await access(join(prep.dir, 'src/leftover.txt')).then(() => true, () => false);
      return a === 'fixed' && !leftover;
    },
  };
  // Round 1 writes a leftover file and passes otherwise; the final workspace is clean and fixed.
  const runTask = async ({ verify, task }) => {
    const round1 = await snapshotDir({ 'a.txt': 'fixed\n', 'leftover.txt': 'x\n' });
    const firstAttemptPass = await verify(round1);
    const final = await snapshotDir({ 'a.txt': 'fixed\n' });
    const finalPass = await verify(final);
    const row = { task: task.id, status: 'completed', firstAttemptPass, finalPass };
    await writeFile(results, JSON.stringify(row) + '\n');
    return row;
  };
  const rows = await runBench({ items: [{ taskId: 't0' }], arm: 'v4', workers: 1, globalCapUsd: 1, results,
    provider, probe: async () => 90, runTask, gate: 'self' });
  assert.equal(rows[0].firstAttemptPass, false, 'round-1 snapshot has a leftover file, so it must fail');
  assert.equal(rows[0].finalPass, true, 'final verdict must not inherit round-1 leftovers');
});
