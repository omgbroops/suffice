import { matchRoute } from './route-matcher.mjs';
import { mergeSettings } from './settings-merge.mjs';
import { resolutionKey } from './resolution-key.mjs';
import { snapshot } from './snapshot.mjs';
export function resolveRoute(configuration, cache, tenant, path) {
  const current = configuration.forTenant(tenant);
  const key = resolutionKey(tenant, path, current.revision);
  if (cache.has(key)) return snapshot(cache.get(key));
  const route = matchRoute(configuration.routes, path);
  const result = route ? { ...mergeSettings(configuration.defaults, route.settings, current.overrides), route: route.id } : null;
  cache.set(key, result);
  return snapshot(result);
}
