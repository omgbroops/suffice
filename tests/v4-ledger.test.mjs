import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openLedger, guardAttempt } from '../src/v4-ledger.mjs';
import { validateTiers } from '../src/v4-config.mjs';
import { V4Error } from '../src/v4-escalation.mjs';

const fresh = async (cap = 1) => openLedger({ file: join(await mkdtemp(join(tmpdir(), 'v4-ledger-')), 'ledger.jsonl'), globalCapUsd: cap });

test('global cap is required and enforced across reservations', async () => {
  assert.throws(() => openLedger({ file: '/nonexistent/x', globalCapUsd: undefined }), e => e.code === 'GLOBAL_CAP_REQUIRED');
  const ledger = await fresh(0.5);
  const a = await ledger.reserve(0.3, 'a');
  await assert.rejects(ledger.reserve(0.3, 'b'), e => e instanceof V4Error && e.code === 'GLOBAL_CAP');
  await ledger.settle(a, 0.1);
  assert.equal(await ledger.committed(), 0.1);
  await ledger.reserve(0.3, 'c');
  assert.equal(await ledger.committed(), 0.4);
});

test('six parallel workers never exceed the cap', async () => {
  const ledger = await fresh(1);
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => ledger.reserve(0.25, `w${i}`)));
  const ok = results.filter(r => r.status === 'fulfilled').length;
  const refused = results.filter(r => r.status === 'rejected' && r.reason.code === 'GLOBAL_CAP').length;
  assert.equal(ok, 4);
  assert.equal(refused, 2);
  assert.equal(await ledger.committed(), 1);
});

test('unknown cost settles at the reserved amount and is flagged', async () => {
  const ledger = await fresh(1);
  const id = await ledger.reserve(0.2, 'x');
  const entry = await ledger.settle(id, null);
  assert.equal(entry.usd, 0.2);
  assert.equal(entry.flag, 'unknown_cost');
  await assert.rejects(ledger.settle('nope', 0.1), e => e.code === 'GLOBAL_RESERVE_UNKNOWN');
});

test('guardAttempt reserves the tier estimate and settles the actual cost', async () => {
  const ledger = await fresh(1);
  const tiers = validateTiers({ tiers: [
    { name: 'a', provider: 'claude', model: 'm', rounds: 1, effort: null, costEstimateUsd: 0.4, tools: ['Read'] },
    { name: 'b', provider: 'claude', model: 'n', rounds: 1, effort: null, costEstimateUsd: 0.4, tools: ['Read'] },
  ] });
  const guarded = guardAttempt(ledger, tiers, async () => ({ pass: true, costUsd: 0.1 }));
  await guarded({ tier: 'a' });
  assert.equal(await ledger.committed(), 0.1);
  // A throwing attempt keeps the estimate committed: the provider may have spent.
  const throwing = guardAttempt(ledger, tiers, async () => { throw new V4Error('PROVIDER_ERROR'); });
  await assert.rejects(throwing({ tier: 'b' }), e => e.code === 'PROVIDER_ERROR');
  assert.equal(await ledger.committed(), 0.5);
});

test('crashed worker mid-attempt: reservation is reaped and stays committed', async () => {
  const ledger = await fresh(1);
  const script = `
    const { openLedger } = await import(${JSON.stringify(new URL('../src/v4-ledger.mjs', import.meta.url).href)});
    const l = openLedger({ file: ${JSON.stringify(ledger.file)}, globalCapUsd: 1 });
    await l.reserve(0.7, 'child');
    process.exit(0);`;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`child exit ${code}`))));
  });
  assert.equal(await ledger.committed(), 0.7);
  assert.equal(await ledger.reap(), 1);
  // Fail-closed: the crashed attempt's reserve stays committed, since the provider may have billed it.
  assert.equal(await ledger.committed(), 0.7);
  const lines = (await readFile(ledger.file, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(lines.at(-1).flag, 'crashed');
  await assert.rejects(ledger.reserve(0.9, 'after'), e => e.code === 'GLOBAL_CAP');
});
