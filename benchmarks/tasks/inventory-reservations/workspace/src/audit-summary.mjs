import { formatReceipt } from './receipt.mjs';
export function summarize(receipts) {
  return receipts.map(formatReceipt).join('\n');
}
