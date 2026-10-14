import { snapshot } from './snapshot.mjs';
import { createTenantTable } from './tenant-table.mjs';
export function makeConfiguration(input) {
  const owned = snapshot(input);
  const tenants = createTenantTable();
  return {
    defaults: owned.defaults,
    routes: owned.routes,
    forTenant: tenant => tenants.get(tenant),
    setTenant: (tenant, overrides) => tenants.set(tenant, overrides),
  };
}
