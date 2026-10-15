# Luna calibration cohort v2: declared before inference

This amendment expands the four-task preparation cohort before any Luna actor request. The already frozen v1 evaluator/source manifest is preserved and has no scored attempts. The same Luna model runtime and zero-inference startup/isolation proof are reused without runtime source changes. New results belong only to `.suffice/luna-baseline-v2` and `reports/luna-baseline-v2`.

The original four cases remain the primary subset, followed by six secondary cases, all declared now:

| Order | ID | Repository issue | Role |
|---|---|---|---|
| 1 | s01 | Emittery #118, asynchronous meta-event behavior | Primary |
| 2 | i01 | node-fetch #1386, malformed redirect error | Primary |
| 3 | q04 | Nanostores #371, state across module instances | Primary |
| 4 | i03 | p-limit #110, mapper/iterator rejection | Primary |
| 5 | s02 | Nanostores #323, computed cleanup state | Secondary |
| 6 | s03 | Nanostores #416, deepMap whole-store notifications | Secondary |
| 7 | i02 | node-fetch #1442, empty deflate response | Secondary |
| 8 | i04 | fastq #80, mutable concurrency/pause behavior | Secondary |
| 9 | q01 | p-queue #251, interval capacity after idle | Secondary |
| 10 | q02 | p-queue #249, queue-size observer settlement | Secondary |

Run one Suffice/Luna attempt per case, serial in this order. All are exposed historical calibration, using the same independent private contracts as the valid corrected Sol campaign. They are not fresh holdout evidence. q03 remains excluded for its unsupported cancellation contract. Do not replace failed, expensive, partial or operationally invalid Luna attempts. Describe any operational invalidity separately and retain its expense.

The only inference model is exact `openai/gpt-6-luna` at low effort. Preserve the copied architecture, system/user prompts, tools, retries, cache/compaction policy and limits specified in [v1](PROTOCOL.md). Each attempt still has a $10 API-equivalent post-response ceiling, 60 finalized responses, 240 observed tool calls and 600 seconds; 180-second Suffice command limit. Aim below $1 total known benchmark inference, rather than spending toward those ceilings. Costs remain estimates, all failed attempts count, and unknown cost is never zero. No additional model or optimization mechanism is introduced.

Before launch, complete deterministic exact-path original-native/original-fails/reference-passes controls. Verify the catalog price snapshot against startup metadata, exact low-effort Luna IDs in provider requests and finalized replies, and complete event/usage reconciliation. Compare valid Sol receipts on identical tasks/contracts only after the main comparative set completes; identify evaluator version and report the original primary subset, added secondary subset and all ten separately. No Astra inference or Astra comparison is claimed. If all models pass, these tasks do not establish a capability distinction.

Only the parent agent may release the launch gate after the main comparison is complete. Preparation, staging, and zero-inference proof are not launch authorization. Example commands after release are `node experiments/luna-baseline-v1/campaign-v2.mjs preflight ID` followed by `... run ID`, in the frozen order. Existing actors, private graders, references, credential files and main-runtime sources remain outside any reconciliation export. All code changes are authored locally and pushed with SHA-256 verification; pull noncredential receipts/manifests for review.
