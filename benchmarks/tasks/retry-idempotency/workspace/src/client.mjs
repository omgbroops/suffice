import { delayFor, shouldRetry } from './policy.mjs';
export function createClient({ transport, sleep, keyFactory, maxAttempts = 3, baseMs = 100 }) {
  return async function request({ method = 'GET', url, headers = {}, body }) {
    let response;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const outgoing = { ...headers };
      if (method === 'POST') outgoing['idempotency-key'] = keyFactory();
      response = await transport({ method, url, headers: outgoing, body });
      if (!shouldRetry(response) || attempt === maxAttempts) return response;
      await sleep(delayFor(response, attempt, baseMs));
    }
    return response;
  };
}
