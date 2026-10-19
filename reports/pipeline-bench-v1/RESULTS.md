# Lightweight pipeline comparison

All nine planned Sonion attempts completed once. V2 independently passed 3/3 issues; original Suffice and native Codex each passed 2/3. All inference costs are known. Total benchmark inference was **$0.41071584 API-equivalent**, including failed attempts. Engineering/coordinator inference and actual subscription billing are excluded.

| System | Model / effort | Independent acceptance | Eligible success | Total cost | Cost per accepted task | Mean actor seconds |
|---|---|---:|---:|---:|---:|---:|
| Native Codex 0.163.0 | Sol Low | 2/3 | 2/3 | $0.25699400 | $0.12849700 | 42.389 |
| Original Suffice v1, no routing | Sol Low | 2/3 | 2/3 | $0.13287760 | $0.06643880 | 40.405 |
| Full experimental v2 | Luna High; conditional Sol stages | 3/3 | 3/3 | $0.02084424 | $0.00694808 | 87.049 |

V2 total inference was 84.3% lower than v1 and 91.9% lower than native Codex in this pilot. Including failures in the numerator, its cost per eligible accepted task was 89.5% lower than v1 and 94.6% lower than native Codex. These are descriptive pilot results, not general superiority estimates. V2 took 115.4% longer than v1 on average.

## Work and activation

| System | Model responses | Tool calls | Fresh input tokens | Cached input tokens | Output tokens, including reasoning | Maximum process-tree RSS GiB |
|---|---:|---:|---:|---:|---:|---:|
| Native Codex | 28 | 25 | 80,552 | 512,000 | 4,469 | 1.524 |
| Suffice v1 | 19 | 42 | 47,583 | 76,416 | 3,007 | 0.676 |
| Suffice v2 | 47 | 124 | 120,142 | 527,104 | 7,118 | 0.632 |

Every v2 attempt completed with Luna alone: **zero Sol advice, zero controller repairs, zero Sol takeovers**. Prepared context, compact project guidance, output control, soft notices and deterministic final checks were enabled. The live results do not validate the advice/repair/takeover or fleet batching paths; those were covered by local tests only. V2 used more responses, tool calls and input tokens, so the lower cost is primarily a cheaper-model opportunity, not a demonstrated reduction in computational work.

## The shared f11 failure

Both native Codex and v1 fixed the reported disabled-help-option example, added regression tests, and passed public checks. Their patches display subcommand help directly only when that subcommand's help option is disabled. Other cases continue forwarding the parent's help flag into the child's option parser.

Independent checks caught two related compatibility cases in both patches: a child with only a short help flag crashed when the forwarded long flag was undefined; a child with customized help flags rejected the forwarded `--help`. Each failed 2/14 independent help-command checks. V2 instead calls the found child's help method directly, preserving the `preSubcommand` hook, and passed all 14 checks.

These checks are supported by the public contract: the issue asks for the help command to work independently of the help option. The pre-fix `Readme.md` lines 895–910 explicitly allow customized help flags or disabling the option, and separately describe the implicit help command. The exact public issue and hashed README excerpt are retained in [public-contracts.json](public-contracts.json). This establishes the observed contract miss; it does not prove complete Commander compatibility beyond the evaluated cases.

Saved patches: [native Codex](../../.suffice/pipeline-bench-v1/attempts/f11-codex/tracked.patch), [v1](../../.suffice/pipeline-bench-v1/attempts/f11-v1/tracked.patch), [v2](../../.suffice/pipeline-bench-v1/attempts/f11-v2/tracked.patch). The grader restores protected tests before adding independent acceptance cases. No private feedback entered any coding session, and neither failed attempt was rerun.

## Scope and controls

The cohort is ws #2230 (f16), fast-xml-parser #705 (f09), and Commander #1863 (f11). It is disjoint from the earlier six-task packet pilot. f16 had no prior field-campaign execution at selection, but all three issues were already prepared and f09/f11 were historically exposed development tasks. This is **not a fresh held-out evaluation**.

One attempt per issue/system, counterbalanced ABC/BCA/CAB. At most two actors ran concurrently. All arms received identical public issue text, original source, preinstalled dependencies and final independent graders. Per-attempt limits were $0.25 observed API-equivalent cost, 300 seconds, 40 provider responses, 160 tool calls and 4 GiB aggregate process-tree RSS. V2's advice/repair/takeover stages shared the same limits. Base-fail/reference-pass and pristine networked actor controls passed for all three tasks before inference.

This compares complete systems. V2 changes the worker model/effort and harness together, so it cannot identify the individual contribution of context preparation, prompt changes, output control or notices. Cache state was observed rather than reset; order was counterbalanced. Nine executions across three small issues cannot establish general accuracy, speed, or savings.

## Audit and artifacts

- All 94 responses were independently repriced from raw provider/native usage using pinned startup price catalogs, and reconciled to stage/attempt totals. Reasoning was not charged twice.
- Native Codex's pinned Sol prices exactly match the current Pi Sol startup catalog, including long-context tiers. Native model/effort identities and final usage aggregates reconcile.
- All 68 frozen source/runtime/evaluator hashes passed postflight verification. All 46 synced harness/test source files match locally and remotely. All 415 exported receipt digests match.
- Actor Git stores each expose one reachable base commit; fixing commits are unavailable. Runtime, dependencies and source metadata were read-only inside the reused bubblewrap boundary.
- No operational failures, resource stops, unknown costs or duplicate inference attempts occurred. All observed RSS values remained below 4 GiB.
- Full local validation passed 56/56 tests before source freeze. Main Suffice and the earlier frozen experiment were not changed by this campaign.

[summary.json](summary.json), [attempts.csv](attempts.csv), [audit.json](audit.json), and [export-manifest.json](export-manifest.json) provide the machine-readable results and evidence inventory. Raw receipts remain under `../../.suffice/pipeline-bench-v1/`. The filtered export excludes actor/grading repositories, dependencies, credentials and native plugin/catalog caches; it retains all provider/native sessions and usage, patches, commands, public/independent checks, control and process receipts.
