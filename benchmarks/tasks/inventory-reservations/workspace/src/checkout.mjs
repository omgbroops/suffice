import { normalizeRequest } from './request-normalizer.mjs';
import { fingerprint } from './receipt.mjs';
import { commitStock } from './stock-transaction.mjs';
export function reserveRequest(input, context) {
  const request = normalizeRequest(input);
  const prior = context.reservations.get(request.tenant, request.requestId);
  if (prior) {
    if (fingerprint(prior) !== fingerprint(request)) throw new Error('Conflicting request');
    return structuredClone(prior);
  }
  commitStock(context.stock, request.tenant, request.items);
  context.reservations.set(request.tenant, request.requestId, request);
  return structuredClone(request);
}
