import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';

const directory = resolve('.suffice/pi');
await mkdir(directory, { recursive: true });
let hostId;
try { hostId = (await readFile(`${directory}/host-id`, 'utf8')).trim(); }
catch { hostId = randomUUID(); await writeFile(`${directory}/host-id`, hostId, { mode: 0o600 }); }
const runtime = await ModelRuntime.create({ authPath: `${directory}/auth.json`, modelsPath: null, refreshOnCreate: false });
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15 * 60_000);
try {
  await runtime.login('openai', 'oauth', {
    signal: controller.signal,
    notify(event) {
      if (event.type === 'auth_url') {
        const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', event.url], { detached: true, stdio: 'ignore', windowsHide: true });
        browser.unref();
        console.log('Opened OpenAI sign-in in your browser. Credentials stay in the ignored local Pi directory.');
      } else if (event.type === 'progress') console.log(event.message);
    },
    prompt({ signal }) {
      return new Promise((_, reject) => {
        if (signal?.aborted) reject(new Error('Login cancelled'));
        else signal?.addEventListener('abort', () => reject(new Error('Login cancelled')), { once: true });
      });
    },
  }, { getDeviceId: () => hostId, agentName: 'Suffice' });
  await writeFile(`${directory}/login-status.json`, JSON.stringify({ authenticated: true, provider: 'openai', at: new Date().toISOString() }));
  console.log('Suffice/Pi ChatGPT sign-in complete.');
} catch (error) {
  console.error('Sign-in did not complete:', error.name);
  process.exitCode = 1;
} finally { clearTimeout(timeout); }
