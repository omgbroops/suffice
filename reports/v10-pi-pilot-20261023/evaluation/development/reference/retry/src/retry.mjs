export async function retry(operation, options = {}) {
  const {
    attempts = 3,
    baseDelayMs = 0,
    sleep = async () => {},
    shouldRetry = () => true,
    signal,
  } = options;

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('attempts must be a positive integer');
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError('baseDelayMs must be finite and nonnegative');
  }

  function checkAbort() {
    if (!signal?.aborted) return;
    if (signal.reason !== undefined) throw signal.reason;
    const error = new Error('Operation aborted');
    error.name = 'AbortError';
    throw error;
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    checkAbort();
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt === attempts) throw error;
      if (!shouldRetry(error, attempt)) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      checkAbort();
    }
  }
}
