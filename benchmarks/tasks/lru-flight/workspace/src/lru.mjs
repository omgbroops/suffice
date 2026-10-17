export class LruCache {
  constructor(capacity) { this.capacity = capacity; this.entries = new Map(); this.inflight = new Map(); }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return { found: false };
    return { found: true, value: entry.value };
  }
  store(key, value) {
    this.entries.delete(key); this.entries.set(key, { value });
    while (this.entries.size > 0 && this.entries.size + this.inflight.size > this.capacity) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }
  async getOrLoad(key, loader) {
    const hit = this.get(key);
    if (hit.found) return hit.value;
    const load = (async () => {
      const value = await loader();
      this.store(key, value);
      this.inflight.delete(key);
      return value;
    })();
    this.inflight.set(key, load);
    return load;
  }
}
