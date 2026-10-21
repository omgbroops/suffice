import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const MAX_WORKERS = 4;

// macOS prints "System-wide memory free percentage: 85%". Any probe failure resolves as unknown, which the scheduler treats as unsafe.
export async function probeFreePct() {
  const { stdout } = await exec('memory_pressure', []);
  const m = /free percentage:\s*(\d+)%/i.exec(stdout);
  if (!m) throw new Error('memory_pressure: unparsed output');
  return Number(m[1]);
}

// runItem must write its own row (runV4Task does). Only items that never reached it get a row here.
// Once free memory drops below minFreePct (or the probe fails), no new item starts; the rest get 'aborted_memory'.
export async function schedule({ items, workers = 3, runItem, probe = probeFreePct, minFreePct = 30, out, write = appendFile }) {
  if (!Number.isInteger(workers) || workers < 1 || workers > MAX_WORKERS) throw new Error(`workers must be 1..${MAX_WORKERS}`);
  const rows = [];
  let next = 0, aborted = false;
  const emit = async row => { rows.push(row); await write(out, JSON.stringify(row) + '\n'); };
  async function lane() {
    while (next < items.length) {
      const item = items[next++];
      if (!aborted) {
        const free = await probe().catch(() => null);
        if (free === null || free < minFreePct) aborted = true;
      }
      if (aborted) { await emit({ task: item.taskId, status: 'aborted_memory' }); continue; }
      try { rows.push(await runItem(item)); } catch (error) {
        await emit({ task: item.taskId, status: 'harness_error', error: String(error?.message ?? error).slice(0, 200) });
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, lane));
  return rows;
}

export function loadManifest(path) {
  const items = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(items) || !items.every(i => typeof i.taskId === 'string')) throw new Error('manifest must be an array of {taskId}');
  return items;
}
