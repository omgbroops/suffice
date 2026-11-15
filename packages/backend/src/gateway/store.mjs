import fs from 'node:fs/promises';

/** Atomic JSON file store: write to a temp file, then rename, so a crash never leaves half a file. */
export function createFileStore(file) {
  if (typeof file !== 'string' || !file) throw new TypeError('createFileStore: file must be a non-empty string');
  return {
    async load() {
      try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async save(state) {
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
      await fs.rename(tmp, file);
    },
  };
}
