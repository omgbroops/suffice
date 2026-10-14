export function formatHeaders(headers) {
  return Object.entries(headers).map(([name, value]) => name + ': ' + value).join('\n');
}
