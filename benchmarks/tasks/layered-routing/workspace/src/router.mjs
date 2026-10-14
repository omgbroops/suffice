import { makeConfiguration } from './configuration.mjs';
import { makeCache } from './route-cache.mjs';
import { resolveRoute } from './resolver.mjs';
export function createRouter(input) {
  const configuration = makeConfiguration(input);
  const cache = makeCache();
  return {
    resolve: (tenant, path) => resolveRoute(configuration, cache, tenant, path),
    setTenant: (tenant, overrides) => configuration.setTenant(tenant, overrides),
  };
}
