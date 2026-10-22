import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Efforts accepted by `claude --effort` (checked with claude --help). Other providers may use other names.
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const DEFAULT_TIERS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../config/v4-tiers.json');
const PROVIDERS = ['claude', 'command'];

// Validates a tier ladder (2..N tiers). Throws with the offending path so a bad config never runs a paid call.
export function validateTiers(doc) {
  const tiers = doc?.tiers;
  if (!Array.isArray(tiers) || tiers.length < 2) throw new Error('tiers must be an array of 2 or more entries');
  const names = new Set();
  return tiers.map((t, i) => {
    const at = `tiers[${i}]`;
    if (typeof t?.name !== 'string' || !t.name || names.has(t.name)) throw new Error(`${at}.name must be a unique non-empty string`);
    names.add(t.name);
    if (!PROVIDERS.includes(t.provider)) throw new Error(`${at}.provider must be one of ${PROVIDERS.join(', ')}`);
    if (typeof t.model !== 'string' || !t.model) throw new Error(`${at}.model must be a non-empty string`);
    if (!Number.isInteger(t.rounds) || t.rounds < 1) throw new Error(`${at}.rounds must be an integer >= 1`);
    // Positive estimate: it is the global-ledger reservation, so zero would let parallel workers overrun the cap.
    if (!Number.isFinite(t.costEstimateUsd) || t.costEstimateUsd <= 0) throw new Error(`${at}.costEstimateUsd must be > 0`);
    const efforts = Array.isArray(t.effort) ? t.effort : [t.effort];
    if (efforts.length === 0 || efforts.some(e => e !== null && (typeof e !== 'string' || !e))) {
      throw new Error(`${at}.effort must be null, a string, or a non-empty array of those (per round, last value repeats)`);
    }
    if (t.provider === 'claude' && efforts.some(e => e !== null && !CLAUDE_EFFORTS.includes(e))) {
      throw new Error(`${at}.effort for provider "claude" must be one of ${CLAUDE_EFFORTS.join(', ')}`);
    }
    if (!Array.isArray(t.tools) || t.tools.some(x => typeof x !== 'string')) throw new Error(`${at}.tools must be an array of strings`);
    if (t.provider === 'command' && (!Array.isArray(t.command) || t.command.length === 0 || t.command.some(x => typeof x !== 'string'))) {
      throw new Error(`${at}.command must be a non-empty argv array of strings for provider "command"`);
    }
    return { ...t };
  });
}

export function loadTiers(path = DEFAULT_TIERS_PATH) {
  return validateTiers(JSON.parse(readFileSync(path, 'utf8')));
}

// Effort for the Nth round (1-based) of a tier. Array schedules repeat their last value.
export function effortFor(tier, round) {
  if (!Array.isArray(tier.effort)) return tier.effort ?? null;
  return tier.effort[Math.min(round - 1, tier.effort.length - 1)] ?? null;
}

// Sonnet top rung for v5. The estimate is a guess until real usage replaces it in the ledger.
export const V5_SONNET_MODEL = 'claude-sonnet-5-5';
export const V5_SONNET_ESTIMATE_USD = 0.05;

// 'v4' is the ladder itself. 'single:<model>' is one tier with the ladder's total rounds and its largest estimate, so both arms share the harness and budget gate.
export function armTiers(arm, ladder = loadTiers(), { top = 'sonnet', cheap = 'haiku' } = {}) {
  if (arm === 'v4') return ladder;
  // v5: cheap rung (Haiku, or Sonnet with cheap 'sonnet') rounds capped at 2, then one top rung (Sonnet; Opus only with top 'opus'). Lean claude call, fixed tools.
  if (arm === 'v5') {
    if (top !== 'sonnet' && top !== 'opus') throw new Error(`unknown v5 top: ${top}`);
    if (cheap !== 'haiku' && cheap !== 'sonnet') throw new Error(`unknown v5 cheap: ${cheap}`);
    const [haiku, strong] = ladder;
    const cheapTier = cheap === 'sonnet' ? { ...haiku, name: 'sonnet-cheap', model: V5_SONNET_MODEL, costEstimateUsd: V5_SONNET_ESTIMATE_USD } : haiku;
    const topTier = top === 'opus' ? { ...strong, rounds: 1 }
      : { ...strong, name: 'sonnet', model: V5_SONNET_MODEL, rounds: 1, costEstimateUsd: V5_SONNET_ESTIMATE_USD };
    return [{ ...cheapTier, rounds: Math.min(cheapTier.rounds, 2) }, topTier].map(t => ({ ...t, lean: true, tools: ['Read', 'Edit', 'Write', 'Bash'] }));
  }
  // v6: same two rungs as v5; the cheap rung runs the test writer and K candidates (src/v6-arm.mjs).
  // Execution calls run at low effort (thinking was about a third of cost) and cannot Write whole files.
  if (arm === 'v6') return armTiers('v5', ladder, { top, cheap }).map(t => ({ ...t, effort: 'low', tools: ['Read', 'Edit', 'Bash'] }));
  const m = /^single:(.+)$/.exec(arm);
  if (!m) throw new Error(`unknown arm: ${arm}`);
  return [{ name: 'single', provider: 'claude', model: m[1], rounds: ladder.reduce((s, t) => s + t.rounds, 0),
    effort: null, costEstimateUsd: Math.max(...ladder.map(t => t.costEstimateUsd)), tools: ladder[0].tools }];
}
