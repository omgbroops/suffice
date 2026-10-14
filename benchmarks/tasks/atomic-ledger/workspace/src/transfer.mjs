export function applyTransfer(balances, transfer) {
  const { from, to, amount } = transfer;
  if (!Object.hasOwn(balances, from) || !Object.hasOwn(balances, to)) throw new Error('Unknown account');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid amount');
  if (balances[from] < amount) throw new Error('Insufficient funds');
  if (from === to) return;
  balances[from] -= amount; balances[to] += amount;
}
export function sameTransfer(a, b) { return a.from === b.from && a.to === b.to && a.amount === b.amount; }
