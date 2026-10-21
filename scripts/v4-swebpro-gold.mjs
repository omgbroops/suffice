// Gold check for the SWE-bench Pro provider: gold patch must pass, empty diff must not.
// Usage: nice -n 19 node scripts/v4-swebpro-gold.mjs <instance_id>
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRow, prepWorkspace, runAcceptance } from '../src/v4-swebpro.mjs';

const instanceId = process.argv[2];
if (!instanceId) { console.error('usage: v4-swebpro-gold.mjs <instance_id>'); process.exit(2); }

const t0 = Date.now();
const item = { benchmark: 'swebpro', taskId: instanceId, difficulty: 'gold' };
const row = await loadRow(instanceId);
const prep = await prepWorkspace(item);
const report = { instanceId, image: row.docker_image };
try {
  const patchFile = join(tmpdir(), `gold-${process.pid}.diff`);
  writeFileSync(patchFile, row.patch);
  const applied = spawnSync('git', ['-C', prep.dir, 'apply', '--binary', patchFile], { encoding: 'utf8' });
  unlinkSync(patchFile);
  if (applied.status !== 0) throw new Error(`gold patch does not apply: ${applied.stderr}`);
  process.env.V4_RUN_LABEL ||= 'gold';
  report.gold = await runAcceptance(prep);
  report.goldWallS = (Date.now() - t0) / 1000;

  // Empty diff: reset the host workspace to baseline and expect no pass.
  spawnSync('git', ['-C', prep.dir, 'reset', '-q', '--hard', 'HEAD'], { encoding: 'utf8' });
  spawnSync('git', ['-C', prep.dir, 'clean', '-fdq'], { encoding: 'utf8' });
  process.env.V4_RUN_LABEL = `${process.env.V4_RUN_LABEL || 'gold'}-empty`; // keep the gold log, not overwrite it
  report.empty = await runAcceptance(prep);
} finally {
  await prep.cleanup();
}
report.totalWallS = (Date.now() - t0) / 1000;
console.log(JSON.stringify(report, null, 2));
const ok = report.gold.pass === true && report.empty.pass === false;
process.exit(ok ? 0 : 1);
