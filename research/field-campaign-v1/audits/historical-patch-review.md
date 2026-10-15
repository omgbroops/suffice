# Historical patch review

Recorded 2026-10-15T07:53:59.221402+00:00. Reviewed12 primary-accepted patches from six v2 historical tasks. Model calls: **0**. No primary source, grader, task or result changed. Frozen general input mismatches: 0.

**Two public API regressions were confirmed posthoc in primary-accepted Pi patches.** These checks were not part of the frozen primary grade and do not rewrite it. Both affected Pi attempts also have budgetEligible:false because provider receipts were unmatched after a failed response; code acceptance and benchmark success are separate.

| Task | Suffice review | Pi review |
|---|---|---|
| s01 Emittery | Reserved-event probe passes | New pending metadata window permits forbidden userland meta events |
| i01 node-fetch redirects | No introduced regression found | No introduced regression found |
| i02 node-fetch empty deflate | No introduced regression found | No introduced regression found |
| i03 p-limit iterator failure | No introduced regression found | No introduced regression found |
| i04 fastq concurrency | Fraction guard and reentrant pause checks pass | Fraction guard passes; reentrant pause hangs |
| q04 shared epoch | Dormant foreign computed get passes | Dormant foreign computed get passes |

**s01-Pi: reserved event permission window.** Immediately after ordinary `.on()`, its async helper leaves a per-emitter pending counter present until internal delivery settles. Public `emit` and `emitSerial` use that presence as blanket permission. All four combinations with listenerAdded/listenerRemoved fulfilled in the posthoc probe, although base, actual upstream reference and Suffice reject TypeError. This uses documented event identifiers and methods, not private structure assumptions. Primary tests cover legitimate delivery after settling and miss this pending window.

**i04-Pi: a worker pausing its own queue can trap resume or concurrency assignment.** Its unbounded loops omit a paused check on each iteration. When a newly started worker pauses, release decrements running without advancing the queued head, so the loop never finishes. Both probes printed before but not after and were bounded at2seconds. Base returned; Suffice returned with queued work paused. Actual upstream reference also hangs, demonstrating a reference-oracle blind spot rather than a probe tailored only to the actor.

Both fastq patches explicitly reject fractional1.2 in construction and assignment, covering the original report even though primary grading omits it. They also reject Infinity previously accepted by base/reference. That is disclosed API tightening; the original report/docs do not establish an Infinity policy, so this review does not invent one or count it as a confirmed task failure.

**q04: representation and types.** Both patches share an object through a registered symbol, which is valid for the public issue. Epoch is absent from the supported package root export and was absent from atom declarations before the patch; no supported typed API regression was found. A dormant cross-module computed was read, unmounted with cleanStores, changed through its foreign source, then read again. Base stayed6; reference and both patches returned12. Actual bundler/tree-shaking output remains unverified. Different independently chosen internal global keys are not treated as a required interoperability contract.

The i01 changes match upstream redirect handling structurally, including manual mode and request finalization. i02 preserves wrapped/raw decoding and adds empty-stream settlement. i03 preserves Array.from/array-like behavior and observes scheduled rejections via unawaited allSettled. No concrete introduced regression was found in those reviewed changes; this is not exhaustive proof of correctness.

Credibility limits:

- Primary acceptance measures the frozen tested contract, not complete public API correctness. Two primary-accepted Pi patches have confirmed posthoc regressions; both already have budgetEligible:false from unmatched/failed provider receipts, so do not conflate code acceptance with budget-qualified benchmark success.
- Do not retroactively change frozen graders or primary accepted/success values. Present posthoc findings separately with base/reference controls and exact reproduction.
- The fastq actual reference shares a reentrant-pause defect and omits fractional validation in primary controls. Reference-pass is useful positive control, not proof of complete correctness.
- q04 storage representation should remain opaque; requiring a particular symbol/object field or reference global key would create an unsupported oracle. Current public-output checks and dormant probe are representation-neutral.
- Ten selected historical issues, one pair per issue and often detailed original solution hints support a small controlled comparison of these tool/harness settings, not a general coding-success rate or a causal claim from one divergence.
- Valid v1 state/queue runs and corrected v2 runs must be distinguished from invalid v1 integration attempts and diagnostic replays. Wall-clock strict-rate tests have demonstrated baseline instability; disclose that alongside primary grades.
- Node24 runtime, immutable dependencies, selected native checks and omitted full lint/type/size/bundler CI limit external generalization. Preserve unknown costs and provider failure/accounting cases rather than treating known estimated cost as complete.

The companion JSON records primary acceptance, budget eligibility, hashes, static review and all posthoc rows. Probe code and raw receipts are retained separately under `historical-patch-review/` and `.suffice/field-posthoc-historical-v1/`. All posthoc runs use the same isolated host adapter with networking disabled; no model or actor was rerun.
