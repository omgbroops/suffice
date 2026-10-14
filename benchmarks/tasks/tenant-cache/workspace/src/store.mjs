export class ExpiringStore {
  constructor({ now = Date.now } = {}) { this.now = now; this.entries = new Map(); }
  set(key, value, ttlMs) { this.entries.set(key, { value, deadline: Date.now() + ttlMs }); }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return { found: false };
    if (this.now() >= entry.deadline) { this.entries.delete(key); return { found: false }; }
    return { found: true, value: entry.value };
  }
}
