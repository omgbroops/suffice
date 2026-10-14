// Archived first-match redirect engine retained for migration comparisons.
export function legacyResolve(rules, path) {
  return rules.find(rule => path.startsWith(rule.from))?.to ?? null;
}
