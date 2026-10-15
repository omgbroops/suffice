# Independent review of live Suffice patches

All three original campaign graders accepted their patches. Independent review supports the scoped Workerpool and p-wait-for fixes, and found a new cancellation regression in p-debounce. The original campaign results and grader receipts are unchanged.

The reviewer read the saved diffs, original public issues, repository API documentation, and relevant native behavior before reading grade summaries. Agent final claims were not read. No actor files, graders, or primary receipts were modified; no new model calls or upstream actions occurred.

## Finding: l03 removes cancellation from a newer debounce window (P2)

`actors/l03-suffice/index.js:51` now waits for the old leading promise. Once it settles, line 62 unconditionally removes the shared `onAbort` listener. If another leading window and suppressed caller started while that older promise was pending, the listener also serves the newer window. Older cleanup removes it prematurely.

Trigger: run a slow leading call with a suppressed caller; expire its debounce timer; start a second leading window with another suppressed caller; complete the first leading call before the second timer expires; abort the signal. The baseline rejects the new suppressed caller. The patch leaves it pending, and it can later fulfill despite the abort. The public `readme.md:59-63` documents cancellation via AbortSignal.

A deterministic Node mock-timer comparison reproduced this difference:

| Source | Listener count before/after old completion | New caller at abort |
|---|---|---|
| Untouched baseline | 1 / 1 | rejected |
| Saved patch | 1 / 0 | pending |

The patch fixes successful slow leading result sharing and overlapping successful batches, but needs batch-aware abort registration/cleanup before upstream submission. This is a post-hoc exploratory regression finding, not a changed grading requirement or retroactive primary-score failure.

## l01 Workerpool #596: scoped fix supported

`src/Promise.js:84-97` and `109-122` install settled dispatch and no-op resolvers before iterating synchronous subscribers. A finally callback can therefore reenter its source promise and attach the continuation immediately, resolving the reported pending-promise hang for success and rejection. Existing value/error propagation and synchronous settled state remain consistent with the native Promise suite. Two additional review probes passed: reentrant subscriber/settlement attempts, and rejected asynchronous cleanup from a pending finally.

The patch includes the expected source change, protected actor test additions, and 22 generated dist/types artifacts. All generated artifacts match a native build in the independent evaluation workspace byte-for-byte; see `live-patch-probes/generated-artifacts.json`. This is not a full CI claim: the earlier complete npm test failed in high-worker-count Pool tests under the unchanged 8 GiB address-space limit. No browser-worker or Promises/A+ conformance claim is made.

## l02 p-wait-for #37: scoped fix supported

`index.js:20-39` races a condition against the signal while keeping handlers on eventual condition outcomes and cleaning up its added listener. The main loop at line 117 uses that helper; existing timeout/fallback handling is reused. Static review found no introduced error in sync throws, late rejections, timeout fallback, or signal precedence within the selected issue scope. A targeted success/synchronous-error probe confirmed the helper removes its abort listener.

Neighboring pre-existing sleep-listener cleanup and before:false initial timeout concerns are unchanged. This review does not claim those separate issues or full lint/CI are fixed.

## Reproduction and limits

Remote command: `node --test review.test.mjs` in the isolated `research/field-campaign-v1/audits/live-patch-probes/fixture` workspace, using the existing Sonion adapter, network disabled and a 15-second timeout. Five post-hoc tests: four pass and one fails, solely the patched l03 abort case; its baseline counterpart passes. Source copies were verified against saved patch.json bytes. Raw execution, output and boundary receipts are under `live-patch-probes/receipts`.

This was one static review and a small set of targeted probes, not exhaustive testing or a CI matrix. No fixes were applied. Full paths, immutable diff hashes, per-file evidence, primary acceptance status, and review limitations are recorded in `live-patch-review.json`.
