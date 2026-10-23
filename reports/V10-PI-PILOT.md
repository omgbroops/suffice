# Suffice v10 Pi pilot: prepared, awaiting sign-in

V10 uses Pi 1.2.0 with the existing Suffice AST navigation and codemode, plus the bounded test/arbitration/escalation controller. This corrects v9's separate native-CLI path. Requested models remain `gpt-6-luna` and `gpt-6.1-sol`; both appear in Pi's catalog.

**Live results are not available.** The benchmark command refused execution before creating any actor because Pi's separate subscription authentication is absent. One browser sign-in flow expired without completing. There have been zero v10 model calls and zero graded attempts. That is not a zero-percent acceptance result. The earlier rejected v9 CLI request still has unknown cost.

## Prepared comparison

The frozen plan schedules **16 attempts**: Luna alone, Sol alone, the minimal Luna→Sol ladder and v10, each on four tasks. Every arm uses the same Pi/codomode/AST tools and public checks; compact output is off. Worker/expert effort is high, independent writer/arbiter effort is low. This compares the controller bundle rather than attributing gains to navigation.

Two tasks are authored development exercises (retry and JSON-lines). Two are historical node-semver replays (prerelease subset and long build metadata) at `efa4be6096c1f9b77d9d27d6132f6220c43b4e31`. The original source fails both public issue reproductions and passes the accompanying four ordinary-regression tests. These are known development tasks, not held-out efficacy evidence.

The v10 campaign allowance is **$9 API-equivalent**, with $0.50 and 300 seconds per attempt. $1 of the previously approved $10 allowance is reserved for the unresolved v9 request. That reserve is not a measured charge. Each model request is conservatively reserved before dispatch, output tokens are bounded, and unknown receipts stop the campaign. These are estimate/accounting controls, not a provider invoice ceiling.

No new private evaluator material has been authored or loaded. After all actors close, author graders from the original contract/reference behavior without inspecting actor outputs, then grade sealed final snapshots. Local argv execution is not an OS secrecy boundary; publishable unseen evaluation still needs independent isolation.

## Offline validation

- **31 v10 tests passed.** A real Pi session with a local fake provider executes the registered `symbols` tool through codemode; other tests exercise AST reindexing, observation recovery, a tool-free reviewer, provider-boundary budget stops, reservation refusal, cancellation, skipped suites, checkpoint rollback and deferred grading.
- **59 combined v9/v10 tests passed.**
- Full suite: **304 tests, 248 passed, 49 failed, 7 skipped**. Failure names exactly match the untouched `28b40b6` Windows baseline (245 tests, 189 passed, 49 failed, 7 skipped). Existing failures include `/bin/sh`, symlink privileges and an old developer's hard-coded fixture path.

## Evidence and next action

[Plan](v10-pi-pilot-20261023/plan.json), [preflight](v10-pi-pilot-20261023/preflight.json), [status](v10-pi-pilot-20261023/status.json), [upstream receipt](v10-pi-pilot-20261023/upstream-receipt.json), [runtime hashes](v10-pi-pilot-20261023/runtime-files.json) and [exact frozen runtime](v10-pi-pilot-20261023/runtime.zip) preserve the prepared version. No execution or grading result is implied by these files.

Complete `npm run login`, confirm `npm run v10:preflight`, then run the prepared local plan at `.suffice/v10-pi-pilot-20261023/plan-final`. The runner verifies the frozen runtime and inputs before launching. A changed checkout requires a fresh plan rather than editing the existing one. See [V10 usage and protocol](../docs/V10.md).
