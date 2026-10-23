import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(directory, '..', '..');
mkdirSync(resolve(directory, 'logs'), { recursive: true });
const runs = [];
for (const kind of ['retry', 'json-lines']) {
  for (const target of ['original', 'reference']) {
    const workspace = target === 'original'
      ? resolve(fixtures, kind)
      : resolve(directory, 'reference', kind);
    const args = [resolve(directory, 'grade-development.mjs'), kind, workspace];
    const startedAt = new Date().toISOString();
    const result = spawnSync(process.execPath, args, {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    });
    const completedAt = new Date().toISOString();
    const stdout = `logs/${kind}-${target}.stdout.log`;
    const stderr = `logs/${kind}-${target}.stderr.log`;
    writeFileSync(resolve(directory, stdout), result.stdout ?? '');
    writeFileSync(resolve(directory, stderr), result.stderr ?? '');
    const expected = target === 'original' ? 'nonzero' : 0;
    const expectationMet = !result.error && (expected === 'nonzero' ? result.status !== 0 : result.status === 0);
    runs.push({
      kind, target, command: [process.execPath, ...args], cwd: directory,
      startedAt, completedAt, exitCode: result.status, signal: result.signal,
      expectedExit: expected, expectationMet, stdout, stderr,
      ...(result.error ? { executionError: String(result.error) } : {}),
    });
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  scope: 'Original fixtures and independent references only; no actor workspace evaluated.',
  allExpectationsMet: runs.every(run => run.expectationMet),
  runs,
};
writeFileSync(resolve(directory, 'validation.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.allExpectationsMet) process.exitCode = 1;
