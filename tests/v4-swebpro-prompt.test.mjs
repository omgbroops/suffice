import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/v4-swebpro.mjs';

test('buildPrompt includes requirements and interface headings', () => {
  const p = buildPrompt({ problem_statement: 'PS', requirements: 'REQ', interface: 'IFACE' });
  assert.match(p, /\nRequirements:\nREQ\n\n/);
  assert.match(p, /\nNew interfaces introduced:\nIFACE\n\n/);
  assert.ok(p.startsWith('PS\n\nRequirements:'));
});

test('buildPrompt tolerates missing requirements and interface', () => {
  const p = buildPrompt({ problem_statement: 'PS' });
  assert.match(p, /^PS\n\nRequirements:\n\n\nNew interfaces introduced:\n\n\n/);
});
