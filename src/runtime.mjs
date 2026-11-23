import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';

export const root = resolve(import.meta.dirname, '..');
export const stateDir = resolve(root, '.suffice');

export function loadEnvironment() {
  try {
    const local = parseEnv(readFileSync(resolve(root, '.env'), 'utf8'));
    for (const name of ['OPENROUTER_API_KEY', 'JEV_API_KEY']) if (local[name]) process.env[name] = local[name];
  }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not parse .env'); }
}

export async function createRuntime() {
  await mkdir(resolve(stateDir, 'pi'), { recursive: true });
  return ModelRuntime.create({
    authPath: resolve(stateDir, 'pi/auth.json'),
    modelsPath: null,
    modelsStorePath: resolve(stateDir, 'pi/catalog.json'),
    allowModelNetwork: false,
  });
}

export function safeError(error) {
  return { name: error?.name ?? 'Error', code: error?.code ?? 'unknown' };
}

// Some catalog entries (e.g. gpt-6.2-sol) are excluded by the provider's
// availability probe even though they answer requests fine. Fall back to the
// pinned catalog when getModel reports a known id as unavailable.
export function getCatalogModel(runtime, provider, id) {
  const found = runtime.getModel(provider, id);
  if (found) return found;
  try {
    const catalog = JSON.parse(readFileSync(resolve(stateDir, 'pi/catalog.json'), 'utf8'));
    return (catalog[provider]?.models ?? []).find(m => m.id === id) ?? null;
  } catch { return null; }
}
