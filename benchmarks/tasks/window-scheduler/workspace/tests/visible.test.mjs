import test from 'node:test';
import assert from 'node:assert/strict';
import { availableStarts } from '../src/scheduler.mjs';
test('interior free slots are offered', () => {
  const starts = availableStarts({ windows: [{ start: 0, end: 100 }], bookings: [{ start: 0, end: 20 }], duration: 20, stepMinutes: 30 });
  assert.ok(starts.includes(30)); assert.ok(!starts.includes(0));
});
