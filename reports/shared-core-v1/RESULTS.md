# Shared-core ablations, 2026-10-19

All **48 attempts were accepted and policy-valid**, with complete, independently
repriced receipts totaling **$1.13066116 API-equivalent cost**. Every configuration
scored **4/4**. This narrow pilot establishes no accuracy improvement. Most optional
features increased observed cost and latency; none earns a production default change.

Flexible and Efficient now share an experimental execution interface. Flexible
preserves V1's model/effort choice and original prompt/tool behavior when features
are off. Efficient retains V2's Luna default and conditional Sol assistance. The
installed CLI and its production defaults remain unchanged. See
[usage and limitations](../../docs/shared-execution.md).

## Matched results

One attempt per issue/arm/model, four distinct issues, six arms, two model strata.
All comparisons below use the same model and effort as their own baseline.
Cost/task also equals cost/accepted task here because every attempt passed.
Time is mean actor/controller wall time, including checks and preparation; separate
outer process and grading times are retained in [attempts.csv](attempts.csv).

| Model / effort | Arm | Accepted / valid | Cost/task | Cost vs baseline | Mean seconds | Time vs baseline |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Sol medium | Baseline | 4/4 | $0.041782 | — | 43.3 | — |
| Sol medium | Output only | 4/4 | $0.045126 | +8.0% | 54.2 | +25.0% |
| Sol medium | Contracts + conditional repair | 4/4 | $0.042170 | +0.9% | 47.4 | +9.4% |
| Sol medium | Output + contracts | 4/4 | $0.048536 | +16.2% | 53.4 | +23.3% |
| Sol medium | Prepared context only | 4/4 | $0.047913 | +14.7% | 48.7 | +12.3% |
| Sol medium | Advisory notices only | 4/4 | $0.038866 | -7.0% | 49.1 | +13.2% |
| Luna high | Baseline | 4/4 | $0.002437 | — | 52.1 | — |
| Luna high | Output only | 4/4 | $0.002808 | +15.2% | 66.9 | +28.4% |
| Luna high | Contracts + conditional repair | 4/4 | $0.002586 | +6.1% | 68.7 | +31.8% |
| Luna high | Output + contracts | 4/4 | $0.003374 | +38.5% | 75.6 | +45.1% |
| Luna high | Prepared context only | 4/4 | $0.004056 | +66.4% | 66.0 | +26.7% |
| Luna high | Advisory notices only | 4/4 | $0.003012 | +23.6% | 66.5 | +27.7% |

These are observed differences, not reliable causal estimates. In particular,
baseline, contract-only and notice-only runs had identical initial provider-prefix
hashes for every issue/model pair. No contract failed, no repair ran, and no advisory
notice fired. Their model spending differences reflect stochastic trajectories,
cache/order and service variation, not extra verification inference or demonstrated
notice benefits. Sol's notice-only cost reduction cannot be credited to a hook
that never activated. Model strata are not a model-independent harness comparison.

## What activated

* Output arms emitted **49 model-presentation cap notes** and captured **38 large
  Bash observations**. There were **zero output retrieval calls**. Original-byte
  recovery, binary handling and concurrent isolation are covered by local tests;
  this pilot does not establish successful task-time recovery or a savings benefit.
  Output capability added 700 bytes to every first provider request.
* Prepared context supplied 19 sources / 63,045 bounded bundle bytes per model
  stratum. First provider requests grew by 15,682–20,098 bytes. Both strata cost
  more; Luna's +66.4% regression is retained. No model generated these previews.
* Sixteen automatic public-contract executions all passed: **56.5 ms median**,
  **157.3 ms mean**, **28–1,529 ms range**, **2.517 seconds total**. There were
  **zero paid repairs or assistance calls**. The larger overall V-arm solve-time
  differences are not the measured deterministic check overhead. No accuracy rescue
  was observed, so the repair policy's incremental value is unmeasured.
* Soft notices were enabled separately but never fired. Guidance, runbooks, thin
  prompts, model routing and expert planning were not treatments in this campaign.

Total actor activity: **391 model responses, 832 tool calls**, 766,081 fresh input
tokens, 2,324,224 cache-read tokens, zero cache-write tokens and 62,047 output tokens.
Provider receipts identify 16,995 reasoning tokens within output, not additional
billable output. All replies are included; no failed attempts were replaced.

## Scope and controls

Fresh to our previous campaigns, the four historical public issues were:

