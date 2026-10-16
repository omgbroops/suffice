# Post-campaign concurrency fix (v2, unbenchmarked)

The evaluated TestExecutionPolicy decides whether a request may run before awaiting the executor, then records its revision/checkpoint afterward. Concurrent codemode requests can both enter at the same revision. A deterministic regression reproduces two executions for both fixed and selective v1 modes.

`SerializedTestExecutionPolicy` serializes decision/execution/recording for restricted modes, so the next request sees the preceding completed observation. Unrestricted preserves parallel execution. Exceptions release the queue without recording completed freshness. Distinct selective test revisions still execute; a fixed checkpoint is consumed once, including concurrent checks with different test sources.

This file was created after all 18 scored attempts completed. The evaluated agent imports v1 and every archived snapshot remains unchanged. v2 has not received live model benchmarking. It addresses concurrent test admission, not simultaneous source mutation or immutable subprocess source snapshots; callers must still await edits before tests. Full production hardening needs execution-time source freshness enforcement.

Audit: scripts/test-execution-concurrency-audit.mjs infers intervals from process completion timestamps and measured subprocess durations and inspects codemode Promise.all batches. No explicit invocation-start event existed in the evaluated version; this timing audit may miss very small overlaps. Read reports/test-execution-concurrency-audit.json for observed traces.

Run: node --test tests/test-execution-concurrency-v2.test.mjs
