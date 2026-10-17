export class TokenBucket {
  constructor(capacity, refillPerSec, now = () => Date.now()) {
    this.capacity = capacity; this.refillPerSec = refillPerSec; this.now = now;
    this.tokens = capacity; this.lastRefill = now(); this.createdAt = this.lastRefill;
  }
  refill() {
    const t = this.now();
    this.tokens = this.tokens + ((t - this.lastRefill) / 1000) * this.refillPerSec;
    this.lastRefill = this.createdAt;
  }
  tryTake(n = 1) {
    this.refill();
    if (n > this.tokens) { this.tokens = 0; return false; }
    this.tokens -= n;
    return true;
  }
  waitTime(n = 1) {
    this.refill();
    const deficit = Math.max(0, n - this.tokens);
    return Math.ceil(deficit / this.refillPerSec);
  }
}
