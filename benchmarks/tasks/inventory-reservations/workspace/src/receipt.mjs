export function fingerprint(request) {
  return JSON.stringify(request.items);
}
export function formatReceipt(request) {
  return request.items.map(item => item.sku + ':' + item.quantity).join(', ');
}
