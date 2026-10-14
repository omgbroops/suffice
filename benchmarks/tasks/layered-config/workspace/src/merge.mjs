function isPlain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function mergeLayers(...layers) {
  const result = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (!value) continue;
      if (isPlain(value) && isPlain(result[key])) result[key] = mergeLayers(result[key], value);
      else result[key] = value;
    }
  }
  return result;
}
