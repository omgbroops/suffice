import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { V4Error } from './v4-escalation.mjs';

// Shared spend ledger for parallel workers: one JSONL file, every change made under a mkdir lock.
// Entries: {op:'reserve', id, usd, pid, label, t} then {op:'settle', id, usd, flag?, t}.
// Committed spend = settled actual for closed reservations, reserved amount for open ones.
export function openLedger({ file, globalCapUsd, lockStaleMs = 10_000, reservationStaleMs = 30 * 60_000 }) {
  if (!Number.isFinite(globalCapUsd) || globalCapUsd <= 0) throw new V4Error('GLOBAL_CAP_REQUIRED');
  const lockDir = `${file}.lock`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function withLock(fn) {
    await mkdir(dirname(file), { recursive: true });
    for (;;) {
      try { await mkdir(lockDir); break; } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const mtime = await stat(lockDir).then(s => s.mtimeMs, () => Date.now());
        if (Date.now() - mtime > lockStaleMs) {
          // rename is atomic: only one contender can move the stale lock away.
          await rename(lockDir, `${lockDir}.stale-${randomBytes(4).toString('hex')}`).catch(() => {});
          continue;
        }
        await sleep(5 + Math.random() * 15);
      }
    }
    try { return await fn(); } finally { await rm(lockDir, { recursive: true, force: true }); }
  }

  async function read() {
    const text = await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  }
  const append = entry => appendFile(file, JSON.stringify({ ...entry, t: Date.now() }) + '\n');

  function summarize(entries) {
    const reserves = new Map(), settles = new Map();
    for (const e of entries) (e.op === 'reserve' ? reserves : settles).set(e.id, e);
    let committed = 0;
    for (const [id, r] of reserves) committed += settles.has(id) ? settles.get(id).usd : r.usd;
    return { reserves, settles, committed };
  }

  // A reservation whose worker is gone (or older than reservationStaleMs) is settled at its reserve and flagged.
  const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
  async function reapLocked(entries) {
    const { reserves, settles } = summarize(entries);
    let reaped = 0;
    for (const [id, r] of reserves) {
      if (settles.has(id)) continue;
      if (alive(r.pid) && Date.now() - r.t < reservationStaleMs) continue;
      await append({ op: 'settle', id, usd: r.usd, flag: 'crashed' });
      reaped++;
    }
    return reaped;
  }

  return {
    file, globalCapUsd,
    // Refuses (throws GLOBAL_CAP) when the reservation would push committed spend over the cap.
    reserve(usd, label = '') {
      if (!Number.isFinite(usd) || usd <= 0) throw new V4Error('GLOBAL_RESERVE_INVALID');
      return withLock(async () => {
        const entries = await read();
        await reapLocked(entries);
        const { committed } = summarize(await read());
        if (committed + usd > globalCapUsd + 1e-9) throw new V4Error('GLOBAL_CAP');
        const id = `${process.pid}-${Date.now()}-${randomBytes(3).toString('hex')}`;
        await append({ op: 'reserve', id, usd, pid: process.pid, label });
        return id;
      });
    },
    // actualUsd null (unknown cost) settles at the reserved amount and is flagged.
    settle(id, actualUsd) {
      return withLock(async () => {
        const { reserves, settles } = summarize(await read());
        const r = reserves.get(id);
        if (!r) throw new V4Error('GLOBAL_RESERVE_UNKNOWN');
        if (settles.has(id)) return settles.get(id);
        const known = Number.isFinite(actualUsd);
        const entry = { op: 'settle', id, usd: known ? actualUsd : r.usd, ...(known ? {} : { flag: 'unknown_cost' }) };
        await append(entry);
        return entry;
      });
    },
    reap: () => withLock(async () => reapLocked(await read())),
    committed: async () => summarize(await read()).committed,
  };
}

// Wraps a runV4 attempt: reserve the tier estimate before the call, settle the actual cost after.
// A thrown attempt settles at reserve with flag, because the provider may have spent.
export function guardAttempt(ledger, tiers, attempt) {
  return async call => {
    const estimate = tiers.find(t => t.name === call.tier).costEstimateUsd;
    const id = await ledger.reserve(estimate, call.tier);
    let result;
    try { result = await attempt(call); } catch (error) { await ledger.settle(id, null); throw error; }
    await ledger.settle(id, Number.isFinite(result?.costUsd) ? result.costUsd : null);
    return result;
  };
}
