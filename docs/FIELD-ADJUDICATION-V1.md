# Deterministic v1 patch adjudication

Model calls: **0**. Model replay cost: **$0**.

`scripts/sonion-field-replay.mjs` independently reconstructs completed v1 patches under `.suffice/field-adjudication-v1`. It does not change original v1 actors, patches, frozen inputs or results. It normalizes dependency container paths to their installed `node_modules`, restores original test files using `sonion-data-v2.py`, then runs original native commands before private overlays. Native and private commands run sequentially through the same `executeIsolated` namespace with networking disabled, matching historical controls. Runtime/process limits remain the host adapter limits.

Native exit codes, known Mocha failure names and available original runner test counts are checked. Count preservation is stronger evidence than exit code alone, but runner totals are not proof that every possible behavior was tested. Nano Stores fake-timer suites can report entire files as aggregate passing tests. Build/type commands have no behavioral count. Private checks must pass; test-runner checks with zero active tests do not pass adjudication.

Integration v1 results remain invalid for capability/cost comparison because the actors and original evaluator experienced dependency-layout errors. Passing replay only establishes submitted patch behavior under corrected evaluation. Other v1 cohorts require an independent actor/environment review before being labeled eligible.

Run remotely on Sonion with the existing two-core/nice SSH helper: `node scripts/sonion-field-replay.mjs`. One lock prevents parallel adjudication. Completed adjudications are retained and skipped on later invocations. Partial adjudications are preserved for inspection, never deleted or overwritten automatically. New completed v1 attempts can be picked up on a later invocation. Summary artifacts are written to `reports/field-adjudication-v1/summary.{md,json}`.

A report-only parser revision replaces a Unicode summary marker corrupted during stdin transport with ASCII token parsing. `manifest.parser-v1.json`, the initial source text and each affected `adjudication.parser-v1.json` are retained. Existing raw command receipts are reparsed without repeating native/private commands or changing v1 artifacts. Input revision history identifies the executed and corrected report parser versions.
