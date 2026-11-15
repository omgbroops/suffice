// Append-only jsonl of decision rows (hashes and outputs, never input text), rotated to .1 past maxBytes.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function createDatasetFile({ dir, maxBytes = 5_000_000 }) {
  const file = join(dir, 'decisions.jsonl');
  return {
    append(row) {
      try {
        mkdirSync(dir, { recursive: true });
        let size = 0; try { size = statSync(file).size; } catch { /* first write */ }
        if (size >= maxBytes) renameSync(file, `${file}.1`);
        appendFileSync(file, `${JSON.stringify(row)}\n`);
      } catch { /* dataset loss never breaks a decision */ }
    },
  };
}
