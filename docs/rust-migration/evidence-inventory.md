# Rust migration: research and evidence inventory

Historical data under `reports/` and `research/`, the original benchmark fixtures under `benchmarks/`, and `reports.zip` when tracked are evidence, not migration output. Preserve their bytes, provenance, schedules and limitations. Do not rerun paid campaigns, replace scores, tune on holdouts, or rewrite historical records to make a migration appear compatible. Produce new comparisons separately.

## Parity obligations

| Surface | Evidence and behavior | Verification |
| --- | --- | --- |
| Synthetic tasks | `benchmarks/README.md`, `benchmarks/tasks.mjs`, `benchmarks/manifest.json`: pilot, holdout and context catalogs; writable workspace only; hidden acceptance and reference patches stay outside the worker. Worker file access needs an actual boundary, not merely a temporary directory. | `node benchmarks/verify-tasks.mjs` and `node --test tests/tasks.test.mjs` check baseline visible pass, acceptance fail, patched pass and acceptance hashes. |
| Campaigns and resume | `scripts/experiment.mjs`, `scripts/run-pilot.mjs`, `scripts/freeze-sources.mjs`: frozen inputs/schedule and separate source snapshot; completed and failed rows stay immutable, resume only unattempted rows. `scripts/real-experiment.mjs` and `scripts/efficiency-experiment.mjs` have separate campaigns, baseline and acceptance hashes, limits, and skip completed results; real runner removes partial run directories before retry. | Inspect campaign manifests and run outputs; `tests/harness-policy.test.mjs`, `tests/real-policy.test.mjs`, `tests/budget.test.mjs`. Do not launch model campaigns for parity. |
| Reporting and budget | `scripts/report.mjs` and `tests/report.test.mjs`: include missing scheduled executions; distinguish operational outcome, acceptance, unknown cost and conservative ledger reservations. Other reports document task-specific limitations. | `node --test tests/report.test.mjs tests/budget.test.mjs tests/harness-policy.test.mjs` |
| Upstream fixtures | `scripts/fetch-real.mjs`, `scripts/fetch-workflow.mjs`, `scripts/prepare-*.mjs` pin revisions, hashes, reference material and receipt information. Real, workflow and efficiency graders are Node test fixtures. | Preserve original fixture bytes and retain Node execution compatibility; avoid fetching or regenerating historical evidence. |
| Platform distribution | `package.json` distributes the Node CLI. `.github/workflows/desktop.yml` tests Windows/macOS with pinned Node and Bun, frozen dependencies, desktop build and serialized tests; its separate installer job verifies offline smoke and checksums. | Match required platform and packaging behavior explicitly; native executable packaging requires new validation. |

## Offline preservation and measurements

Before modifying the original checkout, create a baseline manifest from its tracked files, including implementation, scripts, benchmarks, reports and research. For an extracted snapshot without Git metadata, supply the original repository and commit:

```sh
node scripts/rust-migration/verify-preservation.mjs --mode=create --root=PATH_TO_ORIGINAL_SNAPSHOT --git-root=PATH_TO_GIT_REPOSITORY --revision=COMMIT --manifest=PATH_TO_NEW_MANIFEST.json
node scripts/rust-migration/verify-preservation.mjs --mode=verify --root=PATH_TO_CHECKOUT --manifest=PATH_TO_NEW_MANIFEST.json
```

The verifier hashes all tracked baseline paths, reports changed and missing files, and never changes them. It does not check new untracked files or recover a baseline; store the manifest and original snapshot separately. Intentional implementation changes appear in its output and must be distinguished from changes to historical evidence. Capture before changes; do not recreate the manifest from changed source. Paths and hashes are recorded in plain JSON.

Measure the original CLI before changes, using a new output path:

```sh
node scripts/rust-migration/baseline-walk.mjs --root=PATH_TO_ORIGINAL_CHECKOUT --output=PATH_TO_NEW_BASELINE.json --runs=5
```

The harness builds an isolated deterministic 600-directory, 9,600-file fixture in the OS temporary directory, validates exclusion of hidden paths, `node_modules` and symlinks where supported, warms `filesIn` once, records raw repeated in-process walk durations, and measures fresh subprocess `--version` startup. It records runtime, OS and CPU; deletes its own temporary directory; makes no provider calls. Compare like-for-like on the same machine with raw samples and correctness checks, not a single timing or a claim about model performance. `--output` is exclusive-create to protect existing data. Timing varies with filesystem cache and host load; cold means a new CLI process, not a cold operating-system cache.

Baseline snapshot commit: `a5116549cf847d4e4e2d764b9d6300e7b5038633`; archive SHA-256: `764f39ac9793a3853b1435aa2ede6c15b70f7345cc206118a0226a279cb04962`. The recorded manifest has 778 tracked paths. Recorded timing samples are in `measurements/baseline-walk.json`.
