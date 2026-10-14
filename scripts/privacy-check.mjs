import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { root } from '../src/runtime.mjs';

const secrets = [];
try {
  const env = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
  secrets.push(...['OPENROUTER_API_KEY', 'JEV_API_KEY'].map(k => env[k]).filter(Boolean));
} catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read local environment for private comparison.'); }
try {
  const auth = JSON.parse(await readFile(resolve(root, '.suffice/pi/auth.json'), 'utf8'));
  for (const value of Object.values(auth)) for (const field of ['access', 'refresh', 'key']) if (typeof value?.[field] === 'string') secrets.push(value[field]);
} catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read own Pi credentials for private comparison.'); }
const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error('Cannot enumerate reviewable repository files.');
let count = 0;
for (const path of result.stdout.split('\0').filter(Boolean)) {
  if (path === '.env' || path.startsWith('.suffice/') || /(^|\/)auth\.json$/.test(path)) throw new Error(`Private file is not ignored: ${path}`);
  const content = await readFile(resolve(root, path));
  if (secrets.some(secret => secret.length >= 12 && content.includes(Buffer.from(secret)))) throw new Error(`Credential found in reviewable file: ${path}`);
  count++;
}
console.log(JSON.stringify({ checkedFiles: count, credentialLeaks: 0, note: 'Actual credential values were compared in memory and not printed.' }));
