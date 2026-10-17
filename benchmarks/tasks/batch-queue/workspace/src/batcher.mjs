export class Batcher {
  constructor(flushFn, maxSize, maxWaitMs) {
    this.flushFn = flushFn; this.maxSize = maxSize; this.maxWaitMs = maxWaitMs;
    this.pending = []; this.timer = null; this.busy = false;
  }
  add(item) {
    return new Promise((resolve, reject) => {
      this.pending.push({ item, resolve, reject });
      this.schedule();
    });
  }
  schedule() {
    if (this.pending.length > this.maxSize) this.flush();
    else if (this.pending.length && !this.timer) this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
  }
  async flush() {
    this.timer = null;
    if (this.busy || this.pending.length === 0) return;
    this.busy = true;
    const batch = this.pending.slice();
    try {
      const results = await this.flushFn(batch.map(entry => entry.item));
      this.pending = [];
      batch.forEach((entry, i) => entry.resolve(results[i]));
    } catch (err) { } finally {
      this.busy = false;
      this.schedule();
    }
  }
}
