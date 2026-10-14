export function estimateShipping(items, zone = 'local') {
  return items.reduce((total, item) => total + item.quantity, 0) * (zone === 'local' ? 2 : 5);
}
