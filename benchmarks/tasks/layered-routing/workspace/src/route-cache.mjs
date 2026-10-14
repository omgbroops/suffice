export function makeCache() {
  const entries = new Map();
  return {
    has: key => entries.has(key),
    get: key => entries.get(key),
    set: (key, value) => entries.set(key, value),
  };
}
