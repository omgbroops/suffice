# Luna safeguards and extra-high reasoning: final results

**All 30 planned attempts completed.** This is a retry of the original ten real GitHub issues in fresh actor sessions, not ten fresh issues or a held-out evaluation. No subagents were deployed. All execution ran on Sonion; the durable scheduled task finished while the local PC was disconnected.

| Arm | Frozen-check acceptance | All-attempt inference | Cost per primary accepted task | Model replies | Mean actor time |
|---|---:|---:|---:|---:|---:|
| Ordinary Luna-low | 2/10 | $0.036279 | $0.018139 | 109 | 84.4 s |
| Luna-low + all three safeguards | 3/10 | $0.044845 | $0.014948 | 131 | 134.3 s |
| Ordinary Luna-xhigh | 7/10 | $0.135087 | $0.019298 | 177 | 286.7 s |

Total API-equivalent benchmark inference: **$0.21621146**. All 417 request/reply/raw-usage records reconcile. No provider failures, unknown response costs, cost-cap stops or budget-ineligible attempts occurred. These are API-equivalent estimates under subscription access, not cash charges. Engineering inference, preparation and infrastructure are excluded. Internal public-gate execution problems are documented below; operational worker completion is not proof those checks succeeded.

## The primary scores overstate complete correctness

**Keep the 2/10, 3/10 and 7/10 frozen-check scores, but do not call all of those complete fixes.** Supplementary model-free review confirmed two blind spots:

- **B / p-queue #249:** its extra primary pass still leaves `onSizeLessThan(1)` pending when the last queued task starts, until a task completes. It also emits the existing completion event at startup when other tasks remain. The original baseline preserves that event contract; the frozen reference passes both post-hoc probes; the B patch fails both. Thus the apparent third success is not an established complete rescue.
- **C / Emittery #118:** its pending counter grants blanket permission to emit reserved meta events during internal delivery. All four public emit/emitSerial × listenerAdded/listenerRemoved combinations incorrectly succeed. Original baseline and reference reject TypeError. This is a new regression missed by primary checks.

These post-hoc observations do not silently rewrite primary grades, and the bounded, asymmetric review must not be presented as a new fully verified success-rate cohort. Review receipts are in `posthoc-regressions.json`.

The same review found C passes fastq reentrant-pause checks that even the upstream reference fails, and passes the dormant foreign-computed probe. References are useful controls, not complete correctness oracles.

## Per-task primary outcomes

| Issue | A: low | B: low + safeguards | C: xhigh |
|---|---|---|---|
| Emittery #118 | Fail | Fail | Pass (post-hoc regression) |
| node-fetch #1386 | Fail | Fail | Fail |
| Nano Stores #371 | Fail | Fail | Pass |
| p-limit #110 | Fail | Fail | Pass |
| Nano Stores #323 | Pass | Pass | Pass |
| Nano Stores #416 | Fail | Fail | Fail |
| node-fetch #1442 | Pass | Pass | Pass |
| fastq #80 | Fail | Fail | Pass |
| p-queue #251 | Fail | Fail | Pass |
| p-queue #249 | Fail | Pass (post-hoc regression) | Fail |

C retained the two ordinary-low passes and added five primary passes. Its remaining primary failures are concrete: node-fetch still throws an uncaught invalid-redirect URL error; Nano Stores still breaks ordinary dotted keys; p-queue still emits `next` before completion. The p-queue C failure is a deterministic original assertion (1 instead of 0), not the previously documented timing flake.

## What the three safeguards actually did

B added one generic instruction block, same-worker pre-edit probes, an adjacent preservation check, and deterministic public verification followed by at most one same-session repair. There was no extra planner/model/reviewer. The system prompt and codemode/tool schemas stayed unchanged. Original public test bytes were restored in the gate workspace. Every repair shared the original cost/turn/tool/time allowance.

**Activation:** pre-edit execution candidates were observed in 9/10 attempts. Five public gates triggered repair; 53 deterministic check commands ran. Q02 changed from independently rejected first submission to a primary-accepted final patch, but the post-hoc edge cases above show that its repair remains incomplete. No other repair changed primary rejection to acceptance.

The implementation and generated checks also had important limitations:

