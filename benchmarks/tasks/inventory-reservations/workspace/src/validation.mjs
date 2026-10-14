export function validateIdentity(input) {
  if (!input || typeof input.tenant !== 'string' || !input.tenant || typeof input.requestId !== 'string' || !input.requestId) throw new Error('Invalid identity');
}
export function validateItem(item) {
  if (!item || typeof item.sku !== 'string' || !item.sku || !Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Invalid item');
}
