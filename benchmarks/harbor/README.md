# Harbor benchmark harness for Suffice

This directory is the clean replacement for the invalid handwritten benchmark
runner. It uses Harbor for task isolation, verifier execution, timeout
enforcement, retries, artifacts, and network policy enforcement instead of
reimplementing those controls in Suffice.

Current scope: DeepSWE v1.1. Terminal-Bench 4.1 is intentionally not wired yet.

## Arms

The comparison is one Harbor task invocation per task per arm:

| Arm | Agent | Model use |
| --- | --- | --- |
| `pi` | Stock upstream Pi coding-agent CLI | `gpt-6.2-sol` at `xhigh` |
| `core` | Suffice single-agent harness, full bash access, browser/desktop disabled | `gpt-6.2-sol` at `xhigh` |
| `auto` | Suffice routing/escalation/racing harness | router/visible-validation/cheap repair lanes use `gpt-6-luna`; direct and escalated lanes use `gpt-6.2-sol` at `xhigh`; ambiguous-task race lanes use `gpt-6.2-sol` at `low` |

Internal auto router, judge, retry, race, and escalation calls are part of the
same benchmark attempt. They are not extra task attempts, but all token/cost
telemetry is aggregated into the attempt result.

DeepSWE is pinned exactly as:

```text
datacurve/deep-swe-1-1@sha256:5affcd534fd90ac85d202d4c63f8b35ddc942140afdd5d60014a21365440a2f5
```

The pinned task definitions control execution: 113 tasks, 3-hour agent timeout,
30-minute verifier timeout, no normal network during the agent phase, and a
separate verifier environment. This harness adds only the minimum agent-phase
allowlist needed for the credential proxy (`api.openai.com` and
`auth.openai.com`).

There is no benchmark-level 30-minute cap, turn cap, or 250-tool-call cap.
Suffice's product-level per-command timeout is harness behavior, not a
benchmark rule, and must be disclosed with results.

## Credential isolation

Do not copy the real OpenAI OAuth credential into the task container. The
benchmark repositories are untrusted and the agent intentionally has bash.

`run-deepswe.sh` instead:

1. copies `~/.suffice/auth.json` into a temporary host directory;
2. builds a minimal `suffice-openai-proxy` container;
3. mounts that copy only into the proxy container;
4. routes the proxy through Harbor's egress-controlled network namespace;
5. writes a custom Pi/Suffice provider config in the task container pointing at
   `http://127.0.0.1:8787/v1` with a dummy key;
6. injects the real OAuth access token only in the proxy;
7. refreshes rotated OAuth tokens under a cross-container file lock; and
8. deletes the copied credential directory when the launcher exits.

The task container never receives `auth.json`, the refresh token, or the real
access token. It can reach only the proxy API surface, which forwards `/v1/*`
to OpenAI.

## Prerequisites

```bash
suffice login
docker info
```

The auth directory defaults to `~/.suffice`; override with `SUFFICE_AUTH_DIR`.
The catalog must contain `gpt-6.2-sol` and `gpt-6-luna`. Run preflight alone
with:

```bash
python3 benchmarks/harbor/preflight.py
```

## Smoke one task without launching the benchmark matrix

Use one visible DeepSWE task and one arm first:

```bash
ARMS=core CONCURRENCY=1 \
  ./benchmarks/harbor/run-deepswe.sh \
  --include-task-name datacurve/termenv-preserve-ansi-resets
```

Then repeat with `ARMS=pi` and `ARMS=auto` only after core installation and
inference are known to work. Smoke results are not benchmark scores.

For adapter-only installation checks, append `--install-only`; Harbor skips the
agent run and verification.

## Full DeepSWE matrix

This launches 339 attempts: 113 tasks x 3 arms x 1 attempt. Do not run it as a
smoke test.

```bash
ARMS=pi,core,auto CONCURRENCY=2 ./benchmarks/harbor/run-deepswe.sh
```

Useful environment overrides:

- `OUTPUT_ROOT`: artifact root; default `benchmarks/results/harbor-deepswe-v1.1`
- `CONCURRENCY`: Harbor concurrent trials per arm; default `2`
- `HARBOR`: Harbor executable; default `$HOME/.venvs/harbor/bin/harbor` if present
- `SUFFICE_STRONG_MODEL`, `SUFFICE_CHEAP_MODEL`: model IDs; defaults above

The script uses Harbor retries for infrastructure/provider failures:
`--max-retries 3`, while excluding agent and verifier timeouts. Timeouts are
valid zero scores and must not be retried merely because they timed out.

## Oracle/nop task validation

Before treating a task subset as publishable, validate the benchmark artifacts
with Harbor's built-in agents on the same pinned dataset. Oracle should pass;
nop should fail:

```bash
HARBOR=$HOME/.venvs/harbor/bin/harbor
DATASET='datacurve/deep-swe-1-1@sha256:5affcd534fd90ac85d202d4c63f8b35ddc942140afdd5d60014a21365440a2f5'
$HARBOR run -d "$DATASET" -a oracle --n-attempts 1 --enable-verification -y -o benchmarks/results/oracle-preflight
$HARBOR run -d "$DATASET" -a nop    --n-attempts 1 --enable-verification -y -o benchmarks/results/nop-preflight
```

A one-task smoke preflight can append `--include-task-name
datacurve/termenv-preserve-ansi-resets`. Full 113-task oracle validation is expensive in
time and disk but does not use model inference.

## Scoring

Score one arm's Harbor output tree:

```bash
python3 benchmarks/harbor/score.py benchmarks/results/harbor-deepswe-v1.1/core \
  --strict --expected-tasks 113 \
  --json-out benchmarks/results/harbor-deepswe-v1.1/core-score.json \
  --out benchmarks/results/harbor-deepswe-v1.1/core-score.csv
```

Semantics:

- verifier reward `1` is a pass;
- reward `0` is a fail;
- agent and verifier timeouts score zero;
- missing rewards, grader crashes, and infrastructure exceptions are incomplete,
  not silently scored;
- strict mode exits nonzero if incomplete tasks remain;
- retries may exist in artifacts, but only the newest per-task result is used;
- a confirmed harness bug voids every affected attempt; fix the harness and
  rerun those tasks rather than counting contaminated outputs.

This is a single-attempt pass rate. It is not the official three-attempt AA-style
pass@1 estimate.

## Auto-mode verifier boundary

The official hidden verifier is never exposed to the agent. Auto's internal
validation is deliberately weaker: a Luna judge inspects visible bash/test
outputs and the final answer. If no meaningful visible repository check passed,
the judge must not mark the attempt verified. It cannot invoke or infer the
hidden verifier result.

## Artifact requirements

Keep the complete Harbor output tree. Do not commit large benchmark artifacts
or credentials. The important audit artifacts are `config.json`,
`result.json`, agent events/transcripts, verifier output, collected patches,
launcher logs, and the scoring JSON/CSV.