- **Faulty oracle:** the Emittery probe expected two listener-added meta events. Public source deliberately excludes meta-listener registration from meta notifications, so this scenario should produce one. The supplied reference also fails the actor's assertion. That is an invalid expectation, not evidence that the correct implementation should change.
- **Nondiscriminating probes:** the Nano Stores #371 probe used one module instance even though the issue concerns separate instances. Both that probe and #323's probe pass the unchanged failing baseline. A file named probe is not evidence the relevant assumption was tested.
- **Late probe:** the p-limit probe was not recorded before the first production change. A post-edit test can be useful but does not establish pre-edit decision support.
- **Loader mismatch:** the automatic gate launched authored scripts with plain Node even when p-queue source requires its tsx loader. A separate loader-aware audit confirms the scripts can distinguish baseline from reference under the proper project loader. The original gate/module errors remain preserved as tooling limitations, not new coding failures.
- **Network mismatch:** the gate used the actor's shared network while matching a failure list recorded under network-disabled grading. On identical final public source, toggling only network changes node-fetch native failures from 4 to 3 or 2. The exact-name gate therefore triggered repair on improved environment outcomes. `gate-environment-audit.json` records this controlled replay.
- **Reference limitation:** fastq's supplied reference fails the actor's fractional-concurrency probe, but the original public issue explicitly calls out 1.2 as invalid. This case must not be labeled a bad test merely because a reference fails it.

Consequently B is evidence about this particular imperfect bundle, not a clean falsification of properly implemented verification or preservation. Its numerical cost-per-primary-pass advantage is not a validated reliability improvement. The gate's failed final outcomes remain structured in the receipts even though `completed` denotes worker termination. Do not ship/promote this experimental configuration.

## Effort and economics

C spent 3.72 times A's inference and achieved 3.5 times its primary acceptance count. Cost per primary accepted task rose about 6.4%; this bought substantially more coverage, rather than an improvement in that ratio. Mean actor time increased from 84.4 to 286.7 seconds. B increased all-attempt inference by about 23.6%.

| Inference component | A: low | B: safeguards | C: xhigh |
|---|---:|---:|---:|
| Fresh input | $0.025118 | $0.029458 | $0.053152 |
| Cached input | $0.005448 | $0.008156 | $0.031852 |
| All output | $0.005713 | $0.007231 | $0.050083 |

Usage explicitly reports zero reasoning-output tokens in all low-arm response records and 75,083 reasoning-output tokens in C. C's 100,167 output tokens already INCLUDE those reasoning tokens; they are not charged twice in this report. This is provider telemetry, not a claim that low models performed no internal reasoning. Actual request payloads were low/low/xhigh as assigned.

The previous Sol-low reference accepted 10/10 for $0.540464. C used about 75% less inference in total, but accepted fewer tasks and has the confirmed additional regression. That is **not** accuracy-preserving savings or Sol/Astra parity. No new Sol, Pi, Codex or Astra comparison was run here.

## Integrity, limits and decision

All 30 attempts used the same original task text, physical source, dependencies and independent grader. A/C prompts match the original Luna prompts; B adds the same generic instructions on every task. Order rotates ABC/BCA/CAB. One actor ran at a time, under the same $0.25, 60-response, 240-call and 600-second ceilings. Frozen original/native/private controls were reused after exact source/input checks; they were not freshly rerun and are not described as new controls. Actor test edits were retained and excluded from acceptance. Private graders/references were never mounted into actors. All 14 original general-v1 inputs and all 43 variant files still match their manifests. No old benchmark or old ZIP was changed.

Latency includes the worker's own public gate and repairs, excluding external setup/independent grading. A small model-free parent audit overlapped the initial C attempt; no concurrent coding actors or subagents were used. Timing is descriptive. PC/Tailscale disconnection did not restart or duplicate attempts.

These are development-reused issues from six correlated repositories, one attempt per task/arm, with possible public solution hints/training exposure and known grader blind spots. There is no fresh held-out result, individual safeguard ablation, or xhigh-plus-safeguards arm.

**Decision:** extra-high effort is the stronger development candidate. Keep the proven Sol baseline unchanged. Do not enable the safeguards bundle or claim its third primary pass as a complete fix. Any next evaluation should use fresh, faithful contracts and separate effort from a corrected verification implementation; no further model campaign has been started.

Machine-readable accounting and integrity: `FINAL-RESULTS.json` and `audit.json`. Raw gate/probe controls: `probe-control-audit.json`, `probe-control-audit-v2.json`, `gate-environment-audit.json`, and `posthoc-regressions.json`. Per-attempt receipts/patches, original controls and frozen sources are included in the new review bundle, whose path and SHA-256 are in `BUNDLE.json`.
