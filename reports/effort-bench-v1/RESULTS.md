# Additive effort and baseline comparison

All six authorized attempts completed once. V2 Medium and original v1 Luna High each passed **2/3** independent task checks; the previous v2 High pilot passed **3/3**. Medium was cheaper and faster on average, but missed a compatibility case that the previous High run handled. Keep High as the provisional quality-first candidate; this three-task pilot does not justify lowering the default effort.

The six new attempts cost **$0.02525930 API-equivalent**, including failed attempts. No inference costs are unknown. The previous nine-attempt pilot remains frozen and was not rerun. Its results below are an **asynchronous historical comparison**, not a contemporaneous randomized control.

| Configuration | When | Independent acceptance | Eligible success | Total cost | Cost / accepted task, including failures | Mean actor seconds |
|---|---|---:|---:|---:|---:|---:|
| Full v2, Luna High | Previous pilot | 3/3 | 3/3 | $0.02084424 | $0.00694808 | 87.049 |
| Full v2, Luna Medium | New | 2/3 | 2/3 | $0.00927542 | $0.00463771 | 63.473 |
| Original v1, Luna High, no routing/features | New | 2/3 | 2/3 | $0.01598388 | $0.00799194 | 93.202 |

Compared descriptively with historical v2 High, Medium spent 55.5% less and took 27.1% less time on average, with one fewer accepted repair. Cost per accepted task was 33.3% lower, but that ratio does not resolve the accuracy tradeoff.

The same-model/effort comparison is also important: historical v2 High spent 30.4% more total inference than new v1 Luna High, while passing three rather than two tasks. Its cost per accepted task was 13.1% lower. This does **not establish universal harness savings** or identify which feature helped.

## Per-task observations

| Issue | v2 High, previous: accepted / seconds / cost | v2 Medium, new: accepted / seconds / cost | v1 High, new: accepted / seconds / cost |
|---|---|---|---|
| ws #2230 | yes / 67.326 / $0.00392234 | yes / 39.013 / $0.00175424 | yes / 91.135 / $0.00562048 |
| fast-xml-parser #705 | yes / 77.965 / $0.00737906 | yes / 95.454 / $0.00398658 | yes / 100.592 / $0.00531002 |
| Commander #1863 | yes / 115.856 / $0.00954284 | no / 55.951 / $0.00353460 | no / 87.879 / $0.00505338 |

Medium was faster on ws and Commander, but slower on fast-xml-parser than the previous High run. All public checks passed in all six new attempts. Advice, controller repair and Sol takeover therefore activated **zero times**. No Sol or native Codex inference was rerun. No private failures were fed back into actors.

## Calls, tokens and timing

| Configuration | Model responses | Tool calls | Fresh input | Cached input | Output including reasoning | Reported reasoning tokens |
|---|---:|---:|---:|---:|---:|---:|
| v2 High, previous | 47 | 124 | 120,142 | 527,104 | 7,118 | 2,410 |
| v2 Medium, new | 41 | 75 | 41,347 | 367,872 | 2,924 | 303 |
| v1 Luna High, new | 46 | 95 | 81,676 | 438,528 | 6,862 | 2,661 |

Reasoning fields are present on all 87 new and all 47 historical v2 High raw responses. Zero means an explicitly reported zero, not an omitted field. Reasoning tokens are already included in output and were not charged twice.

| Configuration | Mean request-to-assistant receipt intervals, seconds | Mean top-level codemode intervals, seconds | Mean deterministic verification, seconds | Other controller/preparation, seconds |
|---|---:|---:|---:|---:|
| v2 High, previous | 83.371 | 3.222 | 0.257 | 0.023 |
| v2 Medium, new | 61.954 | 1.069 | 0.251 | 0.021 |
| v1 Luna High, new | 90.702 | 2.044 | 0.263 | 0.001 |

