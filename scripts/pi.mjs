import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { root, stateDir } from '../src/runtime.mjs';
const child = spawn(process.execPath, [resolve(root, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'), '--provider', 'openai', '--model', 'gpt-6.1-sol', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, PI_CODING_AGENT_DIR: resolve(stateDir, 'pi') },
});
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', () => { console.error('Could not launch the pinned Pi CLI.'); process.exitCode = 1; });