| Fixture | Public issue | Behavior |
| --- | --- | --- |
| b01 | [p-debounce #34](https://github.com/sindresorhus/p-debounce/issues/34) | A later queued batch remains abortable after the running batch completes |
| b02 | [p-memoize #62](https://github.com/sindresorhus/p-memoize/issues/62) | A synchronous cache failure does not permanently retain a rejected promise |
| b03 | [p-timeout #45](https://github.com/sindresorhus/p-timeout/issues/45) | Timer calls work with a receiver-sensitive timer implementation |
| b04 | [p-retry #97](https://github.com/sindresorhus/p-retry/issues/97) | Abort during input is observed before waiting through retry delay |

All unrepaired negative controls fail issue acceptance; all focused positive
controls pass native tests plus public and separate acceptance checks. The public
reproducer scripts were available read-only to every actor. Only V/OV automatically
ran them and could use their result for repair. Separate grading never informed
actors or routing. Original project tests were restored for grading.

Preparation problems are preserved: the full p-memoize upstream repair fails an
unrelated existing cache-clear message assertion. Its positive control instead uses
a focused one-line microtask deferral suggested by the public issue. A TypeScript
loader executes all 25 original tests, including decorators. Earlier loader probes
that did not execute substantive tests were rejected before inference. p-retry #100
was excluded before inference for an inconsistent requested/fixed contract.

Limits were $0.25/300 seconds/40 responses/160 tool calls/4 GiB per attempt,
concurrency two, and a $12 campaign ceiling. Actual spend was $1.13066116. Prices
were frozen from the Pi model catalog, including cached input and prompt-size tiers;
these are API-equivalent estimates, not account invoices. Deterministic setup,
dependency installation, private grading and our engineering time are outside actor
inference cost. Manually authored public contract preparation is not a free generic
capability. Source/task/dependency/price hashes and ordering were frozen before
paid actor inference in [manifest.json](manifest.json).

The sample is four small JavaScript/TypeScript utilities from one maintainer, with
public fix suggestions and one attempt per condition. It has an accuracy ceiling,
sampling variance and cache/service/order confounding despite counterbalanced order.
The same engineer authored public and private checks. There is no blind review,
cross-language conclusion or production-quality equivalence claim. No native Codex
comparison was rerun: this study isolates shared options within Suffice.

## Smallest set worth sharing

Keep **recoverable output control** and **explicit public-contract verification**
as optional shared services. Their justification is recoverability and inspectable
verification coverage, not a demonstrated cost or accuracy win in this pilot.
Flexible remains unchanged with both off; Efficient retains its existing policy.
Leave prepared context and soft notices separate and off in Flexible. Keep guidance
and runbooks scoped to explicit, fresh evidence. Do not add a universal critic,
global skill loading, Claude-specific hook installation or the proposed decomp router.

The old Sol non-escalation is explained by coverage: independently incorrect patches
passed the checks available to the controller. A small public issue reproducer plus
compatibility checks can supply a low-overhead failure signal. On an observed failure,
allow one bounded same-model repair in Flexible or existing selective Sol assistance
in Efficient. Passing checks still cannot certify semantic correctness. The branch
implements this connection and tests the trigger; this paid pilot had no failing
public contract and therefore did not exercise it. See
[component audit and diagnosis](COMPONENTS.md).

A material decomp distinction: v7/v6 consume hidden acceptance pass/fail to select
retry phases. Sealed test contents do not make that feedback public. That mechanism
is excluded here. The inspected repository has no packaged `SKILL.md` files.

## Validation and receipts

Focused local tests: **54 passed**. Full Windows suite: **146 passed, 2 failed**;
both failures reproduce on the pristine starting commit. Details and preserved
limitations are in [VALIDATION.md](VALIDATION.md). Production CLI source and all
previous benchmark sources/reports have no changes from the starting revision.

[summary.json](summary.json) and [attempts.csv](attempts.csv) retain all groups,
individual outcomes, costs, cache usage, calls, latency and feature activity.
The analyzer independently recomputed every known cost. All 48 response ledgers
match provider receipts; all model/effort identities match; no costs are unknown
and no planned attempt is missing or unexpected. Source/evaluator freeze verification
passed after completion.

Full filtered receipts remain on Sonion at
`C:\Users\Eric Qin\Documents\GitHub\suffice\.suffice\shared-core-v1\receipts`,
copied from the isolated WSL campaign without modifying original receipts. The
hash inventory is [export-manifest.json](export-manifest.json): **2,097 files,
14,077,087 bytes**, rehashed again on Windows. [integrity.json](integrity.json)
records the completed audit. Credentials,
dependencies and actor/grading workspaces are excluded from the export.
Raw receipts are intentionally ignored by Git. The Mohammed machine was offline;
source synchronization is by the pushed branch and the user's later pull.

To recompute the report, run `python3 reports/shared-core-v1/analyze.py STATE OUTPUT
--require-complete`, where STATE is the retained WSL campaign directory or the
Windows receipt export. The analyzer reads receipts and writes summaries; it does
not run actors or change grades. `benchmark/shared/runner.mjs verify` in the frozen
WSL application rechecks source, evaluator and catalog hashes without inference.