Approximately 96–98% of observed actor wall time fell between a provider-request receipt and its completed assistant receipt. Deterministic final verification averaged about 0.25 seconds. These timestamp intervals include network, provider queueing, inference and streaming; they do not identify backend compute time or isolate the time spent reasoning. Top-level tool intervals are merged to avoid double-counting overlap. Every reported new and historical interval has its matching receipt; there are no missing pairs. The evidence points to model-call trajectories as the main observed latency component, rather than expensive local preparation or verification.

## The f11 contract miss

Both new patches add a special case that directly displays the child's help **only when that child's help option is disabled**. Otherwise they still forward the parent's long help flag into the child's option parser. This fixes the issue's literal disabled-option example, but preserves the faulty coupling between the help command and help-option flags.

Independent checks caught the same two failures in each new patch: a short-only child help flag triggers an undefined-argument `.length` crash; customized child help flags reject the forwarded `--help`. Both passed 12/14 independent help-command checks. Historical v2 High directly displayed the found child's help and preserved the preSubcommand hook, passing all 14.

The compatibility requirements are public, not an arbitrary private phrase or implementation demand. The issue asks for the help command independently of the help option; pre-fix README lines 895–910 explicitly allow customized help flags, disabling the option, and a separately configurable implicit help command. Public `tests/command.helpOption.test.js` also covers short-only/custom flags and was included in the prepared context. Medium nevertheless did not preserve the integrated help-command behavior. Exact issue/README evidence is retained in [public-contracts.json](public-contracts.json).

Evidence: [Medium patch](../../.suffice/effort-bench-v1/attempts/f11-v2Medium/tracked.patch), [Medium independent diagnostic](../../.suffice/effort-bench-v1/grading/f11-v2Medium/hidden-0/process-stderr.txt), [v1 High patch](../../.suffice/effort-bench-v1/attempts/f11-v1High/tracked.patch), [v1 High independent diagnostic](../../.suffice/effort-bench-v1/grading/f11-v1High/hidden-0/process-stderr.txt). Protected tests were restored before independent grading. These observations do not prove effort level alone caused the difference, or establish compatibility beyond the evaluated cases.

## Protocol, audit and limits

Six new attempts only, on f16/f09/f11; all are exposed development tasks. Per-attempt limits: $0.25 observed API-equivalent cost, 300 seconds, 40 responses, 160 tool calls, 4 GiB process-tree RSS. New arms alternate order across tasks, with at most two concurrent actors. Base-fail/reference-pass and pristine networked actor controls passed before inference. No tuning or duplicate inference attempts followed failures.

Executable harness source, original public prompts, prepared v2 prompts, dependencies and graders match the previous pilot. Source and exact public/prepared prompt hashes were checked. Effort was the only configured v2 worker change, but execution timing, model trajectories and cache state differ across runs. There is one observation per configuration/issue. This cannot establish a general causal effect, general accuracy, or savings on fresh repositories.

All 87 new responses independently reprice against pinned catalogs and reconcile with stage/attempt totals. Model/effort/tool identities and token partitions match. All 69 frozen source/runtime/evaluator hashes, 46 local/remote source-file hashes and 281 exported receipt hashes passed verification. Actor Git stores each expose one base commit and no fixing commit. Maximum observed process-tree RSS stayed below 4 GiB. No operational failures, resource stops or unknown costs occurred. The prior frozen pilot and original Suffice source were preserved.

The approximately 15-issue broader benchmark was **not dispatched**. No additional inference beyond these six attempts was started. Engineering/coordinator inference and actual subscription billing are outside API-equivalent totals.

Artifacts: [summary.json](summary.json), [comparison.json](comparison.json), [attempts.csv](attempts.csv), [audit.json](audit.json), [export-manifest.json](export-manifest.json). Raw filtered receipts are under `../../.suffice/effort-bench-v1/`. Credentials, dependencies and actor/grading workspaces are excluded; all model/session/usage, patch, command, check, control and process receipts are retained.
