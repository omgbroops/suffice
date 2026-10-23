# Polyglot 27 under a locked evaluation protocol

Run the exact `config/bench-manifest.polyglot27.json` development cohort with Suffice v10 and native Codex. This adopts the relevant [SWE-bench Pro V2 isolation/replay rules](https://github.com/scaleapi/SWE-bench_Pro-os/blob/main/v2/README.md); the resulting number is a **27-task polyglot score**, not a SWE-bench Pro score.

## Frozen task and agent inputs

- Canonical Aider/Exercism source commit `7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f`, archive SHA256 `331eb06fddbbc145e4a800b34c5afc2209b3664ce9a3267604fd9550b60bc68f`.
- Same public task text, skeletons and interface declarations for both arms. Tests, reference solutions, `.meta` and `.approaches` are withheld. Additional test files missing from upstream metadata are withheld too. C++ Catch framework support contains no exercise assertions and remains public.
- Incomplete C++/JavaScript skeletons receive frozen interface supplements with callable signatures/return shapes. These are public task information, provided before execution to both arms. These augmented inputs differ from some historical r27 runs.
- Rust uses pinned compiler 1.85.1. The decimal and pig-latin starters receive identical public, locked dependency supplements for both arms because their upstream reference solutions use libraries omitted from the starter manifests. Original manifest hashes and exact dependency versions are retained. All dependencies are cached before isolation.
- All 27 are previously used development tasks, explicitly marked `devSeen`/`contaminated` in the manifest. No unseen-task or contamination-free claim.

## Actor phase

Each complete agent runs in a fresh nonroot Linux container. It receives one public exercise, its own output directory, and an ephemeral private copy of its normal authentication store. There are no verifier/reference mounts, host checkout, sibling outputs, host home or Docker socket. Existing host authentication is not overwritten. Only the client's opaque refreshed auth file can carry forward through a private, ignored benchmark cache; task/session history does not. That private cache must never enter evidence archives.

Each attempt has its own internal Docker network. Its only model connection is through a CONNECT proxy allowing the exact TLS hosts `api.openai.com`, `chatgpt.com` and `auth.openai.com`. Direct external routing and arbitrary website access are probed before running. Dependencies are installed during image setup, not during the actor phase. Graders run with network disabled.

V10 retains its existing Pi controller, AST tools and codemode: Luna high implementation, Sol low public-spec test generation/arbitration, optional Sol high takeover. Its per-stage turn/tool/context limits remain. Native uses a pinned Linux Codex CLI with exact `gpt-6.1-sol` high, its native shell/apply_patch/code-mode host and the same controlled single-agent feature profile as the earlier comparison. No model or API-key fallback is allowed. Linux model availability, normal authentication and actual file/test tool execution must pass separate canaries.

There is one attempt per task and arm: **54 scheduled attempts**. Both have a 50-minute model/agent deadline, with additional bounded setup/sealing time. No practical dollar cap. One lane per arm avoids concurrent refreshes of the same client's credentials. A seeded task order is recorded before execution.

The public generated-check helper supports all six languages and reports actual framework test counts. It runs temporary source/build copies outside the actor workspace. It contains no acceptance tests. V10's existing conservative rule can classify compilation errors with zero executed cases as unverified; the environment does not fabricate a positive count to bypass that rule.

## Sealing and fresh grading

Before any actors run, every empty stub must fail for a source defect and every reference solution must pass with a positive, complete canonical test count. A broken toolchain/grader blocks the whole cohort. Setup failures and repairs are retained separately; tasks are not removed to improve a score.

Freeze source/runtime files, public fixtures, grader assets, validation evidence, model rates and both image IDs. Bind the plan digest into the execution-started record. The actor wrapper preserves original tests/build configuration/documentation and records violations. It seals a binary Git patch and source inventory after normal completion or agent timeout, including partial work. A container/host closure failure without a verified patch remains ungraded.

After **all 54 actors are terminal**, replay each saved patch against the pinned public baseline in a new grader container. Restore immutable build/control files and the original withheld test files; remove actor-generated tests and Python bytecode so only the fixed canonical acceptance suite determines the source verdict. Activate the canonical Java disabled tests, JavaScript xtests, Rust ignored tests and C++ all-tests switch. Rust runs the restored canonical integration targets, excluding source/reference-only unit tests from the acceptance count. Assertions remain unchanged. Require the reference test count with no omissions/skips for a pass. Missing evidence or infrastructure failures stay ungraded rather than receiving an invented verdict.

No independent verdict is passed to either actor/controller, used to select a checkpoint, or used to fund a retry. Report source acceptance separately from completion within operational/protection rules. Preserve failed attempts, unknown costs, raw transcripts, sealed patches, grading logs and setup canaries.

## Accounting and interpretation

Use the same frozen Pi catalog base input/cache/output rates for both arms and retain raw usage receipts. These are API-equivalent estimates rather than subscription invoices; native aggregate receipts cannot establish per-request long-context surcharges. Unknown costs remain null with any known floor.

Report all 27 task pairs, source passes, policy-valid passes, paired outcomes, cost, latency, repairs/takeovers, errors and ungraded tasks. Compare historical Opus/rescue results only as context: the models, runtime, public interface supplements and evaluation protocol differ.

## Commands

```powershell
node scripts/poly27-prepare.mjs --output .suffice/poly27-protocol-20261023-r2
node scripts/poly27-build.mjs .suffice/poly27-protocol-20261023-r2 <verified-native-linux-package>
docker build --target actor -t suffice-poly27-actor:20261023-r2 .suffice/poly27-protocol-20261023-r2/build-context
docker build --target grader -t suffice-poly27-grader:20261023-r2 .suffice/poly27-protocol-20261023-r2/build-context
node scripts/poly27-bench.mjs inspect .suffice/poly27-protocol-20261023-r2 suffice-poly27-actor:20261023-r2
node scripts/poly27-bench.mjs canaries .suffice/poly27-protocol-20261023-r2
node scripts/poly27-evaluate.mjs validate .suffice/poly27-protocol-20261023-r2 <immutable-grader-image-id>
node scripts/poly27-bench.mjs plan .suffice/poly27-protocol-20261023-r2 suffice-poly27-grader:20261023-r2
node scripts/poly27-bench.mjs run .suffice/poly27-protocol-20261023-r2
node scripts/poly27-evaluate.mjs grade .suffice/poly27-protocol-20261023-r2 <immutable-grader-image-id>
```

Do not rerun a started cohort or modify its frozen files. Repair setup before freezing, or record a separate version/cohort.
