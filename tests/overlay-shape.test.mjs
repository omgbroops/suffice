import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Design rule: no circles, no pills in the overlay.
test('overlay css has no circular or pill radii', () => {
  const css = readFileSync(new URL('../apps/desktop/src/overlay.css', import.meta.url), 'utf8');
  const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(radii.length > 0);
  for (const r of radii) assert.ok(!/%|999/.test(r) && parseFloat(r) <= 14, `bad radius ${r}`);
});
