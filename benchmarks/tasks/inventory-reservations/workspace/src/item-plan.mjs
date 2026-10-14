export function combineItems(items) {
  const quantities = new Map();
  for (const item of items) quantities.set(item.sku, item.quantity);
  return [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([sku, quantity]) => ({ sku, quantity }));
}
