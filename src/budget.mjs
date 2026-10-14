import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const JEV_LIMIT_USD = 2;
export const JEV_RESERVATION_USD = 0.01;
const LIMIT_CENTS = 200;

export class BudgetError extends Error {
  constructor(code) { super(code); this.name = 'BudgetError'; this.code = code; }
}

// Every reservation permanently consumes one cent, even if its request fails or
// the process crashes. Never refund from provider-reported usage or retry calls.
export function createBudgetLedger(ledgerPath = '.suffice/jev-budget.jsonl') {
  const path = resolve(ledgerPath);
  async function read() {
    let content;
    try { content = await readFile(path, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return []; throw new BudgetError('LEDGER_UNREADABLE'); }
    if (!content || !content.endsWith('\n')) throw new BudgetError('LEDGER_CORRUPT');
    const entries = [];
    const ids = new Set();
    try {
      for (const line of content.slice(0, -1).split('\n')) {
        const entry = JSON.parse(line);
        if (entry.version !== 1 || entry.type !== 'reservation' || entry.cents !== 1 ||
            typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) ||
            typeof entry.timestamp !== 'string' || !Number.isFinite(Date.parse(entry.timestamp))) throw new Error();
        ids.add(entry.id); entries.push(entry);
      }
    } catch { throw new BudgetError('LEDGER_CORRUPT'); }
    if (entries.length > LIMIT_CENTS) throw new BudgetError('LEDGER_CORRUPT');
    return entries;
  }
  return {
    path,
    async snapshot() {
      const entries = await read();
      return { limitUsd: JEV_LIMIT_USD, reservedUsd: entries.length / 100,
        remainingUsd: (LIMIT_CENTS - entries.length) / 100, calls: entries.length };
    },
    async reserve() {
      await mkdir(dirname(path), { recursive: true });
      let lock;
      try { lock = await open(`${path}.lock`, 'wx', 0o600); }
      catch { throw new BudgetError('LEDGER_LOCKED'); }
      let success = false;
      try {
        const entries = await read();
        if (entries.length >= LIMIT_CENTS) throw new BudgetError('BUDGET_EXHAUSTED');
        const entry = { version: 1, type: 'reservation', id: randomUUID(), cents: 1,
          timestamp: new Date().toISOString() };
        const file = await open(path, 'a', 0o600);
        try { await file.writeFile(`${JSON.stringify(entry)}\n`); await file.sync(); }
        finally { await file.close(); }
        success = true;
        return { id: entry.id, reservedUsd: JEV_RESERVATION_USD,
          totalReservedUsd: (entries.length + 1) / 100 };
      } catch (error) {
        if (error instanceof BudgetError) { success = true; throw error; }
        // Leave the lock after uncertain writes. Manual reconciliation is needed.
        throw new BudgetError('LEDGER_WRITE_FAILED');
      } finally {
        await lock.close();
        if (success) await unlink(`${path}.lock`);
      }
    },
  };
}
