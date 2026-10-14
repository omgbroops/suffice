export function consume(values, tenant, { sku, quantity }) {
  if (!Object.hasOwn(values, tenant) || !Object.hasOwn(values[tenant], sku)) throw new Error('Unknown stock');
  if (values[tenant][sku] < quantity) throw new Error('Insufficient stock');
  values[tenant][sku] -= quantity;
}
