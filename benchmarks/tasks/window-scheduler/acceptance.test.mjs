import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { availableStarts, findEarliest } = await load('src/scheduler.mjs');
test('half-open booking boundaries and exact window fit', () => {
  const options = { windows: [{ start: 0, end: 120 }], bookings: [{ start: 30, end: 60 }], duration: 30, stepMinutes: 30 };
  assert.deepEqual(availableStarts(options), [0, 60, 90]);
  assert.equal(findEarliest(options, 31), 60);
  assert.equal(findEarliest(options, 91), null);
  assert.deepEqual(availableStarts({ windows: [{ start: 10, end: 40 }], bookings: [], duration: 30 }), [10]);
});
test('overlapping windows deduplicate and sort while real overlap is blocked', () => {
  assert.deepEqual(availableStarts({ windows: [{ start: 30, end: 90 }, { start: 0, end: 60 }], bookings: [{ start: 15, end: 16 }], duration: 30, stepMinutes: 30 }), [30, 60]);
});
}
