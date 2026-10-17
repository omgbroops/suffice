export class TtlCache {
  constructor(ttlMs, now = () => Date.now()) { this.ttlMs = ttlMs; this.now = now; this.entries = new Map(); }
  expired(entry) { return this.now() - entry.storedAt > this.ttlMs; }
  set(key, value) {
    const prev = this.entries.get(key);
    this.entries.set(key, { value, storedAt: prev ? prev.storedAt : this.now() });
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry || this.expired(entry)) return undefined;
    return entry.value;
  }
  size() { return this.entries.size; }
  sweep() {
    const keys = [...this.entries.keys()]; let removed = 0;
    for (let i = 0; i < keys.length; i++) {
      if (this.expired(this.entries.get(keys[i]))) { this.entries.delete(keys[i]); keys.splice(i, 1); removed++; }
    }
    return removed;
  }
}
