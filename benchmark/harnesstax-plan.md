# HarnessTax cohort, Sol 6.1, single round

Authorized scope: 30 Terminal-Bench 2.0 tasks, four configurations, one attempt
per task/configuration (120 attempts). No second repetition or replacement runs.

The cohort is recovered from HarnessTax's public paired task breakdown at website
commit `6e6a648a070012c509be584f4013f7786fe3559d`. The dataset is pinned to
`69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`, the Harbor registry's 2.0 revision.
Harbor 0.24.0 supplies the Docker environments and original post-agent verifier.

Configurations:

| Arm | Runtime/model | Effort |
| --- | --- | --- |
| codex | Native Codex 0.163.0, GPT-6.1-Sol | High |
| pi | Stock Pi 1.2.0 CLI, GPT-6.1-Sol | High |
| v1 | Unchanged Suffice Flexible baseline, GPT-6.1-Sol | High |
| v2 | Existing Efficient pipeline, GPT-6-Luna; selective GPT-6.1-Sol assistance | High worker, Low advisor/takeover |

All use Standard service and the existing Sonion subscription authentication.
Stock Pi retains its own prompt and four tools; Suffice retains codemode and AST
navigation. No production defaults change. There are no globally added skills.

This is an adapted comparison, not a reproduction of the published point estimates:
model generation, harness versions and repetition count differ. Following the
user amendment below, the common cap is 100 model responses; native harness turn
definitions can differ. Tool-call ceiling is 240; V1's native internal tool counter also
remains unchanged. Each attempt has a $5 API-equivalent cost guard, checked between
responses (one response can cross the cap). Task-specific original wall-clock and
Docker resource limits remain in force. Setup and evaluation durations are recorded
separately from agent execution. Concurrency starts at one because Sonion has an
8 GiB Docker VM and unrelated existing containers. Do not stop those containers.

The task instruction is identical across arms. V2 public checks may only be taken
from explicit examples/requirements in that instruction; plans are frozen before
inference. Missing public coverage must be reported. Private tests and solutions
are never supplied to actors, preparation, guidance or Sol escalation. The official
verifier runs only after the actor exits; no rerun uses grader feedback.

Freeze task, source, dependency, model-price and adapter hashes before inference.
Rotate arm ordering by task. Keep all failures, timeouts, capacity errors and unknown
costs. No automatic whole-attempt retries. Collect native events, per-response token
and cache usage, cost estimates, actual identities/efforts, latency, public checks,
Sol stages and official rewards. API-equivalent estimates are not subscription
charges or a conversion to plan quota. Record quota snapshots separately; other
account activity means their difference is not an exact campaign attribution.

Primary references:
- https://harnesstax.github.io/
- https://github.com/HarnessTax/HarnessTax.github.io/tree/6e6a648a070012c509be584f4013f7786fe3559d
- https://github.com/harbor-framework/terminal-bench-2/tree/69671fbaac6d67a7ef0dfec016cc38a64ef7a77c
- https://github.com/harbor-framework/harbor/tree/77d2f1530027f370111288f3c3c3e89c65ce8a22

Historical Pi mean: $0.420517 per attempt on GPT-5.6-Sol High, including failures.
Do not treat that historical price or score as a contemporaneous control.

## User amendment, before the second scheduled attempt

The user explicitly authorized a 100-response limit. V1 now accepts an explicit
`maxTurns` option; its production default stays 60. All remaining attempts use 100.
The first scheduled Codex attempt made zero model responses, failed on provider
connection, and is preserved. Its 60-response cap never bound. No replacement run.

Read current weekly subscription usage before admitting each new attempt. At
40% remaining or less, pause if fewer than 100 attempts are complete. At 100/120
or later, the user authorized finishing the round. Missing quota information stops
admission. Do not redeem resets. An active attempt can finish before the pause.

The first task image lacked system CA certificates, causing the native Codex
HTTP client to fail before inference. Agent installation now supplies the host's
standard CA bundle via `SSL_CERT_FILE`, hashed in the amended runtime manifest;
TLS verification is not disabled. Node already carries its own CA bundle.

## Scheduling and recovery amendment, after two actors

At the user's request to speed up the queue, remaining attempts may run two at
a time with at most 4 GiB of combined task memory reservations. Tasks above 2 GiB
run alone, retaining original resource limits. Admission checks quota separately
for every attempt. At a pause, at most two already admitted attempts may finish.
Shared host resources can affect latency; this change is not a harness improvement.

Each Harbor trial runs in a separate process so adapter environment variables
cannot cross between actors. Refreshed credentials are published atomically and
unchanged credential copies are not written back. Prompts, model settings, tools,
checks and budgets stay frozen. A detached Windows supervisor launches WSL,
updates reports, and records controller exit. It does not restart failed attempts.

The first Pi actor and official grader had completed when the original host
controller disappeared during artifact collection. Its existing reward and all
receipt files are recovered with container-to-host hash checks. No actor or
verifier is rerun; missing outer timings and artifact finalization remain missing.

## Timeout collection amendment, after attempt 55

An outer Harbor timeout skipped the adapter's receipt download on
make-doom-for-mips-v1. That original failure and its unknown cost remain untouched.
For remaining attempts only, /receipts is bind-mounted to the trial's host log
directory. A process-group wrapper stops the timed-out actor before grading;
completed response receipts remain available even without a final worker aggregate.
Missing final accounting stays unknown, with any observable cost shown as a floor.
Recorded task timeouts no longer stop admission of unrelated remaining jobs.
Provider/account failures, unexplained missing receipts, and quota failures still
stop admission. No task retries, extra actor time, or hidden-test-driven changes.

## Private receipt ownership repair

The live receipt mount exposed a host permissions error: Suffice writes private
mode-0600 files as container root, while the host controller runs as Eric Qin.
Harbor transfers ownership during cleanup, after the adapter reads the aggregate.
Affected completed attempts retain their original missing grades and exceptions.
Reports distinguish ungraded infrastructure failures from graded rejections.
Remaining adapters read the aggregate as root inside the container, before grading;
receipts and their original permissions stay unchanged. The repair was verified
with the actual permissions failure in a Docker container with networking disabled.
