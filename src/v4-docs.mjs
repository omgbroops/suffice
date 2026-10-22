import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Aider polyglot prompt order; missing files are skipped, other read errors throw.
export const POLYGLOT_DOC_FILES = ['introduction.md', 'instructions.md', 'instructions.append.md'];

export async function readPolyglotDocs(exerciseDir) {
  const parts = [];
  for (const f of POLYGLOT_DOC_FILES) {
    try { parts.push(await readFile(join(exerciseDir, '.docs', f), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return parts.join('\n');
}
