import { validateIdentity, validateItem } from './validation.mjs';
import { combineItems } from './item-plan.mjs';
export function normalizeRequest(input) {
  validateIdentity(input);
  if (!Array.isArray(input.items) || !input.items.length) throw new Error('Invalid items');
  input.items.forEach(validateItem);
  return { tenant: input.tenant, requestId: input.requestId, items: combineItems(input.items) };
}
