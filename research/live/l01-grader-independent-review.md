# Independent review of l01 grader before implementation

Reviewed scripts/field-graders.mjs, scripts/field-test-bridges.mjs, the unchanged l01 README, test/semaphore.ts and relevant test/semaphoreSuite.ts cases, and the saved original async-mutex issue #90. Review only; no grader/source edits or tests run here.

## Finding: premature successful process exit can evade the grader

The generated l01-check.cjs waits on Promise.all([a,b]), hi, acquire, and lo without a referenced deadline timer. A pending promise alone does not keep Node alive. A faulty optimization that leaves a waiter unresolved may therefore exit with code 0 before printing the final accepted:true record. An external 10s timeout does not catch an already exited process.

The caller must require both successful exit and the final accepted:true completion record, or the checker needs a referenced deadline that fails/cleans up explicitly. This is a conditional false positive: if the caller already validates the final completion record, that path is covered. I did not find the final grading caller in the reviewed script, so I do not assert the end-to-end grader currently accepts this case.

## Existing expectations are fair

The original issue requests eliminating capacity-proportional scans in _drainUnlockWaiters, giving 2147483628 as an example. Both branches are exercised by the checker: an empty acquire queue with sparse waiter weights, then an oversized queued acquisition plus higher/lower-priority unlock waiters.

README lines 453-455 defines waitForUnlock(weight,priority) as resolving when acquisition with that weight/priority is possible. The unchanged native suite already covers higher/equal/lower priority ordering and waiters not consuming capacity (semaphoreSuite lines 536-560 and nearby cases). The private checker's expectations preserve that contract; it does not invent a new cancellation or fairness policy. events.slice().sort() intentionally avoids requiring undocumented ordering between small and large weights when both can unlock.

The q flow is coherent: capacity huge cannot satisfy acquire(huge+1,10), but waitForUnlock(huge,11) may resolve. A lower-priority weight 1 waiter stays blocked behind the queued acquisition. release() supplies the last unit; the acquisition consumes all capacity; its releaser later permits the low-priority waiter.

## Useful coverage gaps

1. Add the common original shape with no unlock waiters: a huge initial capacity, acquire/release, and/or setValue on an empty waiter structure. The current checks always populate the sparse weighted-waiter structure first. This catches optimizations that handle registered waiters but still scan every numeric capacity when there are none.
2. Assert the queued acquisition receives previousValue===huge+1, value===0 after it acquires, and value===huge+1 after its releaser. Current observations verify settlement order but do not fully verify its returned value/final capacity. The native suite covers small-value versions, so these are large-value preservation checks rather than new API requirements.
3. Static review should assess absence of work proportional to the numeric capacity for large sparse cases. Do not reject literal numeric loops categorically: a bounded small-capacity fast path with a sparse large-capacity strategy can be valid. No Map-vs-array choice should be prescribed.

The 10s bound is suitable as a coarse safety/reproducer limit, accompanied by native regression suites and independent complexity review; it should not be reported as a precise performance gain or used as the sole correctness oracle. Standard in-process TypeScript compilation is environment adaptation, provided it executes the current candidate source on every grading run. The parent reports this bridge has passed 42 unchanged Semaphore tests; this review did not rerun that evidence.

## Supplemental source-compatible search

Inspected current open issue lists in tweenjs/tween.js, mobxjs/mobx, d3/d3-delaunay, prosemirror/prosemirror, moment/luxon, EricSmekens/jsep, and meriyah/meriyah. No clean 2-4 additional cohort tasks emerged without lowering scope/availability criteria. Four Luxon threads were fully captured under snapshots/moment__luxon:

| Issue | Result |
|---|---|
|1824 Duration.reconfigure retains old matrix|Exact open fix PR #1825. Exclude.|
|1806 fullwide/hanidec decoder mismatch|Exact open fix PR #1811. Exclude.|
|1802 Locale instance memoization|Author says patch ready; open PR #1803. Exclude.|
|1772 DST gap parsing|Maintainer confirms documented jump-forward behavior; discusses future wasHole/config option. No stable bug contract. Exclude.|

Luxon is naturally src/ JS with no cloud service requirement, but availability screening removes these otherwise suitable shapes. Other inspected lists were features, monorepo paths, browser/IME-dependent behaviors, or stale issues; they were not promoted as candidates merely to fill the cohort.
