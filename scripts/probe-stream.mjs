// Probe what provider_stream_event carries so stream-prefire can hook it.
import { resolve } from 'node:path';
import { createAgentSession, DefaultResourceLoader, SettingsManager, SessionManager } from '@earendil-works/pi-coding-agent';
import { createRuntime, stateDir } from '../src/runtime.mjs';
import { workspaceTools } from '../src/workspace.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const ws = resolve(stateDir, 'probe-ws');
await mkdir(resolve(ws, 'src'), { recursive: true });
await writeFile(resolve(ws, 'src/a.mjs'), 'export const a = 1;\n');
await mkdir(resolve(ws, 'tests'), { recursive: true });
await writeFile(resolve(ws, 'tests/visible.test.mjs'), "import test from 'node:test';\ntest('ok', () => {});\n");

const runtime = await createRuntime();
const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, codemode: { mode: 'off' } });
const types = new Map();
const ext = pi => {
  pi.on('provider_stream_event', e => {
    const d = e.data;
    const t = d?.type ?? '(none)';
    types.set(t, (types.get(t) ?? 0) + 1);
    if (String(t).includes('output_item') || String(t).includes('function_call')) {
      console.log('ITEM EVENT', t, JSON.stringify(d).slice(0, 400));
    }
  });
};
const resourceLoader = new DefaultResourceLoader({ cwd: ws, agentDir: resolve(stateDir, 'empty-agent'), settingsManager: settings,
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  systemPrompt: 'You are a coding agent. Use tools.', extensionFactories: [ext] });
await resourceLoader.reload();
const { session } = await createAgentSession({ cwd: ws, agentDir: resolve(stateDir, 'empty-agent'),
  modelRuntime: runtime, model: runtime.getModel('openai', 'gpt-6.2-sol'), thinkingLevel: 'low',
  resourceLoader, settingsManager: settings, sessionManager: SessionManager.inMemory(ws),
  tools: ['files', 'file_read', 'search', 'file_edit', 'file_write', 'test'],
  customTools: [...workspaceTools({ workspace: ws, log: () => {}, artifactsDir: resolve(ws, 'artifacts') })] });
await session.bindExtensions({});
await session.prompt('Read the file src/a.mjs and tell me what it exports.');
await new Promise(r => setTimeout(r, 2000));
console.log('STREAM EVENT TYPES:', JSON.stringify([...types.entries()]));
process.exit(0);
