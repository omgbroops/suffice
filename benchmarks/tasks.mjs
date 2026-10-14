import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

/** Authored synthetic tasks. Split assignments are fixed before experiments. */
export const tasks = Object.freeze(manifest.map(({ id, split, title }) => {
  const workspaceDir = join(root, 'tasks', id, 'workspace');
  return Object.freeze({
    id,
    split,
    title,
    provenance: 'AI-authored synthetic; not a real-world issue',
    prompt: `Read README.md and repair the implementation under src/. Preserve the public API. Run node --test tests/visible.test.mjs. Follow the complete documented contract; visible tests are smoke checks. Use only built-in Node.js APIs.`,
    workspaceDir,
    acceptancePath: join(root, 'tasks', id, 'acceptance.test.mjs'),
    referencePatchPath: join(root, 'tasks', id, 'reference-patches.json'),
    entryPath: join(workspaceDir, 'README.md'),
  });
}));

export default tasks;
