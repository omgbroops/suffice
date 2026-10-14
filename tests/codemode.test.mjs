import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRuntime, createAgentSession, createCodemodeExtension, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { workspaceTools } from '../src/workspace.mjs';

test('Pi codemode exposes only scoped tools and no model or host APIs', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'suffice-codemode-'));
  let session;
  try {
    const workspace = resolve(directory, 'workspace'); await mkdir(workspace);
    await writeFile(resolve(workspace, 'README.md'), 'fixture');
    const runtime = await ModelRuntime.create({ authPath: resolve(directory, 'auth.json'), modelsPath: null, refreshOnCreate: false });
    const names = ['files', 'file_read', 'search', 'file_edit', 'file_write', 'test', 'codemode'];
    const settings = SettingsManager.inMemory({ defaultTools: names });
    const resourceLoader = new DefaultResourceLoader({ cwd: workspace, agentDir: directory, settingsManager: settings,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [createCodemodeExtension({ mode: 'only', models: false })] });
    await resourceLoader.reload();
    ({ session } = await createAgentSession({ cwd: workspace, agentDir: directory, modelRuntime: runtime,
      model: runtime.getModel('openai', 'gpt-6.1-sol'), settingsManager: settings, resourceLoader,
      tools: names, customTools: workspaceTools({ workspace, artifactsDir: resolve(directory, 'artifacts') }), sessionManager: SessionManager.inMemory(workspace) }));
    await session.bindExtensions({});
    const tool = session.agent.state.tools.find(t => t.name === 'codemode');
    assert.ok(tool);
    const result = await tool.execute('test-code', { code: 'text({names: ALL_TOOLS.map(t=>t.name), process:typeof process, require:typeof require, fetch:typeof fetch, models:typeof models});' }, undefined, () => {});
    const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('');
    assert.match(text, /Script completed/);
    assert.match(text, /"file_read"/);
    assert.doesNotMatch(text, /"bash"|"powershell"|"read"|"write"/);
    for (const name of ['process', 'require', 'fetch', 'models']) assert.match(text, new RegExp(`"${name}":"undefined"`));
  } finally { session?.dispose(); await rm(directory, { recursive: true, force: true }); }
});
