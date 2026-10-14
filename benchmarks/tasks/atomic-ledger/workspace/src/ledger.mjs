import { applyTransfer, sameTransfer } from './transfer.mjs';
export class Ledger {
  constructor(balances) { this.balances = { ...balances }; this.committed = new Map(); }
  snapshot() { return { ...this.balances }; }
  applyBatch(transfers) {
    const balances = this.balances;
    const committed = new Map(this.committed);
    for (const transfer of transfers) {
      const previous = this.committed.get(transfer.id);
      if (previous) {
        if (!sameTransfer(previous, transfer)) throw new Error('Conflicting transfer id');
        continue;
      }
      applyTransfer(balances, transfer); committed.set(transfer.id, { ...transfer });
    }
    this.balances = balances; this.committed = committed;
    return this.snapshot();
  }
}
