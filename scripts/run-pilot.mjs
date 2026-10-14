import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { root } from '../src/runtime.mjs';

const args = process.argv.slice(2);
if (!args.some(a => a.startsWith('--campaign='))) throw new Error('An explicit campaign name is required.');
for (let attempt = 0; attempt < 5; attempt++) {
  const code = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts/experiment.mjs'), ...args, ...(attempt ? ['--resume'] : [])],
      { cwd: root, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => resolveExit(code));
  });
  if (code !== 2) { process.exitCode = code ?? 1; break; }
  if (attempt === 4) { process.exitCode = 2; break; }
  console.log(JSON.stringify({ event: 'provider_cooldown', milliseconds: 60000, resume: attempt + 1,
    note: 'Completed and failed runs remain immutable; only unattempted scheduled rows resume.' }));
  await delay(60000);
}
