# Adaptive effort bounded protocol

This is an independent extension of the pinned Suffice/Pi harness in the adaptive-effort worktree. Main A/B/C remains frozen. No research claim in the supplied proposal is treated as a verified paper result.

Model: subscription-backed openai/gpt-6.1-sol, Pi 1.2.0. All arms use identical solo codemode, TypeScript AST navigation, visible tools and source-only js-yaml snapshots. Fixed low and medium differ only in thinkingLevel. Adaptive begins low and switches monotonically to medium after two failed visible regression validations at distinct edit versions, or nine assistant messages without any successful edit. No hidden acceptance feedback enters the session. Repeated checks on the same edit do not count as distinct failed repairs. Successful visible regression validation resets the failure count. This deliberately narrow controller ignores uncertainty language and does not use auxiliary inference.

Actual outgoing payload reasoning.effort and model are recorded by Pi before_provider_request. Session state alone is insufficient. These payload fields confirm request application, not inaccessible internal provider reasoning execution. Full reasoning text is excluded from public events. Separate reasoning-token telemetry may not be exposed by Pi and must not be inferred from output tokens.

Pilot: low, medium, adaptive on fresh historical aliased merge-source validation repair. Freeze inputs and fixture manifests before first request. At most three screening attempts. Scored candidate tasks: BOM document boundaries and whitespace-only block scalar termination, two repetitions in rotating low/medium/adaptive order (12 scored attempts). These issue families are fresh relative to prior semver and main A/B/C tasks but public historical issues may have training contamination. They are from one repository; two scored tasks are too few for a general capability conclusion.

Equal per-attempt budget: 18 assistant turns, 240 seconds, $0.18 known API-equivalent inference ceiling checked after a message (one-message overshoot possible), 100 tool calls. Campaign $3 known ceiling including pilot and retries; launch reserve stops at $2.82. Costs from incomplete provider calls remain unknown, with available known costs retained. Engineering-agent inference is excluded and this is not total project cost or subscription billing. There is no auxiliary model, manual repair or fallback.

Frozen hidden acceptance is outside the workspace and inaccessible through tools. Final score requires completed execution, independently executed acceptance, immutable visible tests/package files, original upstream regression suite with original expected count and zero skipped/cancelled/todo tests, correct model IDs and matching outgoing effort fields. Patch acceptance is also reported separately for capped/time-limited attempts. All model edits and failures are retained. Reference patches must pass the same acceptance and upstream tests and original baselines must fail assertions before pilot.

Source-only fixture excludes docs/assets/full Git history, distributions, dependency-heavy fuzzing and performance stress tests. Original test/core is preserved. Max new experiment artifacts 100 MiB, min disk free 1 GiB. No packages/junction changes. Concurrent campaigns are allowed; cache and latency comparisons are observational and confounded by provider and machine overlap.

Commands:

    node scripts/prepare-adaptive.mjs
    node --test tests/adaptive.test.mjs
    node scripts/adaptive-experiment.mjs pilot
    node scripts/adaptive-experiment.mjs scored

Campaign identifiers are immutable: rerunning into an existing manifest is rejected. Preserve the pilot even if it finds easy tasks or provider failures. No accuracy-gain claim without actual baseline failures and active intervention. At equal total cost compare observed solved tasks and cost per success; counts under individual caps do not automatically prove an equal aggregate-budget win.
