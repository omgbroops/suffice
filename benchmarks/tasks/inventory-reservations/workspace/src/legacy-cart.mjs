// The old preview cart does not publish stock or request identities.
export function preview(items) {
  return items.map(item => ({ sku: item.sku, quantity: item.quantity }));
}
