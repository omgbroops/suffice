export function makeStock(initial) {
  let values = structuredClone(initial);
  return {
    read: (tenant, sku) => values[tenant]?.[sku],
    current: () => values,
    publish: next => { values = next; },
  };
}
