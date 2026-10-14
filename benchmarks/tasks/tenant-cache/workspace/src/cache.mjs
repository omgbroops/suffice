export class TenantCache {
  constructor(store) { this.store = store; }
  key(tenant, resourceId) { return tenant + ':' + resourceId; }
  async getOrLoad(tenant, resourceId, loader, ttlMs = 1000) {
    const key = this.key(tenant, resourceId); const entry = this.store.get(key);
    if (entry.found) return entry.value;
    const value = await loader(); this.store.set(key, value, ttlMs); return value;
  }
}
