// Test-only stand-in for the model run behind the cursor overlay (SUFFICE_TEST_OVERLAY_RUNNER): records the payload, streams text, then returns a canned point.
// The point is in screenshot pixels and carries the displayId named in the prompt, like the real point tool would.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
module.exports = (emit) => async (payload) => {
  (globalThis.overlayPayloads ??= []).push(payload);
  const display = /displayId is (\S+?)\.\]/.exec(payload.prompt)?.[1] ?? '';
  emit({ event: 'text', clientId: payload.clientId, text: 'The save button is ' });
  await sleep(100);
  emit({ event: 'text', clientId: payload.clientId, text: 'at the bottom right.' });
  emit({ event: 'tool_end', clientId: payload.clientId, id: 't1', isError: false, result: { structuredContent: { x: 480, y: 300, label: 'Save', displayId: display } } });
  return { text: 'The save button is at the bottom right.', threadId: 'b'.repeat(32) };
};
