#!/usr/bin/env node
// Stub for the claude CLI in v4 tests. No network. Behaviour is chosen by FAKE_MODE; every call is logged to FAKE_LOG.
import { appendFileSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const at = flag => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ model: at('--model'), prompt: at('-p'), resume: at('--resume'), budget: at('--max-budget-usd'), tools: at('--allowedTools'), maxTurns: at('--max-turns') }) + '\n');
const mode = process.env.FAKE_MODE;
if (mode === 'crash') { process.stderr.write('simulated crash'); process.exit(1); }
if (mode === 'hang') setTimeout(() => {}, 60_000);
else {
  if (mode === 'fix') writeFileSync('src/a.txt', 'fixed\n');
  // Reports its own check like the real system prompt asks; 'unverified' mode omits the SELFTEST line.
  const text = mode === 'unverified' ? 'done' : 'done\nSELFTEST: test "$(cat src/a.txt)" = fixed';
  const result = { type: 'result', subtype: 'success', is_error: false, session_id: 'sess-1', result: text };
  if (mode !== 'nocost') result.total_cost_usd = 0.01;
  process.stdout.write(JSON.stringify(result));
}
