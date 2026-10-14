import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, stateDir } from '../src/runtime.mjs';
import { hash } from '../src/workspace.mjs';

export async function freezeSources(campaign) {
  if (!/^[a-zA-Z0-9_-]+$/.test(campaign)) throw new Error('Invalid campaign.');
  const directory = resolve(stateDir, 'runs', campaign);
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  const receipts = [];
  for (const [key, expected] of Object.entries(manifest.inputs)) {
    let relative = key;
    if (key.startsWith('acceptance:')) relative = `benchmarks/tasks/${key.slice(11)}/acceptance.test.mjs`;
    else if (key.startsWith('task:')) {
      const [id, ...segments] = key.slice(5).split('/');
      relative = `benchmarks/tasks/${id}/workspace/${segments.join('/')}`;
    }
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').some(s => s.startsWith('.')) || relative.startsWith('/')) throw new Error('Invalid snapshot source path.');
    const bytes = await readFile(resolve(root, relative));
    const matched = hash(bytes) === expected;
    receipts.push({ key, relative, expected, matched });
    if (!matched) continue;
    const target = resolve(directory, 'frozen-source', relative);
    await mkdir(dirname(target), { recursive: true });
    try { await writeFile(target, bytes, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; if (hash(await readFile(target)) !== expected) throw new Error('Existing source snapshot differs.'); }
  }
  const receipt = { at: new Date().toISOString(), complete: receipts.every(r => r.matched), receipts };
  await writeFile(resolve(directory, 'source-snapshot.json'), JSON.stringify(receipt, null, 2));
  return { campaign, complete: receipt.complete, files: receipts.length, mismatches: receipts.filter(r => !r.matched).map(r => r.key) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await freezeSources(process.argv[2])));
