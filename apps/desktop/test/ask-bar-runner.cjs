// Test-only stand-in for the model run behind the ask bar (SUFFICE_TEST_ASK_RUNNER): records each payload, streams two chunks, answers or fails by prompt.
const ID = 'a'.repeat(32);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
module.exports = (emit) => async (payload) => {
  (globalThis.askPayloads ??= []).push(payload);
  emit({ event: 'thread_started', clientId: payload.clientId, id: ID });
  if (payload.prompt.includes('fail')) throw new Error('Model unavailable');
  emit({ event: 'text', clientId: payload.clientId, text: 'The screen shows ' });
  await sleep(200);
  emit({ event: 'text', clientId: payload.clientId, text: 'a **settings** page.' });
  return { text: 'The screen shows a **settings** page.', threadId: ID };
};
