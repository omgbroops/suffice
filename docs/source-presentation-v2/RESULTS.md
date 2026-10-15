# Lossless source presentation: completed exploratory pilot

The live treatment ran, but did not demonstrate an efficiency improvement. Both arms passed all six attempts. Lossless source framing averaged **$0.03656** per accepted task versus **$0.03474** for original JSON: **5.2% higher** in this small cohort. This is an observed difference, not a reliable estimate of a regression. The strict system-prompt byte-parity check failed; the SDK's per-attempt working-directory field explains the differences in a separate post-hoc reconstruction.

The campaign used **GPT-6.1 Sol, low effort**, through the existing OpenAI subscription route and Pi 1.2.0. All 12 attempts finished, all 54 model replies have cost telemetry, and no provider-error/retry costs are missing. Known API-equivalent benchmark inference totaled **$0.4277792**. This is neither subscription billing nor total project expenditure; engineering-agent inference is excluded.

## Comparison

| Metric | A: original JSON | B: lossless source frames |
| --- | ---: | ---: |
| Attempts accepted | 6/6 | 6/6 |
| Accepted within the recorded budget | 6/6 | 6/6 |
| Total API-equivalent cost | $0.2084464 | $0.2193328 |
| Mean cost / cost per accepted task | $0.0347411 | $0.0365555 |
| Assistant turns | 27 | 27 |
| Tool calls, including nested calls | 89 | 92 |
| Fresh input tokens | 77,953 | 81,442 |
| Cached input tokens | 98,304 | 82,688 |
| Output tokens | 4,271 | 4,818 |
| Total recorded tokens | 180,528 | 168,948 |
| Sum of attempt latency | 163.619 s | 172.695 s |
| Missing full attempt costs | 0 | 0 |

Total token volume fell 6.4%, while cost rose. B had more fresh input and output, and less discounted cached input. The cost difference decomposes into **+$0.006978 fresh input**, **+$0.005470 output**, and **-$0.0015616 cached input**. These are accounting differences between observed trajectories; they do not establish what caused the trajectories or cache behavior to differ.

| Task / repetition | Order | A cost | B cost | B relative to A |
| --- | --- | ---: | ---: | ---: |
| fastq resume window / 0 | A, B | $0.0458580 | $0.0327328 | -28.6% |
| rfdc builtins state / 0 | B, A | $0.0231376 | $0.0304584 | +31.6% |
| Bottleneck weighted priority / 0 | A, B | $0.0372484 | $0.0358596 | -3.7% |
| fastq resume window / 1 | B, A | $0.0267464 | $0.0330424 | +23.5% |
| rfdc builtins state / 1 | A, B | $0.0205972 | $0.0324580 | +57.6% |
| Bottleneck weighted priority / 1 | B, A | $0.0548588 | $0.0547816 | -0.1% |

Three pairs favored B and three favored A. The fastq ranking reversed on repetition. Six correlated pairs from three previously exposed task families do not support a statistical or generalization claim.

## What activated

A returned original tool content, while running the formatter in shadow for common instrumentation. B replaced eligible newly emitted canonical JSON source objects with a JSON metadata header and exact literal source. The source, line numbers, omissions, version fields and other metadata remained recoverable without loss. No summaries, retrieval changes, history rewriting, model changes or extra review calls were added.

B applied the formatter to **11 tool outputs containing 22 source objects**. Every changed output reached the actual provider request, and every object round-tripped exactly. B removed **2,422 characters** of representation overhead: 106,696 to 104,274 characters across eligible outputs. Relative to all tool text on those same B trajectories, the saving was about **1.92%** (125,983 hypothetical original characters versus 123,561 actual characters). This is a character measurement, not a token or cost saving estimate. It suggests this conservative intervention targets only a small part of this workload's context.

The earlier offline audit's 25,771-character opportunity across 39 exposed traces motivated the pilot. Its 2.93% character reduction was not a predicted economic effect.

## Validation and a failed control

All 12 saved patches were reconstructed in fresh copies and passed the unchanged public and private acceptance tests. Event-based usage sums, unknown-cost classification, source/metadata round-trips, final transcript presentation, actual provider-output hashes, requested model/effort, allowed edits, frozen current inputs and archived inputs reconciled. No actor code, task, grader, prompt constant, model or limit was changed during the campaign.

**The frozen verification command nevertheless exits unsuccessfully.** Its global system-instruction hash check expected one value and observed 12. That failure remains in `reports/source-presentation-v2/verification.json` and `receipt-audit.json`; it has not been relabeled as a pass.

The post-hoc `instruction-parity.json` audit reconstructs the exact instruction encoding using the installed Responses serializer and saved system messages, matching all 54 logged request hashes. Replacing only each exact SDK-generated `<cwd>` section produces one common hash. Tool schemas and initial user text for each task were identical. Thus no additional instruction differences were found, but raw byte equality was not achieved. Workspace paths also contain run IDs and arm labels; cache and trajectory effects remain uncontrolled. This explanation narrows the issue and does not retroactively satisfy the frozen gate.

The 12 attempts were run serially in the frozen counterbalanced order. Limits were 12 attempts, $1.50 known-cost admission target, $0.20 per-attempt post-response threshold, 18 turns, 120 calls, 180 seconds, four unknown totals maximum and 80 MiB campaign artifacts. Recorded campaign artifacts were 8,330,740 bytes. No threshold required early stopping. These are admission/termination rules, not a hard billed-cost guarantee.

## Scope and disposition

These tasks contain disclosed injected defects in complete pinned real repositories. They were already exposed during benchmark calibration; they are efficiency controls, not new upstream fixes or an untouched evaluation set. No compaction, persistence, delegation, long-horizon treatment, full upstream regression suite, external harness comparison or capability gain was tested here. The unused Emittery and tinyqueue reserve tasks were not run.

The two retained v1 records failed authentication before any model request. They remain separate startup failures, not coding failures or a negative framing result. After renewed human login, v2 used the frozen shared file-backed authentication lifecycle and completed normally.

**Keep the existing Suffice baseline. Do not promote source framing.** A real treatment comparison now exists, but it did not establish lower cost. The small direct representation opportunity, variable pairs and failed raw instruction-parity gate do not justify another feature or an automatic larger campaign. If this intervention is revisited, check fully emitted instructions without inference and settle the working-directory control before freezing fresh runs.

## Evidence and reproduction

The companion review ZIP contains all 12 attempt workspaces, patches, grades, transcripts, durable events and presentation artifacts; the two original startup failures; frozen manifests and source copies; the three task packages with contracts/graders/reference solutions/upstream provenance; runtime and audit code; and the reports. It excludes authentication stores, shared dependencies and engineering-agent conversations.

Machine-readable results and checks are under `reports/source-presentation-v2/`. Raw campaign records are under `.suffice/source-presentation-v2/`. From this worktree with the pinned dependencies installed:

```powershell
node scripts/source-presentation-v2.mjs report
node scripts/source-presentation-v2.mjs verify
node scripts/audit-source-presentation-v2.mjs
node scripts/audit-source-instructions.mjs
```

These commands make no model requests. The middle two intentionally retain nonzero exit status because strict raw instruction parity failed. The final audit explains the difference. Do not use `freeze` to overwrite the existing manifest or create replacement attempts to hide the result.
