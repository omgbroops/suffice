export function delayFor(response, attempt, baseMs) {
  const retryAfter = response.headers?.['retry-after'];
  if (retryAfter !== undefined && Number.isFinite(Number(retryAfter))) return Number(retryAfter);
  return baseMs * 2 ** (attempt - 1);
}
export function shouldRetry(response) {
  return response.status === 429 || response.status >= 500;
}
