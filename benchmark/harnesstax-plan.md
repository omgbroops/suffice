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
model generation, harness versions and repetition count differ. The common cap is
60 model responses, preserving V1's existing hard limit, rather than the paper's
100 native turns. Tool-call ceiling is 240; V1's native internal tool counter also
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
