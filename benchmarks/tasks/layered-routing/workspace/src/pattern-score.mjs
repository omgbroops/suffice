export function patternScore(pattern, path) {
  if (pattern === path) return Number.MAX_SAFE_INTEGER;
  if (pattern === '*') return 0;
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    if (path === base || path.startsWith(base + '/')) return base.length + 1;
  }
  return -1;
}
