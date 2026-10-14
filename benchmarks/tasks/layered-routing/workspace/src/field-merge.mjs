export function mergeFields(result, layer) {
  for (const [key, value] of Object.entries(layer)) {
    if (key !== 'headers' && value) result[key] = value;
  }
}
