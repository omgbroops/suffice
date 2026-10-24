# V11 / native Codex: SWE-bench Pro V2

This is a proposed eight-task **compatible subset** comparison, separate from the 27 known Exercism development tasks. It is not a full SWE-bench Pro score. No task is chosen using V11, native Codex, gold-patch or hidden-test outcomes.

The official V2 release is pinned to [`66f92766bba642462d4bbe5479e83f91f9211862`](https://github.com/scaleapi/SWE-bench_Pro-os/tree/66f92766bba642462d4bbe5479e83f91f9211862/v2). It has 642 tasks with public `instruction.md`, task images, reference patches and verifiers. The old `src/v4-swebpro.mjs`, Docker Hub images and historical manifests belong to V1 and are not used here.

## Qualification

`node scripts/v11-swepro-prepare.mjs <output-root> [candidate-limit]` performs **unpaid, public technical qualification only**. It verifies the upstream revision and release file checksums, pulls the official Linux images and runs the exact V11 snapshot primitive against each unmodified task workspace, including ignored files.

Tasks are hash-ranked using seed `suffice-v11-swepro-v2-20261023`, round-robin across hash-ranked repositories. The first eight compatible tasks form the subset. Every examined candidate and exclusion is recorded. V11 currently permits at most 5,000 regular files and 64 MB, with no symlinks or submodules. Dependencies are not removed or relocated to make a task fit. An image or source compatibility failure is a benchmark prerequisite failure, not a model failure. Qualification may fail to produce eight tasks.

Image pulls are serial. Host free-space receipts are saved before each pull and after each probe; qualification stops below 32 GiB of available space. Existing user images and volumes are preserved.

Windows line-ending conversion is corrected by restoring exact files from the pinned Git blobs and checking the official SHA256SUMS; executable verifier scripts must remain byte-identical to the release.

## Required execution gates

Before any paid SWEPro attempt, the following remain mandatory:

- Freeze all eight instructions, unmodified verifier assets, source inventories, reference validation receipts, runtime hashes and immutable Docker image IDs. Test the gold patch and empty patch through the **unchanged V2 verifier** under the final verifier environment. Gold must pass and empty must fail; failures halt setup rather than replace tasks based on outcomes.
- Build isolated actor images containing the public repository, public existing tests, runtime and dependencies. Probe that `/tests`, `/solution`, acceptance patches, reference solutions and fixing Git objects/reflogs are unavailable. The actor must never receive evaluator paths, selected hidden test lists or gold-derived localization hints.
- Both arms receive the complete official `instruction.md`, existing base-commit tests, the same toolchain and 50-minute deadline. V11 uses Luna high and Sol advisory/recovery/takeover; native uses a fresh Sol high session. All API-equivalent usage is recorded; there is no monetary campaign cap.
- Each actor gets the official resource allocation of one CPU and 4 GB. It preserves the task image's HOME, existing toolchain PATH precedence and source files. The controller runs Node 24 at a private path. Actors run as root inside containers with all capabilities dropped and no host socket. Git reflogs, active hooks and transient pseudo-refs are removed; fixing objects and unreachable objects must be absent. `effective-container-args.json` records the actual resource limits and entry mode after adapting the shared container helper.
- Run an internal Docker network with only the model-endpoint CONNECT proxy available. Direct egress and ordinary web access must fail. Keep Pi and native credential stores opaque. All sixteen actors run serially in the frozen seeded pair order. Two 4 GB actors exceed the available Docker VM memory once shared services are included. The SWEPro campaign starts after the 27-task campaign's coding and grading finish, avoiding shared resource contention and authentication refresh races.
- All eight images must execute a local V11 worker-tool smoke test and the private Node runtime. Then both clients complete the same discarded public identity-function canary in a fresh `/tmp` workspace on one representative SWE overlay. These canaries never run acceptance tests, are discarded before official actors, and have separately recorded setup costs. Both must pass with known usage and confirmed client closure before the plan freezes.
- Seal every actor's patch, source, usage and closure receipts before running **any candidate acceptance grader**. Grade patches in pristine official images, never in actor sandboxes. The verifier keeps its official public network permission because some Go tasks download dependencies during verification. No private grader output can trigger retries, repairs or escalation.
- Report private acceptance results separately from actor verification/status, infrastructure failures, policy violations, API-equivalent cost and elapsed time. State subset selection and resource adaptations explicitly.

The official verifier's completed reward remains a separate raw score. Missing rewards and timed-out or broken Docker processes are unknown. Required-case observations authenticate verification separately: unrelated output cannot establish a real test failure. A gold patch must pass every required case. An empty baseline with missing cases halts setup for blind diagnosis; it is not automatically replaced. A legitimate compile/import failure caused by a missing publicly required API needs an explicit diagnostic review before it can be accepted as baseline evidence.

Private grading can resume using authenticated cached receipts. Interrupted output is preserved before retry, and the identical sealed patch is replayed on a fresh image. At most two confirmed Docker/setup retries are automatic; a candidate timeout or incomplete test run alone does not trigger a retry. No retry launches a coding actor. Missing or incompletely sealed actor sources stay ungraded. First-attempt logs and retry counts remain available.

Canary setup accounting includes all preserved runs, including failed or repeated preflights. An interrupted run without complete usage makes the setup total unknown while retaining its known cost floor. Earlier setup charges are never erased by a later successful canary.

## Serial runbook

Wait until the latest V11 Poly27 campaign's coding **and grading** finish before any SWE Docker preparation. Its `execution-complete.json` closes coding only; private graders may still be running. Use its completed root (currently intended: `.suffice/poly27-v11-20261023-r2`) and immutable `actorImage` from that root's `plan.json`. The interrupted `r1` root is not a valid origin. Keep image pulls, reference verifiers, actor inspections and coding actors serial to fit the shared Docker VM.

```powershell
node scripts/v11-swepro-prepare.mjs .suffice/v11-swepro-v2-20261023 33
node scripts/v11-swepro-grade.mjs .suffice/v11-swepro-v2-20261023
node scripts/v11-swepro-build.mjs .suffice/v11-swepro-v2-20261023 <completed-27-actor-image-sha256>
node scripts/v11-swepro-bench.mjs inspect .suffice/v11-swepro-v2-20261023 .suffice/poly27-v11-20261023-r2
node scripts/v11-swepro-bench.mjs canaries .suffice/v11-swepro-v2-20261023
node scripts/v11-swepro-bench.mjs plan .suffice/v11-swepro-v2-20261023
node scripts/v11-swepro-bench.mjs run .suffice/v11-swepro-v2-20261023
node scripts/v11-swepro-bench.mjs grade .suffice/v11-swepro-v2-20261023
```

The second command is the exact gold/empty **reference validation** command. `inspect` performs local/runtime/model/isolation probes without inference; `canaries` is the separate paid model/tool smoke. `run` executes sixteen official actors one at a time in the frozen seeded pair order, preserving separate opaque authentication stores. `grade` authenticates all sixteen terminal closure records and every available patch before running any private candidate verifier. The harness records setup/model campaign costs separately and reports the eight-task subset without presenting it as the full 642-task score.

Qualification alone does not establish campaign readiness; it establishes which unmodified repositories the current V11 runtime can actually handle. No accuracy result is available until execution and fresh-image grading complete.
