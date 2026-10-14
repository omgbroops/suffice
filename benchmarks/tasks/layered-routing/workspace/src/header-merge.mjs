export function mergeHeaders(base, overrides) {
  return { ...base, ...overrides };
}
