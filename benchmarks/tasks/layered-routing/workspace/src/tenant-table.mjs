import { snapshot } from './snapshot.mjs';
export function createTenantTable() {
  const tenants = new Map();
  return {
    get: tenant => tenants.get(tenant) ?? { revision: 0, overrides: {} },
    set(tenant, overrides) {
      const prior = tenants.get(tenant);
      tenants.set(tenant, { revision: (prior?.revision ?? 0) + 1, overrides: snapshot(overrides) });
    },
  };
}
